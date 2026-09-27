// Every state transition of checkout, payment and order in one place
// (ADR-0031 §1, §4, §5). Services call assert*Transition before writing a
// status; the database constraints hold the pairs (captured ⇔ capturedAt,
// cancelled ⇔ cancelledAt, completed ⇔ order) regardless.

export type CheckoutStatus = "OPEN" | "PAYMENT_PENDING" | "COMPLETED" | "EXPIRED";
export type PaymentStatus = "PENDING" | "CAPTURED" | "FAILED" | "CANCELLED";
export type OrderStatus = "OPEN" | "CANCELLED";
export type OrderPaymentStatus = "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";
export type OrderFulfilmentStatus = "UNFULFILLED" | "PARTIALLY_FULFILLED" | "FULFILLED";

const CHECKOUT: Readonly<Record<CheckoutStatus, readonly CheckoutStatus[]>> = {
  // OPEN → COMPLETED only through a captured payment whose amount is the
  // checkout's quote (a late capture after a failure); completeCheckout
  // enforces that, not the shopper.
  OPEN: ["PAYMENT_PENDING", "EXPIRED", "COMPLETED"],
  // Failed or cancelled payment → OPEN (stock released); captured → COMPLETED.
  PAYMENT_PENDING: ["OPEN", "COMPLETED", "EXPIRED"],
  COMPLETED: [],
  // A capture that arrives after expiry is still honoured (ADR-0031 §4).
  EXPIRED: ["COMPLETED"],
};

const PAYMENT: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PENDING: ["CAPTURED", "FAILED", "CANCELLED"],
  // The provider reports money taken after Storevia gave up waiting: it is
  // recorded, never ignored.
  FAILED: ["CAPTURED"],
  CANCELLED: ["CAPTURED"],
  CAPTURED: [],
};

const ORDER: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  OPEN: ["CANCELLED"],
  CANCELLED: [],
};

export class TransitionError extends Error {
  constructor(kind: string, from: string, to: string) {
    super(`${kind} can't go from ${from} to ${to}`);
    this.name = "TransitionError";
  }
}

export const canCheckoutTransition = (from: CheckoutStatus, to: CheckoutStatus) =>
  CHECKOUT[from].includes(to);
export const canPaymentTransition = (from: PaymentStatus, to: PaymentStatus) =>
  PAYMENT[from].includes(to);
export const canOrderTransition = (from: OrderStatus, to: OrderStatus) => ORDER[from].includes(to);

export function assertCheckoutTransition(from: CheckoutStatus, to: CheckoutStatus): void {
  if (!canCheckoutTransition(from, to)) throw new TransitionError("checkout", from, to);
}
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canPaymentTransition(from, to)) throw new TransitionError("payment", from, to);
}
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canOrderTransition(from, to)) throw new TransitionError("order", from, to);
}

/** An order's payment status follows from what has been refunded of what was paid. */
export function orderPaymentStatus(total: bigint, refunded: bigint): OrderPaymentStatus {
  if (refunded <= 0n) return "PAID";
  return refunded >= total ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

/** An order's fulfilment status follows from its lines. */
export function orderFulfilmentStatus(
  lines: readonly { readonly quantity: number; readonly fulfilledQuantity: number }[],
): OrderFulfilmentStatus {
  const fulfilled = lines.reduce((n, l) => n + l.fulfilledQuantity, 0);
  if (fulfilled === 0) return "UNFULFILLED";
  return lines.every((l) => l.fulfilledQuantity >= l.quantity)
    ? "FULFILLED"
    : "PARTIALLY_FULFILLED";
}
