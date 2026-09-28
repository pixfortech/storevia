import "server-only";
import { Prisma } from "@storevia/database";
import type { TenantContext } from "@storevia/tenancy";
import { notFound } from "@storevia/types";
import { inStore, internalId, publicId, publicIdOrNull, type TenantTx } from "../internal";
import type { MoneyJson } from "../money";
import {
  completionBlockers,
  orderDeliveryStatus,
  orderState,
  type FulfilmentMethod,
  type OrderDeliveryStatus,
  type OrderState,
  type ShipmentStatus,
} from "./lifecycle";

// The merchant's orders (ADR-0031 §5), under the merchant role and
// `order.read`. Lists are keyset-paged and batched (a fixed number of
// queries per page); the detail loads every part of one order in parallel
// queries of its own. Amounts are the order's immutable snapshots.

export type OrderStatusFilter =
  "all" | "open" | "unfulfilled" | "unpaid" | "cancelled" | "completed" | "archived";

export interface OrderListItem {
  readonly id: string;
  readonly number: number;
  readonly placedAt: Date;
  readonly customerName: string | null;
  readonly email: string | null;
  readonly total: MoneyJson;
  readonly status: "OPEN" | "CANCELLED";
  readonly paymentStatus: string;
  readonly fulfilmentStatus: string;
  readonly itemCount: number;
  readonly stockShortage: boolean;
  readonly archived: boolean;
  readonly state: OrderState;
}

export interface OrderListResult {
  readonly items: readonly OrderListItem[];
  readonly nextCursor: string | null;
  readonly counts: {
    readonly all: number;
    readonly unfulfilled: number;
    readonly cancelled: number;
    readonly archived: number;
  };
}

const money = (amount: bigint, currency: string): MoneyJson => ({
  amount: amount.toString(),
  currency: currency.trim(),
});

