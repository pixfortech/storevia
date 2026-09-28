import "server-only";
import { withCheckout } from "@storevia/database/checkout";
import { recordMetric } from "@storevia/observability";
import { consumeRateLimitsWith, type RateLimitRule } from "@storevia/security/rate-limit";
import { DomainError, uuidv7, validationFailed } from "@storevia/types";
import { checkoutDb } from "@storevia/database/checkout";
import type { TenantTx } from "../internal";
import {
  orderDeliveryStatus,
  orderState,
  type FulfilmentMethod,
  type OrderDeliveryStatus,
  type OrderState,
  type ShipmentStatus,
} from "./lifecycle";
import { verifiedOrderAccessHash } from "./access";

// The shopper's own order page (post-M7), opened only by the order's access
// token, under the checkout role: the database shows this one order of this
// store and nothing else. The view is a customer-safe subset: no staff
// notes, audit data, provider ids, internal ids or staff names.

/** The longest message a shopper (or the store) can send. */
export const ORDER_MESSAGE_MAX = 2000;

const RULES = {
  perOrder: { name: "checkout:order-message", limit: 10, windowSeconds: 3600 },
  perClient: { name: "checkout:order-message-ip", limit: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export interface CustomerOrderStore {
  readonly organisationId: string;
  readonly storeId: string;
}

export interface CustomerOrderView {
  readonly number: number;
  readonly placedAt: Date;
  readonly currency: string;
  readonly state: OrderState;
  readonly paymentStatus: string;
  readonly fulfilmentStatus: string;
  readonly deliveryStatus: OrderDeliveryStatus;
  readonly lines: readonly {
    readonly title: string;
    readonly variant: string | null;
    readonly quantity: number;
    /** Minor units. */
    readonly total: bigint;
  }[];
  readonly subtotal: bigint;
  readonly discount: bigint;
  readonly shipping: bigint;
  readonly tax: bigint;
  readonly total: bigint;
  readonly refunded: bigint;
  readonly pricesIncludeTax: boolean;
  readonly shipments: readonly {
    readonly method: FulfilmentMethod;
    readonly status: ShipmentStatus;
    readonly carrier: string | null;
    readonly trackingNumber: string | null;
    readonly trackingUrl: string | null;
    readonly shippedAt: Date | null;
    readonly deliveredAt: Date | null;
    readonly items: readonly { readonly title: string; readonly quantity: number }[];
  }[];
  /** Customer-safe milestones only (no internal notes or staff names). */
  readonly timeline: readonly { readonly kind: string; readonly at: Date }[];
  readonly messages: readonly {
    readonly from: "customer" | "store";
    readonly body: string;
    readonly at: Date;
  }[];
}

/** Event types a shopper may see, mapped to the milestone shown. */
const SAFE_EVENTS: Readonly<Record<string, string>> = {
  "order.placed": "placed",
  "payment.captured": "paid",
  "fulfilment.created": "fulfilled",
  "fulfilment.shipped": "shipped",
  "fulfilment.in_transit": "in_transit",
  "fulfilment.out_for_delivery": "out_for_delivery",
  "fulfilment.delivered": "delivered",
  "order.completed": "completed",
  "order.cancelled": "cancelled",
  "refund.succeeded": "refunded",
};

async function openedOrder(tx: TenantTx): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string | null }[]>`SELECT app_current_order_access() AS id`;
  return rows[0]?.id ?? null;
}

