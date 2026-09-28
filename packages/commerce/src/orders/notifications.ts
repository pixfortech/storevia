import "server-only";
import { workerDb } from "@storevia/database/worker";
import { storefrontOrigin } from "@storevia/domains";
import {
  orderCancelledMessage,
  orderConfirmationMessage,
  orderFulfilledMessage,
  orderMessageReplyMessage,
  refundMessage,
  type EmailMessage,
  type EmailSender,
  type OrderEmail,
} from "@storevia/email";
import { createLogger, errorFields, recordMetric } from "@storevia/observability";
import { format, money } from "../money";
import { orderAccessConfigured, orderAccessPath, orderAccessToken } from "./access";

// Order emails (ADR-0031 §12), sent by the worker from the OrderNotification
// queue that order changes write in their own transactions. An email that
// fails is retried with backoff and never touches the order. Delivery is at
// least once: a crash between sending and marking can repeat one email.

const log = createLogger({ component: "order-notifications" });

const MAX_ATTEMPTS = 5;
/** A claimed notification is someone else's for this long. */
const LEASE_MINUTES = 10;

interface Claimed {
  id: string;
  orderId: string;
  kind:
    | "ORDER_CONFIRMATION"
    | "ORDER_CANCELLED"
    | "ORDER_FULFILLED"
    | "REFUND_CREATED"
    | "ORDER_MESSAGE_REPLY";
  recipient: string;
  referenceId: string | null;
  attempts: number;
}

async function orderEmail(
  orderId: string,
): Promise<{ order: OrderEmail; fmt: (a: bigint) => string; refunded: bigint } | null> {
  const db = workerDb();
  const rows = await db.$queryRaw<
    {
      number: number;
      currency: string;
      include_tax: boolean;
      subtotal: bigint;
      discount: bigint;
      shipping: bigint;
      tax: bigint;
      total: bigint;
      refunded: bigint;
      store_name: string;
      locale: string;
    }[]
  >`
    SELECT o."orderNumber" AS number, trim(o.currency) AS currency, o."pricesIncludeTax" AS include_tax,
      o."subtotalAmount" AS subtotal, o."discountAmount" AS discount, o."shippingAmount" AS shipping,
      o."taxAmount" AS tax, o."totalAmount" AS total, o."refundedAmount" AS refunded,
      s.name AS store_name, s.locale
    FROM "Order" o JOIN "Store" s ON s.id = o."storeId"
    WHERE o.id = ${orderId}::uuid`;
  const o = rows[0];
  if (!o) return null;
  const fmt = (amount: bigint) => format(money(amount, o.currency), o.locale);
  const lines = await db.$queryRaw<
    { title: string; variant: string | null; quantity: number; total: bigint }[]
  >`
    SELECT "productTitle" AS title, "variantTitle" AS variant, quantity, "totalAmount" AS total
    FROM "OrderLine" WHERE "orderId" = ${orderId}::uuid ORDER BY "createdAt", id`;
  const address = await db.$queryRaw<
    {
      first: string | null;
      last: string | null;
      line1: string;
      line2: string | null;
      city: string | null;
      region: string | null;
      postal: string | null;
      country: string;
    }[]
  >`
    SELECT "firstName" AS first, "lastName" AS last, line1, line2, city, "regionCode" AS region,
      "postalCode" AS postal, trim("countryCode") AS country
    FROM "OrderAddress" WHERE "orderId" = ${orderId}::uuid AND type = 'SHIPPING'`;
  const a = address[0];
  // The shopper's order page on the store's primary address, when both exist.
  const access = await db.$queryRaw<{ id: string; host: string | null }[]>`
    SELECT a.id, (SELECT d.hostname FROM "StoreDomain" d
      WHERE d."storeId" = o."storeId" AND d."isPrimary" AND d.status = 'ACTIVE') AS host
    FROM "OrderCustomerAccess" a JOIN "Order" o ON o.id = a."orderId"
    WHERE a."orderId" = ${orderId}::uuid AND a."revokedAt" IS NULL AND a."expiresAt" > now()
    ORDER BY a."createdAt" DESC LIMIT 1`;
  const link = access[0];
  const orderUrl =
    link?.host != null && orderAccessConfigured()
      ? `${storefrontOrigin(link.host)}${orderAccessPath(orderAccessToken(link.id))}`
      : null;
  const totals: [string, string][] = [["Subtotal", fmt(o.subtotal)]];
  if (o.discount > 0n) totals.push(["Discount", `−${fmt(o.discount)}`]);
  if (o.shipping > 0n) totals.push(["Shipping", fmt(o.shipping)]);
  if (o.tax > 0n) totals.push([o.include_tax ? "Tax (included)" : "Tax", fmt(o.tax)]);
  totals.push(["Total", fmt(o.total)]);
  return {
    fmt,
    refunded: o.refunded,
    order: {
      storeName: o.store_name,
      orderNumber: o.number,
      lines: lines.map((l) => ({
        title: l.variant && l.variant !== "Default" ? `${l.title} (${l.variant})` : l.title,
        quantity: l.quantity,
        total: fmt(l.total),
      })),
      totals,
      shippingAddress: a
        ? [
            [a.first, a.last].filter(Boolean).join(" "),
            a.line1,
            ...(a.line2 ? [a.line2] : []),
            [a.city, a.region, a.postal].filter(Boolean).join(", "),
            a.country,
          ].filter(Boolean)
        : null,
      orderUrl,
    },
  };
}

