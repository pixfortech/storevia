// Dates for organisation pages, formatted on the server so the markup the
// client hydrates is identical (no locale or time-zone drift between the
// server and the browser).

const DAY = 24 * 60 * 60 * 1000;

/** "24 September 2026". */
export function formatLongDate(date: Date, timeZone = "UTC", locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
}

/** "24 Sep 2026". */
export function formatShortDate(date: Date, timeZone = "UTC", locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(date);
}

/** Calendar days from `now` to `date` in `timeZone` (0 = the same day). */
function calendarDaysUntil(date: Date, now: Date, timeZone: string): number {
  const dayNumber = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return Math.round(Date.parse(`${parts}T00:00:00Z`) / DAY);
  };
  return dayNumber(date) - dayNumber(now);
}

/** "Expires today", "Expires tomorrow", "Expires in 6 days", "Expired". */
export function expiryText(expiresAt: Date, now: Date, timeZone = "UTC"): string {
  if (expiresAt.getTime() <= now.getTime()) return "Expired";
  const days = calendarDaysUntil(expiresAt, now, timeZone);
  if (days <= 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${String(days)} days`;
}
