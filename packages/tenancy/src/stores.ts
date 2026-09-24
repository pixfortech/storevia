import "server-only";
import { withTenant } from "@storevia/database";
import { consumeUsage, releaseUsage } from "@storevia/entitlements";
import { notFound } from "@storevia/types";
import { conflict, generateTokenSafe } from "./internal";
import { createStoreSchema, updateStoreSchema } from "@storevia/validation";
import { recordAudit } from "./audit";
import {
  requirePermission,
  scopeOf,
  type OrganisationContext,
  type StoreContext,
  type TenantContext,
} from "./context";
import { isUniqueViolation, parseInput } from "./errors";

export interface StoreSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  readonly primaryHostname: string | null;
}

export interface StoreDetails extends StoreSummary {
  readonly currency: string;
  readonly country: string;
  readonly locale: string;
  readonly timezone: string;
  readonly contactEmail: string | null;
  readonly supportEmail: string | null;
  readonly createdAt: Date;
}

const summarySelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  domains: { where: { isPrimary: true }, select: { hostname: true }, take: 1 },
} as const;

/** Host part of STOREFRONT_ROOT_DOMAIN (dev values may carry a port). */
export function storefrontRootDomain(): string {
  const raw = process.env["STOREFRONT_ROOT_DOMAIN"] ?? "storevia.site";
  return raw.replace(/:\d+$/, "").toLowerCase();
}

/**
 * Creates a store in the context's organisation, plus its platform subdomain
 * (`{slug}.storevia.site`) as the primary domain. The store_count limit is
 * consumed atomically in the same transaction (LIMIT_REACHED when full).
 */
export async function createStore(
  ctx: OrganisationContext,
  input: unknown,
): Promise<{ storeId: string }> {
  requirePermission(ctx, "store.create");
  const data = parseInput(createStoreSchema, input);
  try {
    return await withTenant(scopeOf(ctx), async (tx) => {
      await consumeUsage(tx, ctx.organisationId, "store_count");
      const store = await tx.store.create({
        data: {
          organisationId: ctx.organisationId,
          name: data.name,
          slug: data.slug,
          currency: data.currency,
          country: data.country,
          locale: data.locale,
          timezone: data.timezone,
        },
        select: { id: true },
      });
      await tx.storeDomain.create({
        data: {
          organisationId: ctx.organisationId,
          storeId: store.id,
          hostname: `${data.slug}.${storefrontRootDomain()}`,
          type: "PLATFORM_SUBDOMAIN",
          status: "ACTIVE",
          isPrimary: true,
          verifiedAt: new Date(),
          verificationToken: generateTokenSafe(),
        },
        select: { id: true },
      });
      // A creator limited to specific stores keeps access to what they create.
      if (!ctx.allStores) {
        await tx.membershipStoreAccess.create({
          data: {
            membershipId: ctx.membershipId,
            organisationId: ctx.organisationId,
            storeId: store.id,
          },
        });
      }
      await recordAudit(
        tx,
        ctx,
        "store.created",
        { type: "Store", id: store.id },
        { slug: data.slug, name: data.name },
      );
      return { storeId: store.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That store address is already taken.", {
        slug: "That address is already taken.",
      });
    }
    throw error;
  }
}

/** Stores of the organisation that this membership may access. */
export async function listStores(ctx: TenantContext): Promise<StoreSummary[]> {
  requirePermission(ctx, "store.read");
  const rows = await withTenant({ ...scopeOf(ctx), storeId: null }, (tx) =>
    tx.store.findMany({
      where: {
        organisationId: ctx.organisationId,
        status: { not: "ARCHIVED" },
        ...(ctx.allStores ? {} : { memberAccess: { some: { membershipId: ctx.membershipId } } }),
      },
      select: summarySelect,
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    primaryHostname: row.domains[0]?.hostname ?? null,
  }));
}

export async function getStore(ctx: StoreContext): Promise<StoreDetails> {
  requirePermission(ctx, "store.read");
  const row = await withTenant(scopeOf(ctx), (tx) =>
    tx.store.findFirst({
      where: { id: ctx.storeId, organisationId: ctx.organisationId },
      select: {
        ...summarySelect,
        currency: true,
        country: true,
        locale: true,
        timezone: true,
        contactEmail: true,
        supportEmail: true,
        createdAt: true,
      },
    }),
  );
  if (!row) throw notFound();
  const { domains, ...rest } = row;
  return { ...rest, primaryHostname: domains[0]?.hostname ?? null };
}

export async function updateStore(ctx: StoreContext, input: unknown): Promise<void> {
  requirePermission(ctx, "store.update");
  const data = parseInput(updateStoreSchema, input);
  await withTenant(scopeOf(ctx), async (tx) => {
    const current = await tx.store.findFirst({
      where: { id: ctx.storeId, organisationId: ctx.organisationId },
      select: { status: true },
    });
    if (!current) throw notFound();
    if (current.status === "ARCHIVED") throw conflict("Archived stores can't be edited.");
    await tx.store.update({ where: { id: ctx.storeId }, data, select: { id: true } });
    await recordAudit(
      tx,
      ctx,
      "store.updated",
      { type: "Store", id: ctx.storeId },
      { fields: Object.keys(data).join(",") },
    );
  });
}

export async function archiveStore(ctx: StoreContext): Promise<void> {
  requirePermission(ctx, "store.archive");
  await withTenant(scopeOf(ctx), async (tx) => {
    const { count } = await tx.store.updateMany({
      where: { id: ctx.storeId, organisationId: ctx.organisationId, status: { not: "ARCHIVED" } },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    if (count === 0) throw conflict("This store is already archived.");
    // Archived stores don't count towards store_count (data is kept).
    await releaseUsage(tx, ctx.organisationId, "store_count");
    await recordAudit(tx, ctx, "store.archived", { type: "Store", id: ctx.storeId });
  });
}
