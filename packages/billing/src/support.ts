import "server-only";
import { platformDb } from "@storevia/database/platform";
import { storeAvailability, type StoreAvailability } from "@storevia/domains/resolver";
import { parsePublicId, recordActorAudit } from "@storevia/tenancy";
import {
  requirePlatformPermission,
  requirePlatformStepUp,
  type PlatformContext,
} from "@storevia/tenancy/platform";
import { DomainError, notFound, validationFailed } from "@storevia/types";

// Support tooling for platform-admin (M8). Diagnostics are read-only
// counts (no customer rows). Repairs are high-risk: platform.support.manage,
// a recent password, the target's name typed out, a reason, and an audit
// entry written in the same transaction. The platform database role can't
// change tenant tables; each repair is one narrow database function.

export const SUPPORT_METRICS = [
  "orders_30d",
  "last_order_epoch",
  "orders_unfulfilled",
  "payment_webhooks_failed_7d",
  "notifications_failed",
  "notifications_pending",
  "media_processing",
  "media_rejected_7d",
  "domains_not_active",
  "checkouts_open",
] as const;

export type SupportMetric = (typeof SUPPORT_METRICS)[number];

export interface StoreDiagnostics {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  readonly suspensionReason: string | null;
  /** What the storefront shows, by the storefront's own rule. */
  readonly storefront: StoreAvailability;
  readonly primaryHost: string | null;
  readonly metrics: Readonly<Record<SupportMetric, number>>;
  readonly lastOrderAt: Date | null;
}

export interface SupportDiagnostics {
  readonly organisationStatus: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED";
  readonly stores: readonly StoreDiagnostics[];
}

const isMetric = (value: string): value is SupportMetric =>
  (SUPPORT_METRICS as readonly string[]).includes(value);

export async function getSupportDiagnostics(
  ctx: PlatformContext,
  organisationPublicId: unknown,
): Promise<SupportDiagnostics> {
  requirePlatformPermission(ctx, "platform.organisation.read");
  const organisationId = parsePublicId("organisation", organisationPublicId);
  const db = platformDb();
  const org = await db.organisation.findUnique({
    where: { id: organisationId },
    select: { status: true },
  });
  if (!org) throw notFound();
  const [stores, rows, domains] = await Promise.all([
    db.store.findMany({
      where: { organisationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, status: true, suspensionReason: true },
    }),
    db.$queryRaw<{ store_id: string; metric: string; value: bigint }[]>`
      SELECT store_id, metric, value FROM app_support_diagnostics(${organisationId}::uuid)`,
    db.storeDomain.findMany({
      where: { organisationId, isPrimary: true, status: "ACTIVE" },
      select: { storeId: true, hostname: true },
    }),
  ]);
  const primary = new Map(domains.map((d) => [d.storeId, d.hostname] as const));
  return {
    organisationStatus: org.status,
    stores: stores.map((store) => {
      const metrics = Object.fromEntries(SUPPORT_METRICS.map((m) => [m, 0])) as Record<
        SupportMetric,
        number
      >;
      for (const row of rows) {
        if (row.store_id === store.id && isMetric(row.metric))
          metrics[row.metric] = Number(row.value);
      }
      return {
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
        suspensionReason: store.suspensionReason,
        storefront: storeAvailability({
          organisationStatus: org.status,
          storeStatus: store.status,
        }),
        primaryHost: primary.get(store.id) ?? null,
        metrics,
        lastOrderAt:
          metrics.last_order_epoch > 0 ? new Date(metrics.last_order_epoch * 1000) : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// High-risk repairs.
// ---------------------------------------------------------------------------

interface RepairInput {
  readonly reason?: unknown;
  readonly confirm?: unknown;
}

function authoriseRepair(ctx: PlatformContext, input: RepairInput, expected: string): string {
  requirePlatformPermission(ctx, "platform.support.manage");
  requirePlatformStepUp(ctx);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const confirm = typeof input.confirm === "string" ? input.confirm.trim() : "";
  const errors: Record<string, string> = {};
  if (reason.length < 10 || reason.length > 500)
    errors["reason"] = "Give a reason of 10 to 500 characters (it goes in the audit log).";
  if (confirm !== expected) errors["confirm"] = `Type ${expected} to confirm.`;
  if (Object.keys(errors).length > 0) throw validationFailed(errors);
  return reason;
}

/** Suspends (or restores) one store; every storefront instance drops it at once. */
export async function setStoreSuspension(
  ctx: PlatformContext,
  input: RepairInput & { readonly storeId?: unknown; readonly suspend: boolean },
): Promise<{ readonly status: string }> {
  requirePlatformPermission(ctx, "platform.support.manage");
  const storeId = parsePublicId("store", input.storeId);
  const db = platformDb();
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, slug: true, organisationId: true },
  });
  if (!store) throw notFound();
  const reason = authoriseRepair(ctx, input, store.slug);
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string | null }[]>`
      SELECT app_platform_set_store_suspension(${storeId}::uuid, ${input.suspend}, ${reason})
        AS status`;
    if (!row?.status) {
      throw new DomainError(
        "CONFLICT",
        input.suspend ? "This store can't be suspended now." : "This store isn't suspended.",
      );
    }
    await recordActorAudit(tx, {
      organisationId: store.organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: input.suspend ? "store.suspended" : "store.restored",
      entity: { type: "Store", id: store.id },
      metadata: { status: row.status, reason },
      request: ctx.request,
    });
    return { status: row.status };
  });
}

/** Suspends (or restores) a whole organisation: every store goes offline. */
export async function setOrganisationSuspension(
  ctx: PlatformContext,
  input: RepairInput & { readonly organisationId?: unknown; readonly suspend: boolean },
): Promise<void> {
  requirePlatformPermission(ctx, "platform.support.manage");
  const organisationId = parsePublicId("organisation", input.organisationId);
  const db = platformDb();
  const org = await db.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true },
  });
  if (!org) throw notFound();
  const reason = authoriseRepair(ctx, input, org.name);
  await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ changed: boolean }[]>`
      SELECT app_platform_set_organisation_suspension(${organisationId}::uuid, ${input.suspend})
        AS changed`;
    if (!row?.changed) {
      throw new DomainError(
        "CONFLICT",
        input.suspend
          ? "Only an active organisation can be suspended."
          : "This organisation isn't suspended.",
      );
    }
    await recordActorAudit(tx, {
      organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: input.suspend ? "organisation.suspended" : "organisation.restored",
      entity: { type: "Organisation", id: organisationId },
      metadata: { reason },
      request: ctx.request,
    });
  });
}

/** Puts an organisation's failed order emails back in the queue. */
export async function retryFailedOrderEmails(
  ctx: PlatformContext,
  input: RepairInput & { readonly organisationId?: unknown },
): Promise<{ readonly queued: number }> {
  requirePlatformPermission(ctx, "platform.support.manage");
  const organisationId = parsePublicId("organisation", input.organisationId);
  const db = platformDb();
  const org = await db.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true },
  });
  if (!org) throw notFound();
  const reason = authoriseRepair(ctx, input, org.name);
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ queued: bigint }[]>`
      SELECT app_platform_retry_order_notifications(${organisationId}::uuid) AS queued`;
    const queued = Number(row?.queued ?? 0n);
    await recordActorAudit(tx, {
      organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: "order.notifications_retried",
      entity: { type: "Organisation", id: organisationId },
      metadata: { count: queued, reason },
      request: ctx.request,
    });
    return { queued };
  });
}
