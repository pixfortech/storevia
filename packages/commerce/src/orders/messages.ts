import "server-only";
import { workerDb } from "@storevia/database/worker";
import { createLogger, recordMetric } from "@storevia/observability";
import { permissionsFor, recordAudit, type MemberRole, type TenantContext } from "@storevia/tenancy";
import { notFound, uuidv7 } from "@storevia/types";
import { inStore, internalId } from "../internal";
import { cleanMessageBody } from "./customer";
import { orderEvent, queueNotification } from "./records";

// The store's side of the order conversation (post-M7): staff with
// `order.message` read and answer what shoppers write; a reply is emailed to
// the shopper by the worker. Customer messages reach the staff allowed to
// answer them as in-app notifications, fanned out by the worker so the
// shopper's request never waits on it.

const log = createLogger({ component: "order-messages" });

export interface OrderMessageView {
  readonly from: "customer" | "store";
  readonly body: string;
  readonly createdAt: Date;
  /** Staff replies: who wrote it (the merchant's view only). */
  readonly authorName: string | null;
  /** Customer messages: seen by the store. */
  readonly read: boolean;
}

/**
 * The order's conversation for the dashboard (order.read); opening it marks
 * the shopper's messages read and the viewer's own notifications about
 * this order read.
 */
export async function orderMessages(
  ctx: TenantContext,
  orderPublicId: unknown,
  options: { readonly markRead?: boolean } = {},
): Promise<readonly OrderMessageView[]> {
  const orderId = internalId("order", orderPublicId);
  return inStore(
    ctx,
    "order.read",
    async (tx, store) => {
      const exists = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Order" WHERE id = ${orderId}::uuid`;
      if (!exists[0]) throw notFound();
      const rows = await tx.$queryRaw<
        {
          author: "CUSTOMER" | "STAFF";
          body: string;
          at: Date;
          name: string | null;
          read_at: Date | null;
        }[]
      >`
        SELECT m."authorType"::text AS author, m.body, m."createdAt" AS at, u.name, m."readAt" AS read_at
        FROM "OrderMessage" m LEFT JOIN "User" u ON u.id = m."authorUserId"
        WHERE m."orderId" = ${orderId}::uuid
        ORDER BY m."createdAt", m.id`;
      if (options.markRead) {
        await tx.$executeRaw`
          UPDATE "OrderMessage" SET "readAt" = now()
          WHERE "orderId" = ${orderId}::uuid AND "authorType" = 'CUSTOMER' AND "readAt" IS NULL`;
        await tx.$executeRaw`
          UPDATE "StaffNotification" SET "readAt" = now()
          WHERE "orderId" = ${orderId}::uuid AND "userId" = ${store.userId}::uuid AND "readAt" IS NULL`;
      }
      return rows.map((r) => ({
        from: r.author === "CUSTOMER" ? ("customer" as const) : ("store" as const),
        body: r.body,
        createdAt: r.at,
        authorName: r.author === "STAFF" ? r.name : null,
        read: r.author === "STAFF" || r.read_at !== null,
      }));
    },
    { write: options.markRead === true },
  );
}

/** A reply from the store; the shopper gets it by email with their order link. */
export async function replyToOrderMessage(
  ctx: TenantContext,
  orderPublicId: unknown,
  input: { readonly body: unknown },
): Promise<void> {
  const orderId = internalId("order", orderPublicId);
  const body = cleanMessageBody(input.body);
  await inStore(
    ctx,
    "order.message",
    async (tx, store) => {
      const orders = await tx.$queryRaw<{ number: number; email: string | null }[]>`
        SELECT "orderNumber" AS number, email FROM "Order" WHERE id = ${orderId}::uuid`;
      const order = orders[0];
      if (!order) throw notFound();
      const id = uuidv7();
      await tx.$executeRaw`
        INSERT INTO "OrderMessage" (id, "organisationId", "storeId", "orderId", "authorType",
          "authorUserId", body)
        VALUES (${id}::uuid, ${store.organisationId}::uuid, ${store.storeId}::uuid,
          ${orderId}::uuid, 'STAFF', ${store.userId}::uuid, ${body})`;
      // Answering is reading.
      await tx.$executeRaw`
        UPDATE "OrderMessage" SET "readAt" = now()
        WHERE "orderId" = ${orderId}::uuid AND "authorType" = 'CUSTOMER' AND "readAt" IS NULL`;
      const scope = { organisationId: store.organisationId, storeId: store.storeId };
      await orderEvent(
        tx,
        scope,
        orderId,
        "message.replied",
        "Replied to the customer.",
        null,
        store.userId,
      );
      await queueNotification(tx, scope, orderId, "ORDER_MESSAGE_REPLY", `message:${id}`, order.email, id);
      // The message body is the shopper's business: the audit keeps the fact only.
      await recordAudit(
        tx,
        store,
        "order.message_replied",
        { type: "Order", id: orderId },
        { orderNumber: order.number },
      );
    },
    { write: true },
  );
  recordMetric("orders.staff_reply", 1);
}

