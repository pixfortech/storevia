import "server-only";
import { recordMetric } from "@storevia/observability";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { notFound, validationFailed } from "@storevia/types";
import { conflict, inStore, internalId, type TenantTx } from "../internal";
import {
  allowedStatus,
  completionBlockers,
  completionImpossible,
  isDispatched,
  isFulfilmentMethod,
  isShipmentStatus,
  orderDeliveryStatus,
  SHIPMENT_LABELS,
  type FulfilmentMethod,
  type ShipmentStatus,
} from "./lifecycle";
import { cancelOrderStock, orderReservations } from "../checkout/stock";
import { createOrderAccess, revokeOrderAccess } from "./access";
import { orderEvent, queueNotification } from "./records";

// Order operations after payment (post-M7): archiving, the fulfilment
// journey (tracking, shipped, in transit, out for delivery, delivered) and
// completion, plus deleting demo orders where the environment allows it.
// Commercial history is never deleted: real orders are archived.

const scopeOf = (store: { organisationId: string; storeId: string }) => ({
  organisationId: store.organisationId,
  storeId: store.storeId,
});

interface OrderStateRow {
  id: string;
  number: number;
  status: "OPEN" | "CANCELLED";
  payment_status: string;
  fulfilment_status: string;
  email: string | null;
  placed_at: Date;
  archived_at: Date | null;
  completed_at: Date | null;
}

async function lockOrderState(tx: TenantTx, orderId: string): Promise<OrderStateRow> {
  const rows = await tx.$queryRaw<OrderStateRow[]>`
    SELECT id, "orderNumber" AS number, status::text AS status, "paymentStatus"::text AS payment_status,
      "fulfilmentStatus"::text AS fulfilment_status, email, "placedAt" AS placed_at,
      "archivedAt" AS archived_at, "completedAt" AS completed_at
    FROM "Order" WHERE id = ${orderId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

// ---------------------------------------------------------------------------
// Archive: out of the default list, kept whole.
// ---------------------------------------------------------------------------

export async function setOrderArchived(
  ctx: TenantContext,
  orderPublicId: unknown,
  archived: boolean,
): Promise<void> {
  const orderId = internalId("order", orderPublicId);
  await inStore(
    ctx,
    "order.manage",
    async (tx, store) => {
      const order = await lockOrderState(tx, orderId);
      if ((order.archived_at !== null) === archived) return;
      await tx.$executeRaw`
        UPDATE "Order" SET "archivedAt" = ${archived ? new Date() : null}::timestamptz,
          "archivedById" = ${archived ? store.userId : null}::uuid, "updatedAt" = now()
        WHERE id = ${orderId}::uuid`;
      await orderEvent(
        tx,
        scopeOf(store),
        orderId,
        archived ? "order.archived" : "order.unarchived",
        archived ? "Order archived." : "Order restored from the archive.",
        undefined,
        store.userId,
      );
      await recordAudit(
        tx,
        store,
        archived ? "order.archived" : "order.unarchived",
        { type: "Order", id: orderId },
        { orderNumber: order.number },
      );
    },
    { write: true },
  );
}

// ---------------------------------------------------------------------------
// The shopper's link (M8, S4): a leaked link is revoked and a new one sent.
// ---------------------------------------------------------------------------

/**
 * Revokes every link to the order and issues a new one, which is emailed
 * to the order's address in a fresh confirmation. The old links stop
 * working at once. Audited (never with the token); the customer sees no
 * staff note.
 */
export async function resetCustomerOrderLink(
  ctx: TenantContext,
  orderPublicId: unknown,
): Promise<{ readonly revoked: number; readonly emailed: boolean }> {
  const orderId = internalId("order", orderPublicId);
  return inStore(
    ctx,
    "order.manage",
    async (tx, store) => {
      const order = await lockOrderState(tx, orderId);
      const revoked = await revokeOrderAccess(tx, orderId);
      await createOrderAccess(tx, scopeOf(store), orderId);
      const fresh = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "OrderCustomerAccess"
        WHERE "orderId" = ${orderId}::uuid AND "revokedAt" IS NULL
        ORDER BY "createdAt" DESC LIMIT 1`;
      const emailed = order.email !== null && fresh[0] !== undefined;
      if (fresh[0]) {
        await queueNotification(
          tx,
          scopeOf(store),
          orderId,
          "ORDER_CONFIRMATION",
          `link-reset:${fresh[0].id}`,
          order.email,
        );
      }
      await orderEvent(
        tx,
        scopeOf(store),
        orderId,
        "order.link_reset",
        "Customer order link reset. The previous link no longer works.",
        undefined,
        store.userId,
      );
      await recordAudit(
        tx,
        store,
        "order.customer_link_reset",
        { type: "Order", id: orderId },
        { orderNumber: order.number, revoked, emailed },
      );
      recordMetric("orders.customer_link_reset", 1);
      return { revoked, emailed };
    },
    { write: true },
  );
}

