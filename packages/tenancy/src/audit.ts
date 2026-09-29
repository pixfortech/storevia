import "server-only";
import type { TenantTx } from "@storevia/database";
import type { RequestInfo, TenantContext } from "./context";

/**
 * Metadata keys that may appear in audit entries. Anything else is dropped,
 * so secrets, tokens or payment data can't leak into the audit log by accident
 * (docs/architecture/01 §7, threat-model §4.9).
 */
const ALLOWED_METADATA_KEYS = new Set([
  "role",
  "previousRole",
  "status",
  "previousStatus",
  "fields",
  "slug",
  "previousSlug",
  "name",
  "email",
  "allStores",
  "storeCount",
  "targetUserId",
  // Billing and entitlements (ADR-0022): safe before/after values only.
  "reason",
  "plan",
  "previousPlan",
  "previousStatus",
  "interval",
  "previousInterval",
  "source",
  "trialEndsAt",
  "expiresAt",
  "previousExpiresAt",
  "feature",
  "value",
  "previousValue",
  "eventType",
  "providerEventId",
  "overLimit",
  "drift",
  "businessType",
  "previousBusinessType",
  // Catalogue and inventory (ADR-0027): identifiers and counts, never
  // descriptions, prices or free-text notes beyond the movement note.
  "title",
  "handle",
  "previousHandle",
  "sku",
  "code",
  "delta",
  "resultingValue",
  "quantity",
  "location",
  "fromLocation",
  "toLocation",
  "count",
  "variantCount",
  "createdVariants",
  "removedVariants",
  "deletedVariants",
  "mediaCount",
  "action",
  "succeeded",
  "failed",
  "filename",
  "bytes",
  "note",
  // Product taxonomy: global category codes (reference data, not tenant text).
  "category",
  "previousCategory",
  // Product classification and publishing: HSN codes are public reference
  // codes; confirmedFree records that a product priced at 0 was published on purpose.
  "hsnCode",
  "previousHsnCode",
  "confirmedFree",
  // Exports: the filters used and the row count, never the search text
  // (it can be a customer's email or name).
  "filter",
  "from",
  "to",
  "searched",
  // Site presentation (ADR-0030): identifiers and counts, never documents.
  "kind",
  "versionNumber",
  "sections",
  "preset",
  "theme",
  "previousTheme",
  "themeVersion",
  "menu",
  "items",
  // Orders, refunds and payment settings (ADR-0031): numbers, amounts and
  // provider names, never addresses, card data or credentials.
  "orderNumber",
  "amount",
  "currency",
  "provider",
  "mode",
  // Custom domains (ADR-0032): hostnames and states, never tokens or
  // provider responses.
  "hostname",
  "previousHostname",
  // Store logo and favicon: public media ids, never file names or URLs.
  "mediaId",
  "previousMediaId",
]);

/** Longer free text allowed for these keys (staff-entered reasons). */
const LONG_KEYS = new Set(["reason", "note"]);

export type AuditMetadata = Record<string, string | number | boolean | null>;

export function sanitiseMetadata(metadata: AuditMetadata | undefined): AuditMetadata | undefined {
  if (!metadata) return undefined;
  const clean: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (ALLOWED_METADATA_KEYS.has(key))
      clean[key] =
        typeof value === "string" ? value.slice(0, LONG_KEYS.has(key) ? 500 : 200) : value;
  }
  return clean;
}

export async function recordAudit(
  tx: TenantTx,
  ctx: TenantContext,
  action: string,
  entity: { type: string; id: string },
  metadata?: AuditMetadata,
): Promise<void> {
  const clean = sanitiseMetadata(metadata);
  await tx.auditLog.createMany({
    data: [
      {
        organisationId: ctx.organisationId,
        storeId: ctx.kind === "store" ? ctx.storeId : null,
        actorType: "USER",
        actorId: ctx.userId,
        action,
        entityType: entity.type,
        entityId: entity.id,
        ...(clean ? { metadata: clean } : {}),
        ipAddress: ctx.request.ipAddress ?? null,
        userAgent: ctx.request.userAgent ?? null,
        requestId: ctx.request.requestId ?? null,
      },
    ],
  });
}

/** An audit entry written by Storevia staff or the system, not a tenant member. */
export interface ActorAuditEntry {
  readonly organisationId: string | null;
  readonly actorType: "PLATFORM_STAFF" | "SYSTEM";
  readonly actorId: string | null;
  readonly action: string;
  readonly entity: { readonly type: string; readonly id: string };
  readonly metadata?: AuditMetadata;
  readonly request?: RequestInfo;
}

/**
 * Writes an audit row for a staff or system action (docs 03 §7). Runs in the
 * caller's transaction on the platform or system connection, so the audit row
 * commits or rolls back with the change it records.
 */
export async function recordActorAudit(tx: TenantTx, entry: ActorAuditEntry): Promise<void> {
  const clean = sanitiseMetadata(entry.metadata);
  await tx.auditLog.createMany({
    data: [
      {
        organisationId: entry.organisationId,
        storeId: null,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entity.type,
        entityId: entry.entity.id,
        ...(clean ? { metadata: clean } : {}),
        ipAddress: entry.request?.ipAddress ?? null,
        userAgent: entry.request?.userAgent ?? null,
        requestId: entry.request?.requestId ?? null,
      },
    ],
  });
}
