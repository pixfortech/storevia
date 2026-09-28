import "server-only";
import { withTenant } from "@storevia/database";
import { createLogger, errorFields, recordMetric } from "@storevia/observability";
import { PaymentProviderError, type RefundResult } from "@storevia/payments";
import {
  recordAudit,
  requirePermission,
  scopeOf,
  type StoreContext,
  type TenantContext,
} from "@storevia/tenancy";
import { notFound, toTypeId, validationFailed } from "@storevia/types";
import { openConnection, type ConnectionRow } from "../checkout/connection";
import { orderFulfilmentStatus, orderPaymentStatus } from "../checkout/state";
import { cancelOrderStock, fulfilStock, orderReservations, restockStock } from "../checkout/stock";
import {
  conflict,
  inStore,
  internalId,
  parseMoneyField,
  requireStoreContext,
  requireWritableStore,
  type TenantTx,
} from "../internal";
import { allocate, format as formatMoney, money, toDecimalString } from "../money";
import {
  allowedStatus,
  isDispatched,
  isFulfilmentMethod,
  isShipmentStatus,
  SHIPMENT_LABELS,
  type FulfilmentMethod,
  type ShipmentStatus,
} from "./lifecycle";
import { orderEvent, queueNotification } from "./records";

// What a merchant does to an order (ADR-0031 §8), under the merchant role:
//
//   fulfil   order.manage   per-line quantities, never more than ordered
//                           minus already fulfilled (row locks + a
//                           conditional update + the CHECK), reserved stock
//                           ships out
//   cancel   order.manage   only while nothing is fulfilled; reserved stock
//                           returns to sale; repeating it is a no-op
//   refund   order.refund   at most captured − (succeeded + pending refunds),
//                           computed under the payment row lock; the provider
//                           is called after commit; restock is an explicit
//                           per-line choice for fulfilled units
//
// Every action writes a timeline event and an audit entry, and (where the
// shopper should hear about it) a notification for the worker.

const log = createLogger({ component: "orders" });

interface OrderRow {
  id: string;
  number: number;
  status: "OPEN" | "CANCELLED";
  completed: boolean;
  email: string | null;
  currency: string;
  total: bigint;
  refunded: bigint;
}