async function buildMessage(n: Claimed): Promise<EmailMessage | null> {
  const loaded = await orderEmail(n.orderId);
  if (!loaded) return null;
  const { order, fmt } = loaded;
  const db = workerDb();
  switch (n.kind) {
    case "ORDER_CONFIRMATION":
      return orderConfirmationMessage(n.recipient, order);
    case "ORDER_CANCELLED":
      return orderCancelledMessage(
        n.recipient,
        order,
        loaded.refunded > 0n ? fmt(loaded.refunded) : null,
      );
    case "ORDER_FULFILLED": {
      if (!n.referenceId) return null;
      const f = await db.$queryRaw<
        { company: string | null; number: string | null; url: string | null }[]
      >`
        SELECT "trackingCompany" AS company, "trackingNumber" AS number, "trackingUrl" AS url
        FROM "Fulfilment" WHERE id = ${n.referenceId}::uuid`;
      const items = await db.$queryRaw<{ title: string; quantity: number }[]>`
        SELECT ol."productTitle" AS title, fl.quantity FROM "FulfilmentLine" fl
        JOIN "OrderLine" ol ON ol.id = fl."orderLineId"
        WHERE fl."fulfilmentId" = ${n.referenceId}::uuid ORDER BY ol."createdAt", ol.id`;
      return orderFulfilledMessage(n.recipient, order, {
        items,
        trackingCompany: f[0]?.company ?? null,
        trackingNumber: f[0]?.number ?? null,
        trackingUrl: f[0]?.url ?? null,
      });
    }
    case "ORDER_MESSAGE_REPLY": {
      if (!n.referenceId) return null;
      const m = await db.$queryRaw<{ body: string }[]>`
        SELECT body FROM "OrderMessage" WHERE id = ${n.referenceId}::uuid AND "authorType" = 'STAFF'`;
      return m[0] ? orderMessageReplyMessage(n.recipient, order, m[0].body) : null;
    }
    case "REFUND_CREATED": {
      if (!n.referenceId) return null;
      const r = await db.$queryRaw<{ amount: bigint }[]>`
        SELECT amount FROM "Refund" WHERE id = ${n.referenceId}::uuid AND status = 'SUCCEEDED'`;
      return r[0] ? refundMessage(n.recipient, order, fmt(r[0].amount)) : null;
    }
  }
}

export interface NotificationRunResult {
  readonly sent: number;
  readonly failed: number;
  readonly retrying: number;
}

/** Sends due notifications (claimed with SKIP LOCKED, so workers never share one). */
export async function sendOrderNotifications(
  sender: EmailSender,
  limit = 25,
): Promise<NotificationRunResult> {
  const db = workerDb();
  const claimed = await db.$queryRaw<Claimed[]>`
    UPDATE "OrderNotification"
    SET attempts = attempts + 1, "nextAttemptAt" = now() + make_interval(mins => ${LEASE_MINUTES}),
      "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "OrderNotification"
      WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
      ORDER BY "nextAttemptAt" LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING id, "orderId", kind::text AS kind, recipient, "referenceId", attempts`;
  let sent = 0;
  let failed = 0;
  let retrying = 0;
  for (const n of claimed) {
    try {
      const message = await buildMessage(n);
      if (message) await sender.send(message);
      await db.$executeRaw`
        UPDATE "OrderNotification" SET status = 'SENT', "sentAt" = now(), "lastError" = NULL,
          "updatedAt" = now()
        WHERE id = ${n.id}::uuid`;
      sent += 1;
    } catch (error) {
      // Only the error's name and a short code go to the row: never the recipient or content.
      const reason = (error instanceof Error ? error.name : "Error").slice(0, 100);
      if (n.attempts >= MAX_ATTEMPTS) {
        failed += 1;
        await db.$executeRaw`
          UPDATE "OrderNotification" SET status = 'FAILED', "lastError" = ${reason}, "updatedAt" = now()
          WHERE id = ${n.id}::uuid`;
      } else {
        retrying += 1;
        await db.$executeRaw`
          UPDATE "OrderNotification"
          SET "nextAttemptAt" = now() + make_interval(mins => ${2 ** n.attempts}), "lastError" = ${reason},
            "updatedAt" = now()
          WHERE id = ${n.id}::uuid`;
      }
      log.warn("order notification failed", {
        notificationId: n.id,
        kind: n.kind,
        ...errorFields(error),
      });
    }
  }
  if (sent > 0) recordMetric("orders.notification_sent", sent);
  if (failed > 0) recordMetric("orders.notification_failed", failed);
  return { sent, failed, retrying };
}
