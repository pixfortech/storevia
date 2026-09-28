// The order lifecycle after payment: fulfilment, delivery and completion
// (post-M7 order operations). Pure rules shared by the services, the
// dashboard and the shopper's order page. Payment, fulfilment and delivery
// stay separate states; "complete" is an explicit merchant step.

export type FulfilmentMethod = "SHIPPING" | "LOCAL_DELIVERY";
export type ShipmentStatus = "READY" | "SHIPPED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED";
export type OrderDeliveryStatus =
  "NOT_STARTED" | "READY" | "IN_TRANSIT" | "PARTIALLY_DELIVERED" | "DELIVERED";
export type OrderState = "OPEN" | "COMPLETED" | "CANCELLED";

/** The statuses a fulfilment may take, in journey order, per method. */
export const SHIPMENT_FLOW: Readonly<Record<FulfilmentMethod, readonly ShipmentStatus[]>> = {
  SHIPPING: ["READY", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
  LOCAL_DELIVERY: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"],
};

export const SHIPMENT_LABELS: Readonly<Record<ShipmentStatus, string>> = {
  READY: "Ready",
  SHIPPED: "Shipped",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
};

export const METHOD_LABELS: Readonly<Record<FulfilmentMethod, string>> = {
  SHIPPING: "Shipping (carrier)",
  LOCAL_DELIVERY: "Local delivery",
};

export const DELIVERY_LABELS: Readonly<Record<OrderDeliveryStatus, string>> = {
  NOT_STARTED: "Not started",
  READY: "Ready",
  IN_TRANSIT: "On its way",
  PARTIALLY_DELIVERED: "Partially delivered",
  DELIVERED: "Delivered",
};

export function isFulfilmentMethod(value: unknown): value is FulfilmentMethod {
  return value === "SHIPPING" || value === "LOCAL_DELIVERY";
}

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return typeof value === "string" && (SHIPMENT_FLOW.SHIPPING as readonly string[]).includes(value);
}

export function allowedStatus(method: FulfilmentMethod, status: ShipmentStatus): boolean {
  return SHIPMENT_FLOW[method].includes(status);
}

/** Left the store: shipped, in transit, out for delivery or delivered. */
export const isDispatched = (status: ShipmentStatus): boolean => status !== "READY";

/** The next step a merchant would normally take, or null once delivered. */
export function nextShipmentStatus(
  method: FulfilmentMethod,
  status: ShipmentStatus,
): ShipmentStatus | null {
  const flow = SHIPMENT_FLOW[method];
  const i = flow.indexOf(status);
  return i >= 0 && i < flow.length - 1 ? (flow[i + 1] ?? null) : null;
}

export interface FulfilmentStateLike {
  readonly state: "PENDING" | "SUCCESS" | "CANCELLED";
  readonly shipmentStatus: ShipmentStatus;
}

/**
 * Where the order's goods are. DELIVERED needs every unit fulfilled and every
 * fulfilment delivered: a delivered first parcel of a partial order is only
 * "partially delivered".
 */
export function orderDeliveryStatus(
  fulfilmentStatus: string,
  fulfilments: readonly FulfilmentStateLike[],
): OrderDeliveryStatus {
  const active = fulfilments.filter((f) => f.state === "SUCCESS");
  if (active.length === 0) return "NOT_STARTED";
  const delivered = active.filter((f) => f.shipmentStatus === "DELIVERED").length;
  if (delivered === active.length && fulfilmentStatus === "FULFILLED") return "DELIVERED";
  if (delivered > 0) return "PARTIALLY_DELIVERED";
  if (active.some((f) => isDispatched(f.shipmentStatus))) return "IN_TRANSIT";
  return "READY";
}

export function orderState(order: {
  readonly status: "OPEN" | "CANCELLED";
  readonly completedAt: Date | null;
}): OrderState {
  if (order.status === "CANCELLED") return "CANCELLED";
  return order.completedAt ? "COMPLETED" : "OPEN";
}

const SETTLED = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);

/**
 * Why an order can't be completed yet (empty: it can). The merchant may
 * still complete it deliberately, with a reason, and that is audited.
 */
export function completionBlockers(order: {
  readonly status: "OPEN" | "CANCELLED";
  readonly completedAt: Date | null;
  readonly paymentStatus: string;
  readonly fulfilmentStatus: string;
  readonly deliveryStatus: OrderDeliveryStatus;
}): string[] {
  if (order.status === "CANCELLED") return ["The order is cancelled."];
  if (order.completedAt) return ["The order is already complete."];
  const blockers: string[] = [];
  if (!SETTLED.has(order.paymentStatus)) blockers.push("Payment isn't settled.");
  if (order.fulfilmentStatus !== "FULFILLED") blockers.push("Not every item is fulfilled.");
  else if (order.deliveryStatus !== "DELIVERED")
    blockers.push("Not every fulfilment is delivered.");
  return blockers;
}

/** Blockers a merchant can't override: a cancelled or already complete order. */
export const completionImpossible = (order: {
  readonly status: "OPEN" | "CANCELLED";
  readonly completedAt: Date | null;
}): boolean => order.status === "CANCELLED" || order.completedAt !== null;
