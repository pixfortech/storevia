import { Badge, type BadgeSize } from "@storevia/ui/surfaces";
import {
  CANCELLED_LABEL,
  fulfilmentStatusLabel,
  paymentStatusLabel,
  STOCK_SHORTAGE_LABEL,
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

/** Payment and fulfilment badges for an order, plus Cancelled and Stock shortage when set. */
export function OrderBadges({
  status,
  paymentStatus,
  fulfilmentStatus,
  stockShortage,
  size = "sm",
}: {
  status: "OPEN" | "CANCELLED";
  paymentStatus: string;
  fulfilmentStatus: string;
  stockShortage: boolean;
  size?: BadgeSize;
}) {
  return (
    <>
      {status === "CANCELLED" ? <StatusBadge status={CANCELLED_LABEL} size={size} /> : null}
      <StatusBadge status={paymentStatusLabel(paymentStatus)} size={size} prefix="Payment:" />
      {status === "CANCELLED" ? null : (
        <StatusBadge
          status={fulfilmentStatusLabel(fulfilmentStatus)}
          size={size}
          prefix="Fulfilment:"
        />
      )}
      {stockShortage ? <StatusBadge status={STOCK_SHORTAGE_LABEL} size={size} /> : null}
    </>
  );
}