// ---------------------------------------------------------------------------
// Demo orders: deleted outright, only where the environment allows it and
// only for orders that never took a live payment (the database refuses
// those whatever the caller).
// ---------------------------------------------------------------------------

/** Development and test data only, unless operations explicitly enable it. */
export function demoOrderDeletionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const stage = env["STOREVIA_ENV"];
  return (
    stage === "development" || stage === "test" || env["DEMO_ORDER_DELETION_ENABLED"] === "true"
  );
}

export async function deleteDemoOrder(
  ctx: TenantContext,
  orderPublicId: unknown,
  input: { readonly confirm?: unknown } = {},
): Promise<void> {
  if (!demoOrderDeletionEnabled()) {
    throw conflict("Orders can't be deleted here. Archive the order instead.");
  }
  const orderId = internalId("order", orderPublicId);
  await inStore(
    ctx,
    "order.manage",
    async (tx, store) => {
      const order = await lockOrderState(tx, orderId);
      if (input.confirm !== `#${String(order.number)}` && input.confirm !== String(order.number)) {
        throw validationFailed({ confirm: `Type #${String(order.number)} to confirm.` });
      }
      const live = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "Payment" p
        JOIN "PaymentProviderConnection" c ON c.id = p."connectionId"
        WHERE p."orderId" = ${orderId}::uuid AND c.mode = 'LIVE'`;
      if ((live[0]?.n ?? 0) > 0) {
        throw conflict("This order took a live payment. It can only be archived.");
      }
      // Units still held for the order go back on sale first.
      if (order.status === "OPEN") {
        const reservations = await orderReservations(tx, orderId);
        await cancelOrderStock(
          tx,
          scopeOf(store),
          orderId,
          reservations.map((r) => ({ reservation: r, quantity: r.quantity })),
          store.userId,
        );
      }
      // Audit first: the entry outlives the order it describes.
      await recordAudit(
        tx,
        store,
        "order.demo_deleted",
        { type: "Order", id: orderId },
        { orderNumber: order.number },
      );
      const rows = await tx.$queryRaw<{ ok: boolean }[]>`
        SELECT app_purge_demo_order(${orderId}::uuid) AS ok`;
      if (!rows[0]?.ok) throw notFound();
    },
    { write: true },
  );
  recordMetric("orders.demo_deleted", 1);
}

// ---------------------------------------------------------------------------
// Fulfilment journey.
// ---------------------------------------------------------------------------

interface FulfilmentRow {
  id: string;
  order_id: string;
  state: "PENDING" | "SUCCESS" | "CANCELLED";
  method: FulfilmentMethod;
  status: ShipmentStatus;
  company: string | null;
  number: string | null;
  url: string | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
}

async function lockFulfilment(
  tx: TenantTx,
  orderId: string,
  fulfilmentId: string,
): Promise<FulfilmentRow> {
  const rows = await tx.$queryRaw<FulfilmentRow[]>`
    SELECT id, "orderId" AS order_id, state::text AS state, method::text AS method,
      "shipmentStatus"::text AS status, "trackingCompany" AS company, "trackingNumber" AS number,
      "trackingUrl" AS url, "shippedAt" AS shipped_at, "deliveredAt" AS delivered_at
    FROM "Fulfilment" WHERE id = ${fulfilmentId}::uuid AND "orderId" = ${orderId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

/** Optional text: undefined leaves it, "" clears it. */
function optionalText(value: unknown, max: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw validationFailed({ [field]: "Enter text." });
  const v = value.trim();
  if (!v) return null;
  if (v.length > max) throw validationFailed({ [field]: `Use at most ${String(max)} characters.` });
  return v;
}

export function validTrackingUrl(value: string | null | undefined): boolean {
  return value == null || (/^https?:\/\/\S+$/i.test(value) && value.length <= 500);
}

/** A date the merchant gives (yyyy-mm-dd or ISO), not in the future. */
function optionalDate(value: unknown, field: string, notBefore: Date): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw validationFailed({ [field]: "Enter a date." });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw validationFailed({ [field]: "Enter a date." });
  if (date.getTime() > Date.now() + 5 * 60_000) {
    throw validationFailed({ [field]: "The date can't be in the future." });
  }
  // A calendar date means that day: it may fall before the order's time of day.
  const earliest = new Date(notBefore.getTime() - 24 * 3600_000);
  if (date < earliest)
    throw validationFailed({ [field]: "The date is before the order was placed." });
  return date;
}

export interface FulfilmentUpdateInput {
  readonly method?: unknown;
  readonly status?: unknown;
  readonly trackingCompany?: unknown;
  readonly trackingNumber?: unknown;
  readonly trackingUrl?: unknown;
  readonly shippedAt?: unknown;
  readonly deliveredAt?: unknown;
}

/**
 * Edits a fulfilment: method, journey status, tracking and dates. Quantities
 * never change here, so fulfilled units can't exceed what was ordered.
 * Once the order is complete only tracking can still be corrected.
 */
export async function updateFulfilment(
  ctx: TenantContext,
  orderPublicId: unknown,
  fulfilmentPublicId: unknown,
  input: FulfilmentUpdateInput,
): Promise<void> {
  const orderId = internalId("order", orderPublicId);
  const fulfilmentId = internalId("fulfilment", fulfilmentPublicId);
  const trackingCompany = optionalText(input.trackingCompany, 100, "trackingCompany");
  const trackingNumber = optionalText(input.trackingNumber, 100, "trackingNumber");
  const trackingUrl = optionalText(input.trackingUrl, 500, "trackingUrl");
  if (!validTrackingUrl(trackingUrl)) {
    throw validationFailed({ trackingUrl: "Enter a full link starting with https://." });
  }
  if (input.method !== undefined && !isFulfilmentMethod(input.method)) {
    throw validationFailed({ method: "Choose shipping or local delivery." });
  }
  if (input.status !== undefined && !isShipmentStatus(input.status)) {
    throw validationFailed({ status: "Choose a status." });
  }
  await inStore(
    ctx,
    "order.manage",
    async (tx, store) => {
      const order = await lockOrderState(tx, orderId);
      if (order.status === "CANCELLED") throw conflict("This order is cancelled.");
      const current = await lockFulfilment(tx, orderId, fulfilmentId);
      if (current.state !== "SUCCESS") throw conflict("This fulfilment was cancelled.");
      const method = (input.method as FulfilmentMethod | undefined) ?? current.method;
      const status = (input.status as ShipmentStatus | undefined) ?? current.status;
      const journeyChanged = method !== current.method || status !== current.status;
      if (order.completed_at && journeyChanged) {
        throw conflict("This order is complete. Only tracking details can still change.");
      }
      if (!allowedStatus(method, status)) {
        throw validationFailed({
          status: `${SHIPMENT_LABELS[status]} isn't a step of ${method === "LOCAL_DELIVERY" ? "local delivery" : "carrier shipping"}.`,
        });
      }
      const givenShipped = optionalDate(input.shippedAt, "shippedAt", order.placed_at);
      const givenDelivered = optionalDate(input.deliveredAt, "deliveredAt", order.placed_at);
      // Dates follow the status unless the merchant set them.
      const shippedAt = isDispatched(status)
        ? (givenShipped ?? current.shipped_at ?? new Date())
        : null;
      const deliveredAt =
        status === "DELIVERED" ? (givenDelivered ?? current.delivered_at ?? new Date()) : null;
      if (deliveredAt && shippedAt && deliveredAt < shippedAt) {
        throw validationFailed({ deliveredAt: "Delivery can't be before it was shipped." });
      }
      const next = {
        company: trackingCompany === undefined ? current.company : trackingCompany,
        number: trackingNumber === undefined ? current.number : trackingNumber,
        url: trackingUrl === undefined ? current.url : trackingUrl,
      };
      await tx.$executeRaw`
        UPDATE "Fulfilment" SET method = ${method}::"FulfilmentMethod",
          "shipmentStatus" = ${status}::"ShipmentStatus",
          "trackingCompany" = ${next.company}, "trackingNumber" = ${next.number},
          "trackingUrl" = ${next.url}, "shippedAt" = ${shippedAt}::timestamptz,
          "deliveredAt" = ${deliveredAt}::timestamptz,
          "updatedAt" = now()
        WHERE id = ${fulfilmentId}::uuid`;

      const trackingChanged =
        next.company !== current.company ||
        next.number !== current.number ||
        next.url !== current.url;
      const scope = scopeOf(store);
      if (status !== current.status) {
        await orderEvent(
          tx,
          scope,
          orderId,
          `fulfilment.${status.toLowerCase()}`,
          `Fulfilment marked ${SHIPMENT_LABELS[status].toLowerCase()}.`,
          { fulfilmentId, from: current.status, to: status },
          store.userId,
        );
      }
      if (method !== current.method) {
        await orderEvent(
          tx,
          scope,
          orderId,
          "fulfilment.method_changed",
          method === "LOCAL_DELIVERY"
            ? "Changed to local delivery."
            : "Changed to carrier shipping.",
          { fulfilmentId },
          store.userId,
        );
      }
      if (trackingChanged) {
        await orderEvent(
          tx,
          scope,
          orderId,
          "fulfilment.tracking_updated",
          next.number
            ? `Tracking ${current.number ? "updated" : "added"}: ${[next.company, next.number].filter(Boolean).join(" ")}.`
            : "Tracking removed.",
          { fulfilmentId },
          store.userId,
        );
      }
      // The shopper hears once, when the parcel first leaves.
      if (!isDispatched(current.status) && isDispatched(status)) {
        await queueNotification(
          tx,
          scope,
          orderId,
          "ORDER_FULFILLED",
          `fulfilment:${fulfilmentId}`,
          order.email,
          fulfilmentId,
        );
      }
      if (status !== current.status || method !== current.method || trackingChanged) {
        await recordAudit(
          tx,
          store,
          status === "DELIVERED" && current.status !== "DELIVERED"
            ? "order.fulfilment_delivered"
            : "order.fulfilment_updated",
          { type: "Order", id: orderId },
          {
            orderNumber: order.number,
            status,
            previousStatus: current.status,
            mode: method,
          },
        );
      }
    },
    { write: true },
  );
  if (input.status === "DELIVERED") recordMetric("orders.fulfilment_delivered", 1);
}

export function markFulfilmentDelivered(
  ctx: TenantContext,
  orderPublicId: unknown,
  fulfilmentPublicId: unknown,
): Promise<void> {
  return updateFulfilment(ctx, orderPublicId, fulfilmentPublicId, { status: "DELIVERED" });
}

// ---------------------------------------------------------------------------
// Completion.
// ---------------------------------------------------------------------------

export interface CompleteInput {
  /** The merchant completes despite the blockers (confirmed in the dialog). */
  readonly override?: unknown;
  readonly reason?: unknown;
}

export async function completeOrder(
  ctx: TenantContext,
  orderPublicId: unknown,
  input: CompleteInput = {},
): Promise<void> {
  const orderId = internalId("order", orderPublicId);
  const override = input.override === true || input.override === "on";
  const reason = optionalText(input.reason, 500, "reason") ?? null;
  await inStore(
    ctx,
    "order.manage",
    async (tx, store) => {
      const order = await lockOrderState(tx, orderId);
      if (completionImpossible({ status: order.status, completedAt: order.completed_at })) {
        if (order.completed_at) return;
        throw conflict("A cancelled order can't be completed.");
      }
      const fulfilments = await tx.$queryRaw<
        { state: "PENDING" | "SUCCESS" | "CANCELLED"; status: ShipmentStatus }[]
      >`
        SELECT state::text AS state, "shipmentStatus"::text AS status FROM "Fulfilment"
        WHERE "orderId" = ${orderId}::uuid`;
      const blockers = completionBlockers({
        status: order.status,
        completedAt: order.completed_at,
        paymentStatus: order.payment_status,
        fulfilmentStatus: order.fulfilment_status,
        deliveryStatus: orderDeliveryStatus(
          order.fulfilment_status,
          fulfilments.map((f) => ({ state: f.state, shipmentStatus: f.status })),
        ),
      });
      if (blockers.length > 0 && !override) {
        throw conflict(`This order can't be completed yet: ${blockers.join(" ")}`);
      }
      if (blockers.length > 0 && !reason) {
        throw validationFailed({ reason: "Say why you're completing it anyway." });
      }
      await tx.$executeRaw`
        UPDATE "Order" SET "completedAt" = now(), "completedById" = ${store.userId}::uuid,
          "updatedAt" = now()
        WHERE id = ${orderId}::uuid AND status = 'OPEN' AND "completedAt" IS NULL`;
      await orderEvent(
        tx,
        scopeOf(store),
        orderId,
        "order.completed",
        blockers.length > 0
          ? `Order marked complete by hand (${blockers.join(" ")}).`
          : "Order marked complete.",
        { override: blockers.length > 0 },
        store.userId,
      );
      await recordAudit(
        tx,
        store,
        "order.completed",
        { type: "Order", id: orderId },
        {
          orderNumber: order.number,
          ...(blockers.length > 0 ? { reason, action: "override" } : {}),
        },
      );
    },
    { write: true },
  );
  recordMetric("orders.completed", 1, { override: override ? "yes" : "no" });
}
