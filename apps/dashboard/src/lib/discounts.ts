// Discount code presentation (client-safe): state badges, the discount in
// words and the store-time-zone date fields the code form uses. They only
// format what the commerce service returns.
import type { BadgeTone } from "@storevia/ui/surfaces";
import { formatMoney } from "./catalogue";

export type DiscountState = "active" | "scheduled" | "expired" | "used_up" | "disabled";

export const DISCOUNT_STATE: Readonly<
  Record<DiscountState, { readonly label: string; readonly tone: BadgeTone }>
> = {
  active: { label: "Active", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  expired: { label: "Expired", tone: "neutral" },
  used_up: { label: "Used up", tone: "warning" },
  disabled: { label: "Disabled", tone: "neutral" },
};

export function discountValueText(d: {
  readonly type: "PERCENTAGE" | "FIXED_AMOUNT";
  readonly percentage: string | null;
  readonly amount: { readonly amount: string; readonly currency: string } | null;
}): string {
  return d.type === "PERCENTAGE" ? `${d.percentage ?? "0"}% off` : `${formatMoney(d.amount)} off`;
}

export function usageText(usageCount: number, usageLimit: number | null): string {
  const used = usageCount.toLocaleString("en-IN");
  return usageLimit === null
    ? `${used} used · no limit`
    : `${used} / ${usageLimit.toLocaleString("en-IN")} used`;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The wall-clock parts of `date` in `timeZone`, as if they were UTC (ms). */
function wallClockMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/**
 * "2026-10-01T09:00" (a datetime-local value) read in `timeZone` → the
 * instant. Null when the value isn't in that form. In a DST gap or overlap
 * it picks the earlier valid instant.
 */
export function zonedLocalToDate(value: string, timeZone: string): Date | null {
  const match = LOCAL.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wall)) return null;
  // Offset at the guess, then again at the corrected instant (DST edges).
  let instant = wall - (wallClockMs(new Date(wall), timeZone) - wall);
  instant = wall - (wallClockMs(new Date(instant), timeZone) - instant);
  return new Date(instant);
}

/** The instant as a datetime-local value ("2026-10-01T09:00") in `timeZone`. */
export function dateToZonedLocal(date: Date, timeZone: string): string {
  return new Date(wallClockMs(date, timeZone)).toISOString().slice(0, 16);
}
