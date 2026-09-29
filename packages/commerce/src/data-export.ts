import "server-only";
import { withTenant, type TenantTx } from "@storevia/database";
import { consumeRateLimit } from "@storevia/security/server";
import {
  recordAudit,
  requirePermission,
  requireRecentAuthentication,
  scopeOf,
  type OrganisationContext,
} from "@storevia/tenancy";
import { DomainError } from "@storevia/types";

// Organisation data export (M8, docs/database/data-lifecycle.md): everything
// the organisation holds, as one JSON document streamed in pages. Owners
// only (organisation.export) after a recent password confirmation; audited
// and limited to a few per hour.
//
// Left out on purpose: payment credentials, webhook secrets, checkout and
// order-link tokens, domain verification tokens, storage keys and other
// internal references. Nothing here is needed to move the business
// elsewhere, and each would be a secret in a downloaded file.

export const EXPORT_FORMAT_VERSION = 1;
const PAGE = 500;
/** Exports per organisation per hour. */
const EXPORT_LIMIT = { name: "organisation-export", limit: 3, windowSeconds: 3600 } as const;

type Row = Record<string, unknown> & { id: string };
type Fetch = (tx: TenantTx, storeId: string, after: string | undefined) => Promise<Row[]>;

const byId = (after: string | undefined) => ({
  orderBy: { id: "asc" as const },
  take: PAGE,
  ...(after ? { cursor: { id: after }, skip: 1 } : {}),
});

/** Per store, in this order. Each fetch pages by id within the store. */
const TABLES: readonly (readonly [string, Fetch])[] = [
  ["products", (tx, storeId, after) => tx.product.findMany({ where: { storeId }, ...byId(after) })],
  [
    "variants",
    (tx, storeId, after) => tx.productVariant.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "collections",
    (tx, storeId, after) => tx.collection.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "media",
    (tx, storeId, after) =>
      tx.mediaAsset.findMany({
        where: { storeId, status: { not: "DELETED" } },
        omit: { storageKey: true, renditions: true, sha256: true },
        ...byId(after),
      }),
  ],
  [
    "customers",
    (tx, storeId, after) => tx.customer.findMany({ where: { storeId }, ...byId(after) }),
  ],
  ["orders", (tx, storeId, after) => tx.order.findMany({ where: { storeId }, ...byId(after) })],
  [
    "orderLines",
    (tx, storeId, after) => tx.orderLine.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "orderAddresses",
    (tx, storeId, after) => tx.orderAddress.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "orderTaxLines",
    (tx, storeId, after) => tx.orderTaxLine.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "payments",
    (tx, storeId, after) =>
      tx.payment.findMany({
        where: { storeId },
        omit: { idempotencyKey: true, redirectUrl: true },
        ...byId(after),
      }),
  ],
  [
    "refunds",
    (tx, storeId, after) =>
      tx.refund.findMany({ where: { storeId }, omit: { idempotencyKey: true }, ...byId(after) }),
  ],
  [
    "fulfilments",
    (tx, storeId, after) => tx.fulfilment.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "orderMessages",
    (tx, storeId, after) => tx.orderMessage.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "discounts",
    (tx, storeId, after) => tx.discount.findMany({ where: { storeId }, ...byId(after) }),
  ],
  ["pages", (tx, storeId, after) => tx.page.findMany({ where: { storeId }, ...byId(after) })],
  [
    "publishedPageVersions",
    (tx, storeId, after) =>
      tx.pageVersion.findMany({ where: { storeId, state: "PUBLISHED" }, ...byId(after) }),
  ],
  [
    "themes",
    (tx, storeId, after) => tx.storeTheme.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "navigation",
    (tx, storeId, after) => tx.navigation.findMany({ where: { storeId }, ...byId(after) }),
  ],
  // The store's public seller identity (one row per store, never paged)
  // and its policies, drafts and published copies (final pass, Phase 2A).
  [
    "sellerProfile",
    (tx, storeId) =>
      tx.storeSellerProfile.findMany({ where: { storeId } }) as unknown as Promise<Row[]>,
  ],
  [
    "policies",
    (tx, storeId, after) => tx.storePolicy.findMany({ where: { storeId }, ...byId(after) }),
  ],
  [
    "domains",
    (tx, storeId, after) =>
      tx.storeDomain.findMany({
        where: { storeId },
        omit: { verificationToken: true, providerRef: true },
        ...byId(after),
      }),
  ],
];

/** JSON with BigInt amounts as strings (exact) and dates as ISO strings. */
const json = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

/**
 * Checks permission, step-up and the rate limit, records the export, then
 * returns the document as a stream of JSON text chunks.
 */
export async function exportOrganisationData(
  ctx: OrganisationContext,
): Promise<AsyncGenerator<string>> {
  requirePermission(ctx, "organisation.export");
  requireRecentAuthentication(ctx, "exporting the organisation's data");
  const limit = await consumeRateLimit(EXPORT_LIMIT, ctx.organisationId);
  if (!limit.allowed) {
    throw new DomainError("RATE_LIMITED", "Too many exports. Try again in an hour.");
  }
  const scope = scopeOf(ctx);
  const { organisation, stores, members } = await withTenant(scope, async (tx) => {
    await recordAudit(tx, ctx, "organisation.exported", {
      type: "Organisation",
      id: ctx.organisationId,
    });
    return {
      organisation: await tx.organisation.findFirstOrThrow({
        where: { id: ctx.organisationId },
        select: { id: true, name: true, country: true, billingEmail: true, createdAt: true },
      }),
      stores: await tx.store.findMany({
        where: { organisationId: ctx.organisationId },
        orderBy: { createdAt: "asc" },
      }),
      members: await tx.membership.findMany({
        where: { organisationId: ctx.organisationId },
        select: {
          role: true,
          status: true,
          allStores: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
    };
  });
  return stream(scope, organisation, stores, members);
}

async function* stream(
  scope: ReturnType<typeof scopeOf>,
  organisation: unknown,
  stores: readonly (Record<string, unknown> & { id: string })[],
  members: unknown,
): AsyncGenerator<string> {
  yield `{"format":"storevia-export","version":${String(EXPORT_FORMAT_VERSION)}`;
  yield `,"exportedAt":${json(new Date())},"organisation":${json(organisation)}`;
  yield `,"members":${json(members)},"stores":[`;
  for (const [i, store] of stores.entries()) {
    yield `${i > 0 ? "," : ""}{"store":${json(store)}`;
    for (const [name, fetch] of TABLES) {
      yield `,${json(name)}:[`;
      let after: string | undefined;
      let first = true;
      for (;;) {
        const rows = await withTenant(scope, (tx) => fetch(tx, store.id, after));
        for (const row of rows) {
          yield `${first ? "" : ","}${json(row)}`;
          first = false;
        }
        if (rows.length < PAGE) break;
        after = rows.at(-1)?.id;
      }
      yield "]";
    }
    yield "}";
  }
  yield "]}";
}
