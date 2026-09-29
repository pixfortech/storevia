import "server-only";
import { withTenant } from "@storevia/database";
import { scopeOf, type TenantContext } from "@storevia/tenancy";
import { internalId, publicId } from "../internal";

// The notification centre (post-M7): the signed-in member's own in-app
// notifications across the organisation's stores. The database shows a
// member only their own rows (own_notifications); on top of that, a
// notification is shown only while the member can still act on it: their
// role still reads orders, and they still have access to the store. A
// member whose access was narrowed stops seeing the old ones.

export interface StaffNotificationView {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly read: boolean;
  readonly storeName: string;
  /** Dashboard path to the order (its messages, for a customer message). */
  readonly href: string;
}

export interface StaffNotificationList {
  readonly unread: number;
  readonly items: readonly StaffNotificationView[];
}

const EMPTY: StaffNotificationList = { unread: 0, items: [] };

/** The organisation-wide scope for this member (not narrowed to one store). */
const orgScope = (ctx: TenantContext) => ({ ...scopeOf(ctx), storeId: null });

export async function staffNotifications(
  ctx: TenantContext,
  options: { readonly limit?: number } = {},
): Promise<StaffNotificationList> {
  if (!ctx.permissions.has("order.read")) return EMPTY;
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  return withTenant(orgScope(ctx), async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
        title: string;
        created_at: Date;
        read_at: Date | null;
        store_id: string;
        store_name: string;
        order_id: string;
        kind: string;
        unread: bigint;
      }[]
    >`
      WITH visible AS (
        SELECT n.id, n.title, n."createdAt", n."readAt", n."storeId", n."orderId", n.kind, s.name
        FROM "StaffNotification" n JOIN "Store" s ON s.id = n."storeId"
        WHERE n."userId" = ${ctx.userId}::uuid
          AND n."organisationId" = ${ctx.organisationId}::uuid
          AND (${ctx.allStores} OR EXISTS (
            SELECT 1 FROM "MembershipStoreAccess" a
            WHERE a."membershipId" = ${ctx.membershipId}::uuid AND a."storeId" = n."storeId"))
      )
      SELECT v.id, v.title, v."createdAt" AS created_at, v."readAt" AS read_at,
        v."storeId" AS store_id, v.name AS store_name, v."orderId" AS order_id,
        v.kind::text AS kind,
        (SELECT count(*) FROM visible WHERE "readAt" IS NULL) AS unread
      FROM visible v
      ORDER BY v."createdAt" DESC, v.id DESC
      LIMIT ${limit}`;
    const unread = rows[0] ? Number(rows[0].unread) : 0;
    return {
      unread,
      items: rows.map((r) => ({
        id: publicId("notification", r.id),
        title: r.title,
        createdAt: r.created_at,
        read: r.read_at !== null,
        storeName: r.store_name,
        href: `/s/${publicId("store", r.store_id)}/orders/${publicId("order", r.order_id)}${
          r.kind === "ORDER_MESSAGE" ? "#messages" : ""
        }`,
      })),
    };
  });
}

/** The member's unread count (the bell's badge). */
export async function unreadStaffNotifications(ctx: TenantContext): Promise<number> {
  if (!ctx.permissions.has("order.read")) return 0;
  return withTenant(orgScope(ctx), async (tx) => {
    const rows = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "StaffNotification" n
      WHERE n."userId" = ${ctx.userId}::uuid AND n."organisationId" = ${ctx.organisationId}::uuid
        AND n."readAt" IS NULL
        AND (${ctx.allStores} OR EXISTS (
          SELECT 1 FROM "MembershipStoreAccess" a
          WHERE a."membershipId" = ${ctx.membershipId}::uuid AND a."storeId" = n."storeId"))`;
    return Number(rows[0]?.n ?? 0);
  });
}

/**
 * Marks the member's notifications read: the given ones, or all of them.
 * Ids that aren't theirs match nothing (the policy hides other members' rows).
 */
export async function markStaffNotificationsRead(
  ctx: TenantContext,
  ids: readonly string[] | "all",
): Promise<number> {
  return withTenant(orgScope(ctx), async (tx) => {
    if (ids === "all") {
      return tx.$executeRaw`
        UPDATE "StaffNotification" SET "readAt" = now()
        WHERE "userId" = ${ctx.userId}::uuid AND "organisationId" = ${ctx.organisationId}::uuid
          AND "readAt" IS NULL`;
    }
    const internal = ids.flatMap((id) => {
      const parsed = parseNotificationId(id);
      return parsed ? [parsed] : [];
    });
    if (internal.length === 0) return 0;
    return tx.$executeRaw`
      UPDATE "StaffNotification" SET "readAt" = now()
      WHERE id = ANY(${internal}::uuid[]) AND "userId" = ${ctx.userId}::uuid
        AND "readAt" IS NULL`;
  });
}

function parseNotificationId(value: string): string | null {
  try {
    return internalId("notification", value);
  } catch {
    return null;
  }
}
