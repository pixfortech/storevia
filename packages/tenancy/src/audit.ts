import "server-only";
import type { TenantTx } from "@storevia/database";
import type { TenantContext } from "./context";

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
  "name",
  "email",
  "allStores",
  "storeCount",
  "targetUserId",
]);

export type AuditMetadata = Record<string, string | number | boolean | null>;

export function sanitiseMetadata(metadata: AuditMetadata | undefined): AuditMetadata | undefined {
  if (!metadata) return undefined;
  const clean: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (ALLOWED_METADATA_KEYS.has(key))
      clean[key] = typeof value === "string" ? value.slice(0, 200) : value;
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