function encodeCursor(placedAt: Date, id: string): string {
  return Buffer.from(`${placedAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: unknown): { placedAt: Date; id: string } | null {
  if (typeof cursor !== "string" || cursor.length > 200) return null;
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const placedAt = new Date(iso ?? "");
  if (Number.isNaN(placedAt.getTime()) || !id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { placedAt, id };
}

/** "#1001", "1001" or an email fragment. */
function searchCondition(q: string): Prisma.Sql | null {
  const text = q.trim().slice(0, 100);
  if (!text) return null;
  const number = /^#?(\d{1,9})$/.exec(text)?.[1];
  if (number) return Prisma.sql`o."orderNumber" = ${Number(number)}`;
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return Prisma.sql`(lower(o.email) LIKE lower(${like}) OR EXISTS (
    SELECT 1 FROM "OrderAddress" a WHERE a."orderId" = o.id AND a.type = 'SHIPPING'
      AND (a."firstName" || ' ' || a."lastName") ILIKE ${like}))`;
}

// Archived orders leave every list but their own (a search still finds them).
const FILTERS: Readonly<Record<OrderStatusFilter, Prisma.Sql>> = {
  all: Prisma.sql`o."archivedAt" IS NULL`,
  open: Prisma.sql`o."archivedAt" IS NULL AND o.status = 'OPEN' AND o."completedAt" IS NULL`,
  unfulfilled: Prisma.sql`o."archivedAt" IS NULL AND o.status = 'OPEN' AND o."fulfilmentStatus" <> 'FULFILLED'`,
  unpaid: Prisma.sql`o."archivedAt" IS NULL AND o."paymentStatus" NOT IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`,
  cancelled: Prisma.sql`o."archivedAt" IS NULL AND o.status = 'CANCELLED'`,
  completed: Prisma.sql`o."archivedAt" IS NULL AND o."completedAt" IS NOT NULL`,
  archived: Prisma.sql`o."archivedAt" IS NOT NULL`,
};

export async function listOrders(
  ctx: TenantContext,
  query: { readonly status?: unknown; readonly q?: unknown; readonly cursor?: unknown } = {},
  limit = 25,
): Promise<OrderListResult> {
  const status: OrderStatusFilter =
    typeof query.status === "string" && query.status in FILTERS
      ? (query.status as OrderStatusFilter)
      : "all";
  const search = typeof query.q === "string" ? searchCondition(query.q) : null;
  // A search looks through archived orders too, unless a filter narrows it.
  const conditions: Prisma.Sql[] = [
    search && status === "all" ? Prisma.sql`true` : FILTERS[status],
  ];
  if (search) conditions.push(search);
  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    conditions.push(Prisma.sql`(o."placedAt", o.id) < (${cursor.placedAt}, ${cursor.id}::uuid)`);
  }
  return inStore(ctx, "order.read", async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
        number: number;
        placed_at: Date;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        total: bigint;
        currency: string;
        status: "OPEN" | "CANCELLED";
        payment_status: string;
        fulfilment_status: string;
        items: number;
        shortage: boolean;
        archived: boolean;
        completed: boolean;
      }[]
    >`
      SELECT o.id, o."orderNumber" AS number, o."placedAt" AS placed_at, a."firstName" AS first_name,
        a."lastName" AS last_name, o.email, o."totalAmount" AS total, o.currency,
        o.status::text AS status, o."paymentStatus"::text AS payment_status,
        o."fulfilmentStatus"::text AS fulfilment_status,
        (SELECT coalesce(sum(l.quantity), 0)::int FROM "OrderLine" l WHERE l."orderId" = o.id) AS items,
        o."stockShortage" AS shortage, o."archivedAt" IS NOT NULL AS archived,
        o."completedAt" IS NOT NULL AS completed
      FROM "Order" o
      LEFT JOIN "OrderAddress" a ON a."orderId" = o.id AND a.type = 'SHIPPING'
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY o."placedAt" DESC, o.id DESC
      LIMIT ${limit + 1}`;
    const counts = await tx.$queryRaw<
      { all: number; unfulfilled: number; cancelled: number; archived: number }[]
    >`
      SELECT count(*) FILTER (WHERE "archivedAt" IS NULL)::int AS all,
        count(*) FILTER (WHERE "archivedAt" IS NULL AND status = 'OPEN'
          AND "fulfilmentStatus" <> 'FULFILLED')::int AS unfulfilled,
        count(*) FILTER (WHERE "archivedAt" IS NULL AND status = 'CANCELLED')::int AS cancelled,
        count(*) FILTER (WHERE "archivedAt" IS NOT NULL)::int AS archived
      FROM "Order"`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        id: publicId("order", r.id),
        number: r.number,
        placedAt: r.placed_at,
        customerName:
          r.first_name || r.last_name
            ? [r.first_name, r.last_name].filter(Boolean).join(" ")
            : null,
        email: r.email,
        total: money(r.total, r.currency),
        status: r.status,
        paymentStatus: r.payment_status,
        fulfilmentStatus: r.fulfilment_status,
        itemCount: r.items,
        stockShortage: r.shortage,
        archived: r.archived,
        state: r.status === "CANCELLED" ? "CANCELLED" : r.completed ? "COMPLETED" : "OPEN",
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.placed_at, last.id) : null,
      counts: counts[0] ?? { all: 0, unfulfilled: 0, cancelled: 0, archived: 0 },
    };
  });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface OrderAddressView {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly company: string | null;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly regionCode: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly phone: string | null;
}

export interface OrderLineView {
  readonly id: string;
  readonly productId: string | null;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly sku: string | null;
  readonly quantity: number;
  readonly unitPrice: MoneyJson;
  readonly discount: MoneyJson;
  readonly tax: MoneyJson;
  readonly total: MoneyJson;
  readonly fulfilledQuantity: number;
  readonly refundedQuantity: number;
  /** Fulfilled units not yet put back on sale by a refund. */
  readonly restockable: number;
  readonly requiresShipping: boolean;
}

export interface OrderPaymentView {
  readonly id: string;
  readonly provider: string;
  readonly status: string;
  readonly amount: MoneyJson;
  readonly captured: MoneyJson;
  readonly refunded: MoneyJson;
  /** Captured, minus succeeded and pending refunds. */
  readonly refundable: MoneyJson;
  readonly capturedAt: Date | null;
  readonly primary: boolean;
}

export interface OrderRefundView {
  readonly id: string;
  readonly amount: MoneyJson;
  readonly status: "PENDING" | "SUCCEEDED" | "FAILED";
  readonly reason: string | null;
  readonly failureMessage: string | null;
  readonly createdAt: Date;
  readonly lines: readonly {
    readonly productTitle: string;
    readonly quantity: number;
    readonly restocked: boolean;
  }[];
}

export interface OrderFulfilmentView {
  readonly id: string;
  readonly createdAt: Date;
  readonly locationName: string;
  readonly method: FulfilmentMethod;
  readonly shipmentStatus: ShipmentStatus;
  readonly shippedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly trackingCompany: string | null;
  readonly trackingNumber: string | null;
  readonly trackingUrl: string | null;
  readonly lines: readonly { readonly productTitle: string; readonly quantity: number }[];
}

export interface OrderEventView {
  readonly type: string;
  readonly message: string | null;
  readonly createdAt: Date;
  readonly actorName: string | null;
}

export interface OrderDetail {
  readonly id: string;
  readonly number: number;
  readonly placedAt: Date;
  readonly status: "OPEN" | "CANCELLED";
  readonly paymentStatus: string;
  readonly fulfilmentStatus: string;
  readonly deliveryStatus: OrderDeliveryStatus;
  /** Open, complete or cancelled: separate from payment, fulfilment and delivery. */
  readonly state: OrderState;
  readonly archivedAt: Date | null;
  readonly completedAt: Date | null;
  /** Why the order can't be completed yet (empty: it can). */
  readonly completionBlockers: readonly string[];
  readonly stockShortage: boolean;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly note: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly pricesIncludeTax: boolean;
  readonly subtotal: MoneyJson;
  readonly discountTotal: MoneyJson;
  readonly shippingTotal: MoneyJson;
  readonly taxTotal: MoneyJson;
  readonly total: MoneyJson;
  readonly refunded: MoneyJson;
  readonly lines: readonly OrderLineView[];
  readonly shippingAddress: OrderAddressView | null;
  readonly billingAddress: OrderAddressView | null;
  readonly shippingLine: { readonly title: string; readonly amount: MoneyJson } | null;
  readonly discounts: readonly {
    readonly code: string | null;
    readonly title: string;
    readonly amount: MoneyJson;
  }[];
  readonly taxLines: readonly { readonly title: string; readonly amount: MoneyJson }[];
  readonly payments: readonly OrderPaymentView[];
  readonly refunds: readonly OrderRefundView[];
  readonly fulfilments: readonly OrderFulfilmentView[];
  readonly events: readonly OrderEventView[];
  readonly customer: { readonly id: string; readonly orderCount: number } | null;
  /** Nothing fulfilled yet and not cancelled. */
  readonly canCancel: boolean;
  /** Units left to ship across lines. */
  readonly unfulfilledQuantity: number;
}

/** Loads an order in the caller's transaction (merchant role); null when not in this store. */
export async function loadOrderDetail(tx: TenantTx, orderId: string): Promise<OrderDetail | null> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  const c = order.currency;
  const [lines, addresses, discounts, shipping, taxes, payments, refunds, fulfilments, events] =
    await Promise.all([
      tx.orderLine.findMany({ where: { orderId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      tx.orderAddress.findMany({ where: { orderId } }),
      tx.orderDiscount.findMany({ where: { orderId } }),
      tx.orderShippingLine.findMany({ where: { orderId } }),
      tx.$queryRaw<{ title: string; amount: bigint }[]>`
        SELECT title, sum(amount)::bigint AS amount FROM "OrderTaxLine"
        WHERE "orderId" = ${orderId}::uuid GROUP BY title ORDER BY title`,
      tx.$queryRaw<
        {
          id: string;
          provider: string;
          status: string;
          amount: bigint;
          captured: bigint;
          refunded: bigint;
          pending: bigint;
          captured_at: Date | null;
        }[]
      >`
        SELECT p.id, p.provider, p.status::text AS status, p.amount, p."capturedAmount" AS captured,
          p."refundedAmount" AS refunded,
          coalesce((SELECT sum(r.amount) FROM "Refund" r
            WHERE r."paymentId" = p.id AND r.status = 'PENDING'), 0)::bigint AS pending,
          p."capturedAt" AS captured_at
        FROM "Payment" p WHERE p."orderId" = ${orderId}::uuid
        ORDER BY p."capturedAt" NULLS LAST, p.id`,
      tx.refund.findMany({
        where: { orderId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { lines: { include: { orderLine: { select: { productTitle: true } } } } },
      }),
      tx.fulfilment.findMany({
        where: { orderId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          location: { select: { name: true } },
          lines: { include: { orderLine: { select: { productTitle: true } } } },
        },
      }),
      tx.$queryRaw<
        { type: string; message: string | null; created_at: Date; actor: string | null }[]
      >`
        SELECT e.type, e.message, e."createdAt" AS created_at, u.name AS actor
        FROM "OrderEvent" e LEFT JOIN "User" u ON u.id = e."actorUserId"
        WHERE e."orderId" = ${orderId}::uuid
        ORDER BY e."createdAt" DESC, e.id DESC`,
    ]);
  const restocked = await tx.$queryRaw<{ line: string; quantity: number }[]>`
    SELECT rl."orderLineId" AS line, sum(rl.quantity)::int AS quantity
    FROM "RefundLine" rl JOIN "Refund" r ON r.id = rl."refundId"
    WHERE r."orderId" = ${orderId}::uuid AND r.status = 'SUCCEEDED'
      AND rl."restockLocationId" IS NOT NULL
    GROUP BY rl."orderLineId"`;
  const restockedBy = new Map(restocked.map((r) => [r.line, r.quantity]));
  const customerOrders = order.customerId
    ? await tx.order.count({ where: { customerId: order.customerId } })
    : 0;
  const address = (type: "SHIPPING" | "BILLING"): OrderAddressView | null => {
    const a = addresses.find((x) => x.type === type);
    return a
      ? {
          firstName: a.firstName,
          lastName: a.lastName,
          company: a.company,
          line1: a.line1,
          line2: a.line2,
          city: a.city,
          region: a.region,
          regionCode: a.regionCode,
          postalCode: a.postalCode,
          countryCode: a.countryCode.trim(),
          phone: a.phone,
        }
      : null;
  };
  const primaryId = payments.find((p) => p.status === "CAPTURED")?.id ?? null;
  const unfulfilled = lines.reduce((n, l) => n + l.quantity - l.fulfilledQuantity, 0);
  const deliveryStatus = orderDeliveryStatus(order.fulfilmentStatus, fulfilments);
  return {
    id: publicId("order", order.id),
    number: order.orderNumber,
    placedAt: order.placedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    deliveryStatus,
    state: orderState(order),
    archivedAt: order.archivedAt,
    completedAt: order.completedAt,
    completionBlockers: completionBlockers({ ...order, deliveryStatus }),
    stockShortage: order.stockShortage,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    note: order.note,
    email: order.email,
    phone: order.phone,
    pricesIncludeTax: order.pricesIncludeTax,
    subtotal: money(order.subtotalAmount, c),
    discountTotal: money(order.discountAmount, c),
    shippingTotal: money(order.shippingAmount, c),
    taxTotal: money(order.taxAmount, c),
    total: money(order.totalAmount, c),
    refunded: money(order.refundedAmount, c),
    lines: lines.map((l) => ({
      id: publicId("orderLine", l.id),
      productId: publicIdOrNull("product", l.productId),
      productTitle: l.productTitle,
      variantTitle: l.variantTitle,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: money(l.unitPriceAmount, c),
      discount: money(l.discountAmount, c),
      tax: money(l.taxAmount, c),
      total: money(l.totalAmount, c),
      fulfilledQuantity: l.fulfilledQuantity,
      refundedQuantity: l.refundedQuantity,
      restockable: Math.max(0, l.fulfilledQuantity - (restockedBy.get(l.id) ?? 0)),
      requiresShipping: l.requiresShipping,
    })),
    shippingAddress: address("SHIPPING"),
    billingAddress: address("BILLING"),
    shippingLine: shipping[0]
      ? { title: shipping[0].title, amount: money(shipping[0].amount, c) }
      : null,
    discounts: discounts.map((d) => ({ code: d.code, title: d.title, amount: money(d.amount, c) })),
    taxLines: taxes.map((t) => ({ title: t.title, amount: money(t.amount, c) })),
    payments: payments.map((p) => ({
      id: publicId("payment", p.id),
      provider: p.provider,
      status: p.status,
      amount: money(p.amount, c),
      captured: money(p.captured, c),
      refunded: money(p.refunded, c),
      refundable: money(p.captured - p.refunded - p.pending, c),
      capturedAt: p.captured_at,
      primary: p.id === primaryId,
    })),
    refunds: refunds.map((r) => ({
      id: publicId("refund", r.id),
      amount: money(r.amount, c),
      status: r.status,
      reason: r.reason,
      failureMessage: r.failureMessage,
      createdAt: r.createdAt,
      lines: r.lines.map((l) => ({
        productTitle: l.orderLine.productTitle,
        quantity: l.quantity,
        restocked: l.restockLocationId !== null,
      })),
    })),
    fulfilments: fulfilments.map((f) => ({
      id: publicId("fulfilment", f.id),
      createdAt: f.createdAt,
      locationName: f.location.name,
      method: f.method,
      shipmentStatus: f.shipmentStatus,
      shippedAt: f.shippedAt,
      deliveredAt: f.deliveredAt,
      trackingCompany: f.trackingCompany,
      trackingNumber: f.trackingNumber,
      trackingUrl: f.trackingUrl,
      lines: f.lines.map((l) => ({ productTitle: l.orderLine.productTitle, quantity: l.quantity })),
    })),
    events: events.map((e) => ({
      type: e.type,
      message: e.message,
      createdAt: e.created_at,
      actorName: e.actor,
    })),
    customer: order.customerId
      ? { id: publicId("customer", order.customerId), orderCount: customerOrders }
      : null,
    canCancel:
      order.status === "OPEN" &&
      order.completedAt === null &&
      lines.every((l) => l.fulfilledQuantity === 0),
    unfulfilledQuantity: order.status === "OPEN" && order.completedAt === null ? unfulfilled : 0,
  };
}

export async function getOrder(ctx: TenantContext, orderPublicId: unknown): Promise<OrderDetail> {
  const orderId = internalId("order", orderPublicId);
  return inStore(ctx, "order.read", async (tx) => {
    const detail = await loadOrderDetail(tx, orderId);
    if (!detail) throw notFound();
    return detail;
  });
}

// ---------------------------------------------------------------------------
// Overview numbers (basic, real)
// ---------------------------------------------------------------------------

export interface OrderMetrics {
  readonly ordersToday: number;
  readonly orders30d: number;
  /** Paid revenue over 30 days (order totals minus refunds; cancelled orders excluded). */
  readonly revenue30d: MoneyJson | null;
  readonly unfulfilled: number;
  readonly awaitingRefund: number;
}

export async function orderMetrics(ctx: TenantContext): Promise<OrderMetrics> {
  return inStore(ctx, "order.read", async (tx) => {
    const rows = await tx.$queryRaw<
      {
        today: number;
        month: number;
        revenue: bigint | null;
        currency: string | null;
        unfulfilled: number;
        pending_refunds: number;
      }[]
    >`
      SELECT
        count(*) FILTER (WHERE "placedAt" >= date_trunc('day', now()))::int AS today,
        count(*) FILTER (WHERE "placedAt" >= now() - interval '30 days')::int AS month,
        sum("totalAmount" - "refundedAmount") FILTER (WHERE "placedAt" >= now() - interval '30 days'
          AND status = 'OPEN')::bigint AS revenue,
        max(currency) AS currency,
        count(*) FILTER (WHERE status = 'OPEN' AND "fulfilmentStatus" <> 'FULFILLED')::int AS unfulfilled,
        (SELECT count(*)::int FROM "Refund" WHERE status = 'PENDING') AS pending_refunds
      FROM "Order"`;
    const r = rows[0];
    return {
      ordersToday: r?.today ?? 0,
      orders30d: r?.month ?? 0,
      revenue30d: r?.currency && r.revenue !== null ? money(r.revenue, r.currency) : null,
      unfulfilled: r?.unfulfilled ?? 0,
      awaitingRefund: r?.pending_refunds ?? 0,
    };
  });
}