async function loadView(tx: TenantTx, orderId: string): Promise<CustomerOrderView | null> {
  const orders = await tx.$queryRaw<
    {
      number: number;
      placed_at: Date;
      currency: string;
      status: "OPEN" | "CANCELLED";
      completed_at: Date | null;
      payment_status: string;
      fulfilment_status: string;
      subtotal: bigint;
      discount: bigint;
      shipping: bigint;
      tax: bigint;
      total: bigint;
      refunded: bigint;
      include_tax: boolean;
    }[]
  >`
    SELECT "orderNumber" AS number, "placedAt" AS placed_at, trim(currency) AS currency,
      status::text AS status, "completedAt" AS completed_at, "paymentStatus"::text AS payment_status,
      "fulfilmentStatus"::text AS fulfilment_status, "subtotalAmount" AS subtotal,
      "discountAmount" AS discount, "shippingAmount" AS shipping, "taxAmount" AS tax,
      "totalAmount" AS total, "refundedAmount" AS refunded, "pricesIncludeTax" AS include_tax
    FROM "Order" WHERE id = ${orderId}::uuid`;
  const o = orders[0];
  if (!o) return null;
  const [lines, fulfilments, items, events, messages] = await Promise.all([
    tx.$queryRaw<{ title: string; variant: string | null; quantity: number; total: bigint }[]>`
      SELECT "productTitle" AS title, "variantTitle" AS variant, quantity, "totalAmount" AS total
      FROM "OrderLine" WHERE "orderId" = ${orderId}::uuid ORDER BY "createdAt", id`,
    tx.$queryRaw<
      {
        id: string;
        state: "PENDING" | "SUCCESS" | "CANCELLED";
        method: FulfilmentMethod;
        status: ShipmentStatus;
        company: string | null;
        number: string | null;
        url: string | null;
        shipped_at: Date | null;
        delivered_at: Date | null;
      }[]
    >`
      SELECT id, state::text AS state, method::text AS method, "shipmentStatus"::text AS status,
        "trackingCompany" AS company, "trackingNumber" AS number, "trackingUrl" AS url,
        "shippedAt" AS shipped_at, "deliveredAt" AS delivered_at
      FROM "Fulfilment" WHERE "orderId" = ${orderId}::uuid ORDER BY "createdAt", id`,
    tx.$queryRaw<{ fulfilment: string; title: string; quantity: number }[]>`
      SELECT fl."fulfilmentId" AS fulfilment, ol."productTitle" AS title, fl.quantity
      FROM "FulfilmentLine" fl JOIN "OrderLine" ol ON ol.id = fl."orderLineId"
      WHERE ol."orderId" = ${orderId}::uuid ORDER BY ol."createdAt", ol.id`,
    // Only the event type and, for a new fulfilment, the status it started
    // in: never the staff-facing message or anything else in the data.
    tx.$queryRaw<{ type: string; status: string | null; at: Date }[]>`
      SELECT type, CASE WHEN type = 'fulfilment.created' THEN data->>'status' END AS status,
        "createdAt" AS at
      FROM "OrderEvent"
      WHERE "orderId" = ${orderId}::uuid ORDER BY "createdAt", id`,
    tx.$queryRaw<{ author: "CUSTOMER" | "STAFF"; body: string; at: Date }[]>`
      SELECT "authorType"::text AS author, body, "createdAt" AS at FROM "OrderMessage"
      WHERE "orderId" = ${orderId}::uuid ORDER BY "createdAt", id`,
  ]);
  const active = fulfilments.filter((f) => f.state === "SUCCESS");
  const timeline: { kind: string; at: Date }[] = [];
  const add = (kind: string | undefined, at: Date) => {
    // One milestone of each kind: a second parcel doesn't repeat "shipped".
    if (kind && !timeline.some((t) => t.kind === kind)) timeline.push({ kind, at });
  };
  for (const e of events) {
    add(SAFE_EVENTS[e.type], e.at);
    // A fulfilment created already on its way (e.g. "shipped") is that step too.
    if (e.status && e.status !== "READY")
      add(SAFE_EVENTS[`fulfilment.${e.status.toLowerCase()}`], e.at);
  }
  return {
    number: o.number,
    placedAt: o.placed_at,
    currency: o.currency,
    state: orderState({ status: o.status, completedAt: o.completed_at }),
    paymentStatus: o.payment_status,
    fulfilmentStatus: o.fulfilment_status,
    deliveryStatus: orderDeliveryStatus(
      o.fulfilment_status,
      fulfilments.map((f) => ({ state: f.state, shipmentStatus: f.status })),
    ),
    lines,
    subtotal: o.subtotal,
    discount: o.discount,
    shipping: o.shipping,
    tax: o.tax,
    total: o.total,
    refunded: o.refunded,
    pricesIncludeTax: o.include_tax,
    shipments: active.map((f) => ({
      method: f.method,
      status: f.status,
      carrier: f.company,
      trackingNumber: f.number,
      trackingUrl: f.url,
      shippedAt: f.shipped_at,
      deliveredAt: f.delivered_at,
      items: items
        .filter((i) => i.fulfilment === f.id)
        .map(({ title, quantity }) => ({ title, quantity })),
    })),
    timeline,
    messages: messages.map((m) => ({
      from: m.author === "CUSTOMER" ? "customer" : "store",
      body: m.body,
      at: m.at,
    })),
  };
}

/** The order an access token opens in this store, or null (unknown, forged, expired, revoked). */
export async function getCustomerOrder(
  store: CustomerOrderStore,
  token: unknown,
): Promise<CustomerOrderView | null> {
  const hash = verifiedOrderAccessHash(token);
  if (!hash) return null;
  return withCheckout(
    { organisationId: store.organisationId, storeId: store.storeId, orderAccessHash: hash },
    async (tx) => {
      const orderId = await openedOrder(tx);
      return orderId ? loadView(tx, orderId) : null;
    },
  );
}

/**
 * Plain text only: control characters (other than line breaks and tabs) are
 * dropped, runs of blank lines collapsed, the whole trimmed. It is shown as
 * text everywhere (never as HTML).
 */
export function cleanMessageBody(raw: unknown): string {
  if (typeof raw !== "string") throw validationFailed({ body: "Write a message." });
  const text = raw
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw validationFailed({ body: "Write a message." });
  if (text.length > ORDER_MESSAGE_MAX) {
    throw validationFailed({
      body: `Keep it under ${ORDER_MESSAGE_MAX.toLocaleString("en")} characters.`,
    });
  }
  return text;
}

/**
 * The shopper writes to the store about their order. Rate limited per order
 * and per client; the staff allowed to answer are notified by the worker.
 */
export async function sendCustomerOrderMessage(
  store: CustomerOrderStore,
  token: unknown,
  body: unknown,
  clientIp: string | null,
): Promise<"sent" | "not_found"> {
  const hash = verifiedOrderAccessHash(token);
  if (!hash) return "not_found";
  const text = cleanMessageBody(body);
  return withCheckout(
    { organisationId: store.organisationId, storeId: store.storeId, orderAccessHash: hash },
    async (tx) => {
      const orderId = await openedOrder(tx);
      if (!orderId) return "not_found" as const;
      const limited = await consumeRateLimitsWith(checkoutDb(), [
        [RULES.perOrder, `${store.storeId}:${orderId}`],
        [RULES.perClient, clientIp ? `${store.storeId}:${clientIp}` : null],
      ]);
      if (!limited.allowed) {
        throw new DomainError(
          "RATE_LIMITED",
          "You've sent several messages recently. Please wait a while before sending another.",
        );
      }
      await tx.$executeRaw`
        INSERT INTO "OrderMessage" (id, "organisationId", "storeId", "orderId", "authorType", body)
        VALUES (${uuidv7()}::uuid, ${store.organisationId}::uuid, ${store.storeId}::uuid,
          ${orderId}::uuid, 'CUSTOMER', ${text})`;
      recordMetric("orders.customer_message", 1);
      return "sent" as const;
    },
  );
}
