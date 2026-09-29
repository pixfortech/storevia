import { Badge, type BadgeSize } from "@storevia/ui/surfaces";
import {
  ARCHIVED_LABEL,
  CANCELLED_LABEL,
  deliveryStatusLabel,
  fulfilmentStatusLabel,
  orderStateLabel,
  paymentStatusLabel,
  STOCK_SHORTAGE_LABEL,
  TEST_ORDER_LABEL,
  type StatusLabel,
} from "@/lib/orders";

// Server-safe status badges. The words carry the status; colour supports it.

export function StatusBadge({
  status,
  size = "sm",
  prefix,
}: {
  status: StatusLabel;
  size?: BadgeSize;
  /** Visually hidden context for screen readers, e.g. "Payment:". */
  prefix?: string;
}) {
  return (
    <Badge size={size} tone={status.tone} variant="dot">
      {prefix ? <span className="sr-only">{prefix} </span> : null}
      {status.label}
    </Badge>
  );
}

/** The TEST badge for an order or payment made through a test connection. */
export function TestBadge({ size = "sm" }: { size?: BadgeSize }) {
  return (
    <Badge size={size} tone={TEST_ORDER_LABEL.tone} variant="outline" data-testid="test-badge">
      {TEST_ORDER_LABEL.label}
      <span className="sr-only"> (no real payment)</span>
    </Badge>
  );
}

/**
 * An order's badges: payment and fulfilment, plus Test, Cancelled, Completed,
 * Archived and Stock shortage when they apply. Payment, fulfilment and
 * delivery are separate states and each gets its own badge.
 */
export function OrderBadges({
  status,
  paymentStatus,
  fulfilmentStatus,
  stockShortage,
  state,
  archived = false,
  testMode = false,
  size = "sm",
}: {
  status: "OPEN" | "CANCELLED";
  paymentStatus: string;
  fulfilmentStatus: string;
  stockShortage: boolean;
  state?: "OPEN" | "COMPLETED" | "CANCELLED";
  archived?: boolean;
  testMode?: boolean;
  size?: BadgeSize;
}) {
  return (
    <>
      {testMode ? <TestBadge size={size} /> : null}
      {status === "CANCELLED" ? <StatusBadge status={CANCELLED_LABEL} size={size} /> : null}
      {state === "COMPLETED" ? (
        <StatusBadge status={orderStateLabel("COMPLETED")} size={size} prefix="Order:" />
      ) : null}
      <StatusBadge status={paymentStatusLabel(paymentStatus)} size={size} prefix="Payment:" />
      {status === "CANCELLED" ? null : (
        <StatusBadge
          status={fulfilmentStatusLabel(fulfilmentStatus)}
          size={size}
          prefix="Fulfilment:"
        />
      )}
      {stockShortage ? <StatusBadge status={STOCK_SHORTAGE_LABEL} size={size} /> : null}
      {archived ? <StatusBadge status={ARCHIVED_LABEL} size={size} /> : null}
    </>
  );
}

/** The order detail's four labelled states: Payment, Fulfilment, Delivery and Order. */
export function OrderStatusPanel({
  paymentStatus,
  fulfilmentStatus,
  deliveryStatus,
  state,
  archived,
}: {
  paymentStatus: string;
  fulfilmentStatus: string;
  deliveryStatus: string;
  state: "OPEN" | "COMPLETED" | "CANCELLED";
  archived: boolean;
}) {
  const items: { term: string; status: StatusLabel; key: string }[] = [
    { term: "Payment", status: paymentStatusLabel(paymentStatus), key: "payment" },
    { term: "Fulfilment", status: fulfilmentStatusLabel(fulfilmentStatus), key: "fulfilment" },
    { term: "Delivery", status: deliveryStatusLabel(deliveryStatus), key: "delivery" },
    { term: "Order", status: orderStateLabel(state), key: "order" },
  ];
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-3" data-testid="order-statuses">
      {items.map((i) => (
        <div key={i.key} className="space-y-1" data-status={i.key}>
          <dt className="text-caption text-ink-muted">{i.term}</dt>
          <dd>
            <StatusBadge status={i.status} size="md" prefix={`${i.term}:`} />
          </dd>
        </div>
      ))}
      {archived ? (
        <div className="space-y-1" data-status="archived">
          <dt className="text-caption text-ink-muted">Archive</dt>
          <dd>
            <StatusBadge status={ARCHIVED_LABEL} size="md" />
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
