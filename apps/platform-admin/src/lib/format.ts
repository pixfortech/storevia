// Display helpers (server and client safe). All dates are shown in UTC so
// staff in different time zones read the same values.

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export const formatDate = (d: Date | null | undefined) => (d ? DATE.format(d) : "—");
export const formatDateTime = (d: Date | null | undefined) =>
  d ? `${DATE_TIME.format(d)} UTC` : "—";
/** yyyy-mm-dd for <input type="date"> (UTC). */
export const dateInputValue = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : "";

export function formatLimit(limit: bigint | "unlimited"): string {
  return limit === "unlimited" ? "Unlimited" : limit.toLocaleString("en-GB");
}

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  MOCK: "Mock billing",
  PAYMENT_PROVIDER: "Payment provider",
};

export const INTERVAL_LABELS: Record<string, string> = { MONTH: "Monthly", YEAR: "Annual" };

export const STATUS_TONES = {
  TRIAL: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  CANCELLED: "warning",
  EXPIRED: "neutral",
} as const;

export function humanise(value: string): string {
  const text = value.replaceAll(/[_.]/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