// ---------------------------------------------------------------------------
// Worker: customer messages → staff notifications.
// ---------------------------------------------------------------------------

/** Roles whose members are told about customer messages (from the one RBAC source). */
export function rolesNotifiedOfMessages(roles: readonly MemberRole[]): MemberRole[] {
  return roles.filter((role) => permissionsFor(role).has("order.message"));
}

/**
 * Notifies, for each customer message not yet announced, every active
 * member of the store's organisation whose role grants `order.message` and
 * who can access that store. Each message is claimed with SKIP LOCKED and
 * marked, so two workers never announce it twice (and the unique index
 * makes a repeat a no-op anyway).
 */
export async function notifyStaffOfCustomerMessages(
  roles: readonly MemberRole[],
  limit = 50,
): Promise<{ readonly messages: number; readonly notifications: number }> {
  const eligible = rolesNotifiedOfMessages(roles);
  let messages = 0;
  let notifications = 0;
  for (let i = 0; i < limit; i++) {
    const done = await workerDb().$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; organisation_id: string; store_id: string; order_id: string; number: number }[]
      >`
        SELECT m.id, m."organisationId" AS organisation_id, m."storeId" AS store_id,
          m."orderId" AS order_id, o."orderNumber" AS number
        FROM "OrderMessage" m JOIN "Order" o ON o.id = m."orderId"
        WHERE m."authorType" = 'CUSTOMER' AND m."staffNotifiedAt" IS NULL
        ORDER BY m."createdAt"
        LIMIT 1
        FOR UPDATE OF m SKIP LOCKED`;
      const m = rows[0];
      if (!m) return null;
      const created = await tx.$executeRaw`
        INSERT INTO "StaffNotification" (id, "organisationId", "storeId", "userId", kind, "orderId",
          "orderMessageId", title)
        SELECT gen_random_uuid(), ms."organisationId", ${m.store_id}::uuid, ms."userId",
          'ORDER_MESSAGE', ${m.order_id}::uuid, ${m.id}::uuid,
          ${`Customer sent a message on Order #${String(m.number)}`}
        FROM "Membership" ms JOIN "User" u ON u.id = ms."userId"
        WHERE ms."organisationId" = ${m.organisation_id}::uuid AND ms.status = 'ACTIVE'
          AND u.status = 'ACTIVE'
          AND ms.role::text = ANY(${eligible as string[]}::text[])
          AND (ms."allStores" OR EXISTS (
            SELECT 1 FROM "MembershipStoreAccess" a
            WHERE a."membershipId" = ms.id AND a."storeId" = ${m.store_id}::uuid))
        ON CONFLICT ("userId", "orderMessageId") DO NOTHING`;
      await tx.$executeRaw`
        UPDATE "OrderMessage" SET "staffNotifiedAt" = now() WHERE id = ${m.id}::uuid`;
      return created;
    });
    if (done === null) break;
    messages += 1;
    notifications += done;
  }
  if (messages > 0) {
    recordMetric("orders.staff_notifications", notifications);
    log.info("customer messages announced", { messages, notifications });
  }
  return { messages, notifications };
}
