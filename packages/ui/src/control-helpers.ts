// Pure helpers for the client controls: Pagination's page list and
// DateRangePicker's periods. No "use client" here, so server components can
// call them too (a function imported from a client module arrives in a server
// component as a client reference it can't call).

/** An entry in Pagination's page list: a page number or a gap. */
export type PaginationRangeItem = number | "ellipsis";

function sequence(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

/**
 * The page list Pagination renders: first and last `boundaries` pages, the
 * current page with `siblings` either side, and "ellipsis" for gaps. The list
 * length is constant while paging (so the controls don't jump), and an
 * ellipsis always stands for two or more pages (never for a single number).
 */
export function paginationRange(
  page: number,
  totalPages: number,
  siblings = 1,
  boundaries = 1,
): PaginationRangeItem[] {
  const total = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0;
  if (total === 0) return [];
  const s = Math.max(0, Math.floor(siblings));
  const b = Math.max(1, Math.floor(boundaries));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), total);

  // Boundaries at both ends, the sibling window and two ellipsis slots.
  if (total <= 2 * b + 2 * s + 3) return sequence(1, total);

  const windowStart = Math.max(Math.min(current - s, total - b - 2 * s - 1), b + 2);
  const windowEnd = Math.min(Math.max(current + s, b + 2 * s + 2), total - b - 1);
  return [
    ...sequence(1, b),
    windowStart > b + 2 ? "ellipsis" : b + 1,
    ...sequence(windowStart, windowEnd),
    windowEnd < total - b - 1 ? "ellipsis" : total - b,
    ...sequence(total - b + 1, total),
  ];
}

/** DateRangePicker's preset periods. */
export type DateRangePreset = "7d" | "30d" | "90d" | "12m";

/** A preset period, or a custom range as ISO dates (yyyy-mm-dd, inclusive). */
export type DateRangeValue =
  { preset: DateRangePreset } | { preset: "custom"; from: string; to: string };

function isoDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The inclusive from/to dates (local, yyyy-mm-dd) a DateRangePicker value
 * covers, ending `today`. "30d" is today and the 29 days before it; "12m"
 * starts the day after the same date a year earlier. Safe to call from
 * server components, e.g. to turn ?range=30d into query bounds.
 */
export function dateRangeBounds(
  value: DateRangeValue,
  today: Date = new Date(),
): { from: string; to: string } {
  if (value.preset === "custom") return { from: value.from, to: value.to };
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  if (value.preset === "12m") {
    // The same day a year earlier (29 Feb clamps to 28 Feb), then the day after.
    const year = end.getFullYear() - 1;
    const lastDay = new Date(year, end.getMonth() + 1, 0).getDate();
    start.setFullYear(year, end.getMonth(), Math.min(end.getDate(), lastDay) + 1);
  } else {
    start.setDate(start.getDate() - (Number.parseInt(value.preset, 10) - 1));
  }
  return { from: isoDate(start), to: isoDate(end) };
}