async function lockOrder(tx: TenantTx, orderId: string): Promise<OrderRow> {
  const rows = await tx.$queryRaw<OrderRow[]>`
    SELECT id, "orderNumber" AS number, status::text AS status, "completedAt" IS NOT NULL AS completed,
      email, trim(currency) AS currency,
      "totalAmount" AS total, "refundedAmount" AS refunded
    FROM "Order" WHERE id = ${orderId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

interface LineRow {
  id: string;
  title: string;
  variant_id: string | null;
  quantity: number;
  fulfilled: number;
  refunded: number;
  total: bigint;
}

async function lockLines(tx: TenantTx, orderId: string): Promise<LineRow[]> {
  return tx.$queryRaw<LineRow[]>`
    SELECT id, "productTitle" AS title, "variantId" AS variant_id, quantity,
      "fulfilledQuantity" AS fulfilled, "refundedQuantity" AS refunded, "totalAmount" AS total
    FROM "OrderLine" WHERE "orderId" = ${orderId}::uuid
    ORDER BY id
    FOR UPDATE`;
}

const scope = (store: StoreContext) => ({
  organisationId: store.organisationId,
  storeId: store.storeId,
});

function lineQuantities(
  lines: readonly LineRow[],
  input: unknown,
  field: string,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!Array.isArray(input)) return result;
  for (const entry of input.slice(0, 200)) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { lineId?: unknown; quantity?: unknown };
    let id: string;
    try {
      id = internalId("orderLine", e.lineId);
    } catch {
      throw validationFailed({ [field]: "That item isn't part of this order." });
    }
    if (!lines.some((l) => l.id === id)) {
      throw validationFailed({ [field]: "That item isn't part of this order." });
    }
    const q = typeof e.quantity === "string" ? Number(e.quantity) : e.quantity;
    if (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q > 9999) {
      throw validationFailed({ [field]: "Enter a whole number of items." });
    }
    if (q > 0) result.set(id, (result.get(id) ?? 0) + q);
  }
  return result;
}

const text = (value: unknown, max: number, field: string): string | null => {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > max) {
    throw validationFailed({ [field]: `Use at most ${String(max)} characters.` });
  }
  return v;
};

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

export interface FulfilInput {
  /** Omitted or empty: every unfulfilled unit. */
  readonly lines?: readonly { readonly lineId: unknown; readonly quantity: unknown }[];
  readonly trackingCompany?: unknown;
  readonly trackingNumber?: unknown;
  readonly trackingUrl?: unknown;
  /** SHIPPING (default) or LOCAL_DELIVERY. */
  readonly method?: unknown;
  /** Where the new fulfilment starts (default SHIPPED: it left with this action). */
  readonly status?: unknown;
}

export async function fulfilOrder(
  ctx: TenantContext,
  orderPublicId: unknown,
  input: FulfilInput,
): Promise<{ readonly fulfilmentIds: readonly string[] }> {
  const orderId = internalId("order", orderPublicId);
  const trackingCompany = text(input.trackingCompany, 100, "trackingCompany");
  const trackingNumber = text(input.trackingNumber, 100, "trackingNumber");
  const trackingUrl = text(input.trackingUrl, 500, "trackingUrl");
  if (trackingUrl && !/^https?:\/\/[^\s]+$/i.test(trackingUrl)) {
    throw validationFailed({ trackingUrl: "Enter a full link starting with https://." });
  }
  if (input.method !== undefined && input.method !== "" && !isFulfilmentMethod(input.method)) {
    throw validationFailed({ method: "Choose shipping or local delivery." });
  }
  const method: FulfilmentMethod = isFulfilmentMethod(input.method) ? input.method : "SHIPPING";
  if (input.status !== undefined && input.status !== "" && !isShipmentStatus(input.status)) {
    throw validationFailed({ status: "Choose a status." });
  }
  const initial: ShipmentStatus = isShipmentStatus(input.status)
    ? input.status
    : method === "LOCAL_DELIVERY"
      ? "READY"
      : "SHIPPED";
  if (!allowedStatus(method, initial)) {
    throw validationFailed({
      status: `${SHIPMENT_LABELS[initial]} isn't a step of local delivery.`,
    });
  }
  const dispatched = isDispatched(initial);
  return inStore(
    ctx,
    "order.manage",
    async (tx, store) => {
      const order = await lockOrder(tx, orderId);
      if (order.status === "CANCELLED") throw conflict("A cancelled order can't be fulfilled.");
      if (order.completed) throw conflict("This order is complete.");
      const lines = await lockLines(tx, orderId);
      let requested = lineQuantities(lines, input.lines, "lines");
      if (!input.lines || input.lines.length === 0) {
        requested = new Map(
          lines
            .filter((l) => l.quantity > l.fulfilled)
            .map((l) => [l.id, l.quantity - l.fulfilled]),
        );
      }
      if (requested.size === 0)
        throw validationFailed({ lines: "Choose at least one item to fulfil." });
      for (const [id, q] of requested) {
        const line = lines.find((l) => l.id === id);
        if (!line || q > line.quantity - line.fulfilled) {
          throw conflict(
            `Only ${String(line ? line.quantity - line.fulfilled : 0)} of ${line?.title ?? "this item"} are left to fulfil.`,
          );
        }
      }

      const reservations = await orderReservations(tx, orderId);
      const byLine = new Map(reservations.map((r) => [r.orderLineId, r]));
      let fallback: string | null = null;
      const groups = new Map<string, [string, number][]>();
      for (const [id, q] of requested) {
        let location = byLine.get(id)?.locationId ?? null;
        if (!location) {
          fallback ??=
            (
              await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM "Location" WHERE "isActive" AND "deletedAt" IS NULL
                ORDER BY priority, "createdAt", id LIMIT 1`
            )[0]?.id ?? null;
          location = fallback;
        }
        if (!location) throw conflict("Add an active location before fulfilling orders.");
        groups.set(location, [...(groups.get(location) ?? []), [id, q]]);
      }

      const ids: string[] = [];
      for (const [locationId, entries] of groups) {
        const fulfilment = await tx.fulfilment.create({
          data: {
            organisationId: store.organisationId,
            storeId: store.storeId,
            orderId,
            locationId,
            state: "SUCCESS",
            method,
            shipmentStatus: initial,
            trackingCompany,
            trackingNumber,
            trackingUrl,
            shippedAt: dispatched ? new Date() : null,
            deliveredAt: initial === "DELIVERED" ? new Date() : null,
            createdById: store.userId,
          },
          select: { id: true },
        });
        await tx.fulfilmentLine.createMany({
          data: entries.map(([orderLineId, quantity]) => ({
            organisationId: store.organisationId,
            storeId: store.storeId,
            fulfilmentId: fulfilment.id,
            orderLineId,
            quantity,
          })),
        });
        ids.push(fulfilment.id);
      }
      for (const [id, q] of requested) {
        const updated = await tx.$executeRaw`
          UPDATE "OrderLine" SET "fulfilledQuantity" = "fulfilledQuantity" + ${q}
          WHERE id = ${id}::uuid AND "fulfilledQuantity" + ${q} <= quantity`;
        if (updated !== 1) throw conflict("This order changed. Refresh and try again.");
      }
      await fulfilStock(
        tx,
        scope(store),
        orderId,
        [...requested].flatMap(([id, q]) => {
          const reservation = byLine.get(id);
          return reservation ? [{ reservation, quantity: q }] : [];
        }),
        store.userId,
      );
      const after = lines.map((l) => ({
        quantity: l.quantity,
        fulfilledQuantity: l.fulfilled + (requested.get(l.id) ?? 0),
      }));
      const status = orderFulfilmentStatus(after);
      await tx.$executeRaw`
        UPDATE "Order" SET "fulfilmentStatus" = ${status}::"OrderFulfilmentStatus", "updatedAt" = now()
        WHERE id = ${orderId}::uuid`;
      const units = [...requested.values()].reduce((n, q) => n + q, 0);
      await orderEvent(
        tx,
        scope(store),
        orderId,
        "fulfilment.created",
        `${String(units)} ${units === 1 ? "item" : "items"} fulfilled (${SHIPMENT_LABELS[initial].toLowerCase()}${method === "LOCAL_DELIVERY" ? ", local delivery" : ""})${trackingNumber ? `, tracking ${trackingNumber}` : ""}.`,
        { fulfilmentIds: ids, status: initial, method },
        store.userId,
      );
      // The shopper hears when the parcel leaves (now, or when it's marked so).
      for (const id of dispatched ? ids : []) {
        await queueNotification(
          tx,
          scope(store),
          orderId,
          "ORDER_FULFILLED",
          `fulfilment:${id}`,
          order.email,
          id,
        );
      }
      await recordAudit(
        tx,
        store,
        "order.fulfilled",
        { type: "Order", id: orderId },
        {
          orderNumber: order.number,
          quantity: units,
        },
      );
      return { fulfilmentIds: ids.map((id) => toTypeId("fulfilment", id)) };
    },
    { write: true },
  );
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export interface CancelResult {
  readonly cancelled: boolean;
  /** Set when a refund was asked for. */
  readonly refund: RefundOutcome | null;
}

export async function cancelOrder(
  ctx: TenantContext,
  orderPublicId: unknown,
  input: { readonly reason?: unknown; readonly refund?: unknown },
): Promise<CancelResult> {
  const orderId = internalId("order", orderPublicId);
  const reason = text(input.reason, 500, "reason");
  const wantsRefund = input.refund === true || input.refund === "on";
  const store = requireStoreContext(ctx);
  // Checked up front, so a cancellation never half-happens for lack of refund rights.
  if (wantsRefund) requirePermission(store, "order.refund");
  const cancelled = await inStore(
    ctx,
    "order.manage",
    async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.status === "CANCELLED") return false;
      if (order.completed)
        throw conflict("A completed order can't be cancelled. Refund it instead.");
      const lines = await lockLines(tx, orderId);
      if (lines.some((l) => l.fulfilled > 0)) {
        throw conflict("Orders with fulfilled items can't be cancelled. Refund them instead.");
      }
      const reservations = await orderReservations(tx, orderId);
      await cancelOrderStock(
        tx,
        scope(store),
        orderId,
        reservations.map((r) => ({ reservation: r, quantity: r.quantity })),
        store.userId,
      );
      await tx.$executeRaw`
        UPDATE "Order" SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = ${reason},
          "updatedAt" = now()
        WHERE id = ${orderId}::uuid`;
      await orderEvent(
        tx,
        scope(store),
        orderId,
        "order.cancelled",
        reason ? `Order cancelled: ${reason}` : "Order cancelled.",
        null,
        store.userId,
      );
      await queueNotification(
        tx,
        scope(store),
        orderId,
        "ORDER_CANCELLED",
        `order-cancelled:${orderId}`,
        order.email,
      );
      await recordAudit(
        tx,
        store,
        "order.cancelled",
        { type: "Order", id: orderId },
        {
          orderNumber: order.number,
          reason,
        },
      );
      return true;
    },
    { write: true },
  );
  let refund: RefundOutcome | null = null;
  if (wantsRefund) {
    const remaining = await withTenant(scopeOf(store), async (tx) => {
      const rows = await tx.$queryRaw<{ remaining: bigint; currency: string }[]>`
        SELECT p."capturedAmount" - p."refundedAmount" - coalesce((SELECT sum(r.amount) FROM "Refund" r
          WHERE r."paymentId" = p.id AND r.status = 'PENDING'), 0) AS remaining, trim(p.currency) AS currency
        FROM "Payment" p WHERE p."orderId" = ${orderId}::uuid AND p.status = 'CAPTURED'
        ORDER BY p."capturedAt", p.id LIMIT 1`;
      return rows[0] ?? null;
    });
    if (remaining && remaining.remaining > 0n) {
      refund = await refundOrder(ctx, orderPublicId, {
        amount: toDecimalString(money(remaining.remaining, remaining.currency)),
        reason: reason ?? "Order cancelled",
      });
    }
  }
  return { cancelled, refund };
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export interface RefundInput {
  /** A decimal amount in the order currency, e.g. "499.50". */
  readonly amount: unknown;
  readonly reason?: unknown;
  /** Units being refunded, optionally put back on sale (fulfilled units only). */
  readonly lines?: readonly {
    readonly lineId: unknown;
    readonly quantity: unknown;
    readonly restock?: unknown;
  }[];
  /** Where restocked units go (required when any line restocks). */
  readonly locationId?: unknown;
  /** Which captured payment to refund; defaults to the order's own payment. */
  readonly paymentId?: unknown;
}

export interface RefundOutcome {
  readonly refundId: string;
  readonly status: "PENDING" | "SUCCEEDED" | "FAILED";
  readonly message: string | null;
}

interface PaymentLock {
  id: string;
  connection_id: string;
  provider: string;
  charge: string | null;
  reference: string | null;
  captured: bigint;
  refunded: bigint;
  pending: bigint;
  primary: boolean;
}

export async function refundOrder(
  ctx: TenantContext,
  orderPublicId: unknown,
  input: RefundInput,
): Promise<RefundOutcome> {
  const orderId = internalId("order", orderPublicId);
  const reason = text(input.reason, 500, "reason");
  const store = requireStoreContext(ctx);
  requirePermission(store, "order.refund");
  requireWritableStore(store);

  const created = await withTenant(scopeOf(store), async (tx) => {
    const order = await lockOrder(tx, orderId);
    const amount = parseMoneyField(
      "amount",
      typeof input.amount === "string" ? input.amount : "",
      order.currency,
    );
    if (amount <= 0n) throw validationFailed({ amount: "Enter an amount greater than zero." });
    const paymentId =
      input.paymentId === undefined || input.paymentId === null || input.paymentId === ""
        ? null
        : internalId("payment", input.paymentId);
    // The payment row lock serialises refunds of one payment: the bound
    // below can't be raced by a concurrent refund.
    const payments = await tx.$queryRaw<PaymentLock[]>`
      SELECT p.id, p."connectionId" AS connection_id, p.provider, p."providerChargeId" AS charge,
        p."providerPaymentId" AS reference, p."capturedAmount" AS captured,
        p."refundedAmount" AS refunded,
        coalesce((SELECT sum(r.amount) FROM "Refund" r
          WHERE r."paymentId" = p.id AND r.status = 'PENDING'), 0)::bigint AS pending,
        p.id = (SELECT q.id FROM "Payment" q WHERE q."orderId" = p."orderId" AND q.status = 'CAPTURED'
          ORDER BY q."capturedAt", q.id LIMIT 1) AS primary
      FROM "Payment" p
      WHERE p."orderId" = ${orderId}::uuid AND p.status = 'CAPTURED'
        AND (${paymentId}::uuid IS NULL OR p.id = ${paymentId}::uuid)
      ORDER BY p."capturedAt", p.id
      LIMIT 1
      FOR UPDATE OF p`;
    const payment = payments[0];
    if (!payment) throw conflict("This order has no captured payment to refund.");
    const remaining = payment.captured - payment.refunded - payment.pending;
    if (amount > remaining) {
      throw validationFailed({
        amount:
          remaining > 0n
            ? `You can refund up to ${formatMoney(money(remaining, order.currency))}.`
            : "This payment has been refunded in full.",
      });
    }

    // Lines: refunded units and optional restock.
    const lines = await lockLines(tx, orderId);
    const pendingLines = await tx.$queryRaw<{ line: string; quantity: number; restock: number }[]>`
      SELECT rl."orderLineId" AS line, sum(rl.quantity)::int AS quantity,
        sum(CASE WHEN rl."restockLocationId" IS NOT NULL THEN rl.quantity ELSE 0 END)::int AS restock
      FROM "RefundLine" rl JOIN "Refund" r ON r.id = rl."refundId"
      WHERE r."orderId" = ${orderId}::uuid AND r.status IN ('PENDING', 'SUCCEEDED')
      GROUP BY rl."orderLineId"`;
    const pendingRefunded = await tx.$queryRaw<{ line: string; quantity: number }[]>`
      SELECT rl."orderLineId" AS line, sum(rl.quantity)::int AS quantity
      FROM "RefundLine" rl JOIN "Refund" r ON r.id = rl."refundId"
      WHERE r."orderId" = ${orderId}::uuid AND r.status = 'PENDING'
      GROUP BY rl."orderLineId"`;
    const quantities = lineQuantities(lines, input.lines, "lines");
    const restocking = new Set<string>();
    for (const entry of input.lines ?? []) {
      if (entry.restock === true || entry.restock === "on") {
        try {
          restocking.add(internalId("orderLine", entry.lineId));
        } catch {
          // Reported by lineQuantities above.
        }
      }
    }
    for (const [id, q] of quantities) {
      const line = lines.find((l) => l.id === id);
      if (!line) continue;
      const inFlight = pendingRefunded.find((p) => p.line === id)?.quantity ?? 0;
      if (q > line.quantity - line.refunded - inFlight) {
        throw validationFailed({ lines: `Too many units of ${line.title} for a refund.` });
      }
      if (restocking.has(id)) {
        const restocked = pendingLines.find((p) => p.line === id)?.restock ?? 0;
        if (q > line.fulfilled - restocked) {
          throw validationFailed({
            lines: `Only fulfilled units of ${line.title} can be restocked.`,
          });
        }
      }
    }
    let locationId: string | null = null;
    if ([...quantities.keys()].some((id) => restocking.has(id))) {
      try {
        locationId = internalId("location", input.locationId);
      } catch {
        throw validationFailed({ locationId: "Choose where the items go back into stock." });
      }
      const location = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Location" WHERE id = ${locationId}::uuid AND "isActive" AND "deletedAt" IS NULL`;
      if (!location[0]) throw validationFailed({ locationId: "Choose an active location." });
    }

    // The refund's amount spread over its lines by what those units cost
    // (largest remainder), for reporting; the total is what's refunded.
    const weights = [...quantities].map(([id, q]) => {
      const line = lines.find((l) => l.id === id);
      return line ? (line.total * BigInt(q)) / BigInt(line.quantity) : 0n;
    });
    const lineAmounts =
      weights.length > 0 && weights.some((w) => w > 0n)
        ? allocate(money(amount, order.currency), weights).map((m) => m.amount)
        : weights.map(() => 0n);
    const refund = await tx.refund.create({
      data: {
        organisationId: store.organisationId,
        storeId: store.storeId,
        orderId,
        paymentId: payment.id,
        status: "PENDING",
        currency: order.currency,
        amount,
        reason,
        idempotencyKey: `refund:${crypto.randomUUID()}`,
        createdById: store.userId,
      },
      select: { id: true },
    });
    if (quantities.size > 0) {
      await tx.refundLine.createMany({
        data: [...quantities].map(([orderLineId, quantity], i) => ({
          organisationId: store.organisationId,
          storeId: store.storeId,
          refundId: refund.id,
          orderLineId,
          quantity,
          amount: lineAmounts[i] ?? 0n,
          restockLocationId: restocking.has(orderLineId) ? locationId : null,
        })),
      });
    }
    await orderEvent(
      tx,
      scope(store),
      orderId,
      "refund.requested",
      `Refund of ${formatMoney(money(amount, order.currency))} requested${reason ? `: ${reason}` : "."}`,
      { refundId: refund.id },
      store.userId,
    );
    await recordAudit(
      tx,
      store,
      "order.refund.created",
      { type: "Order", id: orderId },
      {
        orderNumber: order.number,
        amount: amount.toString(),
        currency: order.currency,
        reason,
      },
    );
    const connection = await tx.$queryRaw<ConnectionRow[]>`
      SELECT id, "storeId", provider, status::text AS status,
        "credentialsCiphertext" AS ciphertext, "keyVersion"
      FROM "PaymentProviderConnection" WHERE id = ${payment.connection_id}::uuid`;
    return {
      refundId: refund.id,
      amount,
      currency: order.currency,
      chargeId: payment.charge ?? payment.reference,
      connection: connection[0] ?? null,
    };
  });

  // The provider call, after commit: the pending refund already counts
  // against the bound, so a concurrent refund can't over-refund meanwhile.
  let result: RefundResult | null = null;
  let note: string | null = null;
  try {
    const open = created.connection ? openConnection(created.connection) : null;
    if (!open || !created.chargeId) {
      result = {
        providerRefundId: null,
        status: "failed",
        failureMessage: "The payment provider isn't available for this store right now.",
      };
    } else {
      result = await open.provider.refundPayment(open.credentials, {
        chargeId: created.chargeId,
        amount: created.amount,
        currency: created.currency,
        reference: toTypeId("refund", created.refundId),
      });
    }
  } catch (error) {
    log.warn("refund call failed", { refundId: created.refundId, ...errorFields(error) });
    if (error instanceof PaymentProviderError && !error.retryable) {
      result = {
        providerRefundId: null,
        status: "failed",
        failureMessage: "The payment provider declined the refund.",
      };
    } else {
      note =
        "The payment provider didn't confirm this refund. Check your provider dashboard, then mark it as refunded or failed.";
    }
  }

  const outcome = await withTenant(scopeOf(store), (tx) =>
    settleRefund(tx, store, orderId, created.refundId, result, note),
  );
  recordMetric("orders.refund", 1, { status: outcome.status.toLowerCase() });
  return outcome;
}

/**
 * Records a refund's outcome (from the provider, or from the merchant after
 * checking the provider's dashboard). Only a PENDING refund changes.
 */
async function settleRefund(
  tx: TenantTx,
  store: StoreContext,
  orderId: string,
  refundId: string,
  result: RefundResult | null,
  note: string | null,
): Promise<RefundOutcome> {
  const refunds = await tx.$queryRaw<
    {
      status: "PENDING" | "SUCCEEDED" | "FAILED";
      amount: bigint;
      payment_id: string;
      currency: string;
    }[]
  >`
    SELECT status::text AS status, amount, "paymentId" AS payment_id, trim(currency) AS currency
    FROM "Refund" WHERE id = ${refundId}::uuid AND "orderId" = ${orderId}::uuid FOR UPDATE`;
  const refund = refunds[0];
  if (!refund) throw notFound();
  const publicRefund = toTypeId("refund", refundId);
  if (refund.status !== "PENDING") {
    return { refundId: publicRefund, status: refund.status, message: null };
  }
  if (!result) {
    if (note) {
      await tx.$executeRaw`
        UPDATE "Refund" SET "failureMessage" = ${note}, "updatedAt" = now() WHERE id = ${refundId}::uuid`;
    }
    return { refundId: publicRefund, status: "PENDING", message: note };
  }
  if (result.status === "failed") {
    const message = result.failureMessage ?? "The payment provider declined the refund.";
    await tx.$executeRaw`
      UPDATE "Refund" SET status = 'FAILED', "failureMessage" = ${message}, "updatedAt" = now()
      WHERE id = ${refundId}::uuid`;
    await orderEvent(tx, scope(store), orderId, "refund.failed", `Refund failed: ${message}`, {
      refundId,
    });
    return { refundId: publicRefund, status: "FAILED", message };
  }

  // Accepted by the provider (processed, or queued for settlement): money is committed back.
  const order = await lockOrder(tx, orderId);
  const payment = await tx.$queryRaw<{ primary: boolean }[]>`
    SELECT p.id = (SELECT q.id FROM "Payment" q WHERE q."orderId" = ${orderId}::uuid
      AND q.status = 'CAPTURED' ORDER BY q."capturedAt", q.id LIMIT 1) AS primary
    FROM "Payment" p WHERE p.id = ${refund.payment_id}::uuid FOR UPDATE`;
  const moved = await tx.$executeRaw`
    UPDATE "Payment" SET "refundedAmount" = "refundedAmount" + ${refund.amount}, "updatedAt" = now()
    WHERE id = ${refund.payment_id}::uuid AND "refundedAmount" + ${refund.amount} <= "capturedAmount"`;
  if (moved !== 1) throw conflict("This refund would exceed the captured amount.");
  await tx.$executeRaw`
    UPDATE "Refund" SET status = 'SUCCEEDED', "providerRefundId" = ${result.providerRefundId},
      "failureMessage" = NULL, "updatedAt" = now()
    WHERE id = ${refundId}::uuid`;
  if (payment[0]?.primary) {
    const refunded = order.refunded + refund.amount;
    await tx.$executeRaw`
      UPDATE "Order" SET "refundedAmount" = ${refunded},
        "paymentStatus" = ${orderPaymentStatus(order.total, refunded)}::"OrderPaymentStatus",
        "updatedAt" = now()
      WHERE id = ${orderId}::uuid`;
  }
  const lines = await tx.$queryRaw<
    { line: string; quantity: number; location: string | null; item: string | null }[]
  >`
    SELECT rl."orderLineId" AS line, rl.quantity, rl."restockLocationId" AS location, ii.id AS item
    FROM "RefundLine" rl
    JOIN "OrderLine" ol ON ol.id = rl."orderLineId"
    LEFT JOIN "InventoryItem" ii ON ii."variantId" = ol."variantId" AND ii.tracked
    WHERE rl."refundId" = ${refundId}::uuid`;
  for (const l of lines) {
    const updated = await tx.$executeRaw`
      UPDATE "OrderLine" SET "refundedQuantity" = "refundedQuantity" + ${l.quantity}
      WHERE id = ${l.line}::uuid AND "refundedQuantity" + ${l.quantity} <= quantity`;
    if (updated !== 1) throw conflict("This refund covers more units than were ordered.");
  }
  await restockStock(
    tx,
    scope(store),
    orderId,
    lines
      .filter((l) => l.location && l.item)
      .map((l) => ({ itemId: l.item ?? "", locationId: l.location ?? "", quantity: l.quantity })),
    store.userId,
  );
  await orderEvent(
    tx,
    scope(store),
    orderId,
    "refund.succeeded",
    `Refunded ${formatMoney(money(refund.amount, refund.currency))}.`,
    { refundId },
  );
  await queueNotification(
    tx,
    scope(store),
    orderId,
    "REFUND_CREATED",
    `refund:${refundId}`,
    order.email,
    refundId,
  );
  return { refundId: publicRefund, status: "SUCCEEDED", message: null };
}

/**
 * The merchant settles a refund the provider didn't confirm, after checking
 * the provider's dashboard.
 */
export async function resolvePendingRefund(
  ctx: TenantContext,
  orderPublicId: unknown,
  refundPublicId: unknown,
  outcome: "succeeded" | "failed",
): Promise<RefundOutcome> {
  const orderId = internalId("order", orderPublicId);
  const refundId = internalId("refund", refundPublicId);
  return inStore(
    ctx,
    "order.refund",
    async (tx, store) => {
      const result: RefundResult =
        outcome === "succeeded"
          ? { providerRefundId: null, status: "succeeded" }
          : {
              providerRefundId: null,
              status: "failed",
              failureMessage: "Marked as failed by staff.",
            };
      const settled = await settleRefund(tx, store, orderId, refundId, result, null);
      await recordAudit(
        tx,
        store,
        "order.refund.resolved",
        { type: "Refund", id: refundId },
        {
          status: settled.status,
        },
      );
      return settled;
    },
    { write: true },
  );
}

export async function updateOrderNote(
  ctx: TenantContext,
  orderPublicId: unknown,
  input: { readonly note: unknown },
): Promise<void> {
  const orderId = internalId("order", orderPublicId);
  const note = text(input.note, 5000, "note");
  await inStore(
    ctx,
    "order.manage",
    async (tx, store) => {
      const updated = await tx.$executeRaw`
        UPDATE "Order" SET note = ${note}, "updatedAt" = now() WHERE id = ${orderId}::uuid`;
      if (updated === 0) throw notFound();
      await recordAudit(tx, store, "order.note.updated", { type: "Order", id: orderId });
    },
    { write: true },
  );
}
