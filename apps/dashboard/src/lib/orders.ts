// Order and customer presentation helpers (client-safe): paths, status
// badges and wording. They only format what the commerce services return;
// every status is shown in words, colour only supports it.
import type { BadgeTone } from "@storevia/ui/surfaces";
import { storePath } from "./ids";

/** A store path from its internal id or its public id ("store_…"). */
const inStore = (storeId: string, suffix: string) =>
  storeId.startsWith("store_") ? `/s/${storeId}${suffix}` : storePath(storeId, suffix);

export const ordersPath = (storeId: string, suffix = "") => inStore(storeId, `/orders${suffix}`);
export const orderPath = (storeId: string, orderId: string) => ordersPath(storeId, `/${orderId}`);
export const customersPath = (storeId: string, suffix = "") =>
  inStore(storeId, `/customers${suffix}`);
export const customerPath = (storeId: string, customerId: string) =>
  customersPath(storeId, `/${customerId}`);

export interface StatusLabel {
  readonly label: string;
  readonly tone: BadgeTone;
}

/** "SOME_VALUE" → "Some value", for a status this build doesn't know yet. */
const humanise = (value: string) => {
  const words = value.toLowerCase().replace(/[_.]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
};

const lookup = (map: Readonly<Record<string, StatusLabel>>, value: string): StatusLabel =>
  map[value] ?? { label: humanise(value), tone: "neutral" };

/** The order's payment state (OrderPaymentStatus). */
const ORDER_PAYMENT: Readonly<Record<string, StatusLabel>> = {
  PENDING: { label: "Payment pending", tone: "warning" },
  AUTHORISED: { label: "Authorised", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", tone: "info" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  FAILED: { label: "Payment failed", tone: "danger" },
  VOIDED: { label: "Voided", tone: "neutral" },
};

const ORDER_FULFILMENT: Readonly<Record<string, StatusLabel>> = {
  UNFULFILLED: { label: "Unfulfilled", tone: "warning" },
  PARTIALLY_FULFILLED: { label: "Partially fulfilled", tone: "info" },
  FULFILLED: { label: "Fulfilled", tone: "success" },
};

/** Where the goods are, across the order's fulfilments. */
const ORDER_DELIVERY: Readonly<Record<string, StatusLabel>> = {
  NOT_STARTED: { label: "Not shipped", tone: "neutral" },
  READY: { label: "Ready to send", tone: "info" },
  IN_TRANSIT: { label: "On its way", tone: "info" },
  PARTIALLY_DELIVERED: { label: "Partially delivered", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "success" },
};

/** One fulfilment's journey step. */
const SHIPMENT: Readonly<Record<string, StatusLabel>> = {
  READY: { label: "Ready", tone: "neutral" },
  SHIPPED: { label: "Shipped", tone: "info" },
  IN_TRANSIT: { label: "In transit", tone: "info" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "success" },
};

const ORDER_STATE: Readonly<Record<string, StatusLabel>> = {
  OPEN: { label: "Open", tone: "neutral" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

/** One payment's state with the provider (PaymentStatus). */
const PAYMENT: Readonly<Record<string, StatusLabel>> = {
  PENDING: { label: "Pending", tone: "warning" },
  REQUIRES_ACTION: { label: "Needs customer action", tone: "warning" },
  AUTHORISED: { label: "Authorised", tone: "info" },
  CAPTURED: { label: "Captured", tone: "success" },
  PARTIALLY_CAPTURED: { label: "Partially captured", tone: "info" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const REFUND: Readonly<Record<string, StatusLabel>> = {
  PENDING: { label: "Refund pending", tone: "warning" },
  SUCCEEDED: { label: "Refunded", tone: "success" },
  FAILED: { label: "Refund failed", tone: "danger" },
};

export const paymentStatusLabel = (status: string) => lookup(ORDER_PAYMENT, status);
export const fulfilmentStatusLabel = (status: string) => lookup(ORDER_FULFILMENT, status);
export const paymentRecordLabel = (status: string) => lookup(PAYMENT, status);
export const refundStatusLabel = (status: string) => lookup(REFUND, status);
export const deliveryStatusLabel = (status: string) => lookup(ORDER_DELIVERY, status);
export const shipmentStatusLabel = (status: string) => lookup(SHIPMENT, status);
export const orderStateLabel = (state: string) => lookup(ORDER_STATE, state);

export const CANCELLED_LABEL: StatusLabel = { label: "Cancelled", tone: "danger" };
export const STOCK_SHORTAGE_LABEL: StatusLabel = { label: "Stock shortage", tone: "danger" };
export const ARCHIVED_LABEL: StatusLabel = { label: "Archived", tone: "neutral" };
/** Paid through a test connection: no real money, left out of every sales figure. */
export const TEST_ORDER_LABEL: StatusLabel = { label: "TEST", tone: "accent" };

const PROVIDERS: Readonly<Record<string, string>> = {
  razorpay: "Razorpay",
  "storevia-test": "Test payments",
};

export const providerLabel = (provider: string) => PROVIDERS[provider] ?? humanise(provider);

/** "#1001". */
export const orderNumber = (n: number) => `#${String(n)}`;

export type OrderTab =
  "all" | "unfulfilled" | "unpaid" | "completed" | "cancelled" | "test" | "archived";

/**
 * Every tab but Archived leaves archived orders out, and every tab but Test
 * and Archived leaves test orders out.
 */
export const ORDER_TABS: readonly { readonly value: OrderTab; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "unpaid", label: "Unpaid" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "test", label: "Test orders" },
  { value: "archived", label: "Archived orders" },
];

export function parseOrderTab(value: string | undefined): OrderTab {
  return ORDER_TABS.some((t) => t.value === value) ? (value as OrderTab) : "all";
}

/** "24 Sep 2026, 14:05" in the store's time zone (formatted on the server). */
export function formatDateTime(date: Date, timeZone = "UTC", locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

/** An address as display lines, skipping empty parts. */
export function addressLines(
  address: {
    readonly firstName: string | null;
    readonly lastName: string | null;
    readonly company: string | null;
    readonly line1: string;
    readonly line2: string | null;
    readonly city: string | null;
    readonly region: string | null;
    readonly postalCode: string | null;
    readonly countryCode: string;
  },
  countryName: (code: string) => string = (code) => code,
): string[] {
  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const cityLine = [address.city, address.region, address.postalCode].filter(Boolean).join(", ");
  return [
    name,
    address.company ?? "",
    address.line1,
    address.line2 ?? "",
    cityLine,
    countryName(address.countryCode),
  ].filter((line) => line.trim().length > 0);
}
