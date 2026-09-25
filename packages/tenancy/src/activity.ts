import "server-only";
import { withTenant } from "@storevia/database";
import { requirePermission, scopeOf, type TenantContext } from "./context";

/**
 * Recent activity for the dashboard home, read from the audit log. The
 * audit log is the only activity source that exists today, so this is what
 * the "Recent activity" module shows: real events, never sample data.
 *
 * Access mirrors the audit log itself: `audit.read` (owners and admins),
 * rows limited to the current organisation by RLS. A store context shows
 * that store's events plus organisation-wide ones, never another store's.
 * Only non-sensitive fields leave this function: no IP addresses, user
 * agents, request IDs or email addresses.
 */

/** Metadata keys a dashboard may show. A subset of the audit allow-list. */
const DISPLAY_KEYS = [
  "role",
  "previousRole",
  "status",
  "previousStatus",
  "name",
  // Product and collection titles: catalogue names, never personal data.
  "title",
  "plan",
  "previousPlan",
  "interval",
  "businessType",
  "previousBusinessType",
  "storeCount",
] as const;

export type ActivityDetailKey = (typeof DISPLAY_KEYS)[number];

export interface ActivityEntry {
  readonly id: string;
  readonly action: string;
  readonly occurredAt: Date;
  /** "you" is the current user; a member no longer in the organisation has no name. */
  readonly actor:
    | { readonly kind: "you" }
    | { readonly kind: "member"; readonly name: string | null }
    | { readonly kind: "staff" }
    | { readonly kind: "app" }
    | { readonly kind: "system" };
  readonly entityType: string | null;
  /** Internal store ID when the event belongs to a store. */
  readonly storeId: string | null;
  readonly details: Readonly<Partial<Record<ActivityDetailKey, string | number | boolean>>>;
}

const MAX_LIMIT = 50;

function displayDetails(metadata: unknown): ActivityEntry["details"] {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return {};
  const source = metadata as Record<string, unknown>;
  const details: Partial<Record<ActivityDetailKey, string | number | boolean>> = {};
  for (const key of DISPLAY_KEYS) {
    const value = source[key];
    if (typeof value === "string") details[key] = value.slice(0, 120);
    else if (typeof value === "number" || typeof value === "boolean") details[key] = value;
  }
  return details;
}

export async function listRecentActivity(
  ctx: TenantContext,
  options: { readonly limit?: number } = {},
): Promise<ActivityEntry[]> {
  requirePermission(ctx, "audit.read");
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 8), 1), MAX_LIMIT);
  // Organisation-wide events always; store events only for this store, or
  // for any store when a member with all-store access views the organisation.
  const storeFilter =
    ctx.kind === "store"
      ? { OR: [{ storeId: null }, { storeId: ctx.storeId }] }
      : ctx.allStores
        ? {}
        : { storeId: null };
  return withTenant(scopeOf(ctx), async (tx) => {
    const rows = await tx.auditLog.findMany({
      where: { organisationId: ctx.organisationId, ...storeFilter },
      select: {
        id: true,
        action: true,
        createdAt: true,
        actorType: true,
        actorId: true,
        entityType: true,
        storeId: true,
        metadata: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    const memberIds = [
      ...new Set(
        rows.flatMap((r) =>
          r.actorType === "USER" && r.actorId && r.actorId !== ctx.userId ? [r.actorId] : [],
        ),
      ),
    ];
    // RLS on User returns only current co-members, so former members stay unnamed.
    const names = new Map(
      memberIds.length === 0
        ? []
        : (
            await tx.user.findMany({
              where: { id: { in: memberIds } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name] as const),
    );
    return rows.map((row): ActivityEntry => {
      let actor: ActivityEntry["actor"];
      if (row.actorType === "USER")
        actor =
          row.actorId === ctx.userId
            ? { kind: "you" }
            : { kind: "member", name: (row.actorId ? names.get(row.actorId) : undefined) ?? null };
      else if (row.actorType === "PLATFORM_STAFF") actor = { kind: "staff" };
      else if (row.actorType === "API_KEY" || row.actorType === "APP") actor = { kind: "app" };
      else actor = { kind: "system" };
      return {
        id: row.id,
        action: row.action,
        occurredAt: row.createdAt,
        actor,
        entityType: row.entityType,
        storeId: row.storeId,
        details: displayDetails(row.metadata),
      };
    });
  });
}
