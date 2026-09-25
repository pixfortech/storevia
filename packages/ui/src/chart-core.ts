// Chart geometry, formatting and data shaping (charts.tsx). Pure functions
// with no React or DOM, so they can be unit-tested and run during SSR.
//
// The chart language follows docs/design/design-plan.md §4 and the dataviz
// method: categorical colour in a fixed order, thin marks, hairline grid,
// 3–5 "nice" y ticks and a table twin for every chart.

/** An x value: a category label, a number or a date (rendered in UTC). */
export type ChartX = string | number | Date;

/** One point. `y: null` is a gap (missing data), never drawn as zero. */
export interface ChartDatum {
  x: ChartX;
  y: number | null;
}

/**
 * Categorical slots, in their fixed order. "primary" (chart-1, blue) is the
 * subject, "comparison" (chart-2, violet) the second series and "muted"
 * (chart-muted, grey, dashed on lines) the previous period or history.
 * "tertiary" (chart-3) exists for part-to-whole charts only.
 */
export type ChartTone = "primary" | "comparison" | "tertiary" | "muted";

export interface ChartSeries {
  /** Stable id: colour follows the entity, so keep ids stable across filters. */
  id: string;
  label: string;
  data: readonly ChartDatum[];
  /** Pin a slot. Defaults to the fixed order: primary, comparison, muted. */
  tone?: ChartTone | undefined;
}

/**
 * Number formatting: Intl.NumberFormat options (serialisable, so they work
 * from server components) or a function (client components only).
 */
export type ChartValueFormat = Intl.NumberFormatOptions | ((value: number) => string);

/** Formatting for Date x values: Intl.DateTimeFormat options or a function. */
export type ChartXFormat = Intl.DateTimeFormatOptions | ((x: ChartX) => string);

/** Line and area series use slots in this order; never cycled. */
export const CHART_LINE_TONES = ["primary", "comparison", "muted"] as const;
/** Part-to-whole segments (donut): three validated slots, then "Other". */
export const CHART_PART_TONES = ["primary", "comparison", "tertiary"] as const;
export const CHART_DEFAULT_LOCALE = "en-US";

/* ---------------------------------------------------------------------------
 * Scales and ticks
 * ------------------------------------------------------------------------- */

/** Map a domain onto a range linearly. A zero-width domain maps to the range start. */
export function chartLinearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

const NICE_STEPS = [1, 2, 2.5, 5, 10] as const;

/** The smallest "nice" step (1, 2, 2.5 or 5 × 10ⁿ) that is at least `rough`. */
export function chartNiceStep(rough: number, integer = false): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = NICE_STEPS.find((step) => step >= residual - 1e-9) ?? 10;
  const step = nice * magnitude;
  // Whole-number data keeps whole-number ticks: 0.5 → 1 and 2.5 → 5.
  if (integer && step % 1 !== 0) return step < 1 ? 1 : chartNiceStep(Math.ceil(step), true);
  return step;
}

function tickSet(lo: number, hi: number, intervals: number, integer: boolean) {
  let step = chartNiceStep((hi - lo) / intervals, integer);
  let first = Math.floor(lo / step + 1e-9) * step;
  let last = Math.ceil(hi / step - 1e-9) * step;
  // Too many ticks (the domain straddles a step boundary): take the next step.
  while ((last - first) / step + 1 > 5) {
    step = chartNiceStep(step * 1.01, integer);
    first = Math.floor(lo / step + 1e-9) * step;
    last = Math.ceil(hi / step - 1e-9) * step;
  }
  return { step, first, last, count: Math.round((last - first) / step) + 1 };
}

/**
 * 3–5 evenly spaced round ticks covering [min, max]: the first tick is at or
 * below `min`, the last at or above `max`. `target` is the preferred count;
 * a neighbouring count wins when it wastes much less headroom (so 0–2,200
 * gets 0/1K/2K/3K rather than 0/2K/4K).
 */
export function chartNiceTicks(
  min: number,
  max: number,
  target = 4,
  options: { integer?: boolean } = {},
): number[] {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    // A flat series still needs a scale: anchor at zero, or pad around it.
    if (lo === 0) hi = options.integer ? 4 : 1;
    else if (lo > 0) lo = 0;
    else hi = 0;
  }
  const integer = options.integer ?? false;
  const preferred = Math.min(5, Math.max(3, Math.round(target)));
  let best: ReturnType<typeof tickSet> | null = null;
  let bestScore = Infinity;
  for (const count of [preferred, preferred - 1, preferred + 1]) {
    if (count < 3 || count > 5) continue;
    const set = tickSet(lo, hi, count - 1, integer);
    if (set.count < 3) continue;
    const waste = (set.last - set.first - (hi - lo)) / (set.last - set.first);
    const score = waste + 0.08 * Math.abs(set.count - preferred);
    if (score < bestScore - 1e-9) {
      best = set;
      bestScore = score;
    }
  }
  const { step, first, last } = best ?? tickSet(lo, hi, preferred - 1, integer);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const ticks: number[] = [];
  for (let value = first; value <= last + step / 2; value += step) {
    ticks.push(Number(value.toFixed(decimals)) + 0);
  }
  return ticks;
}

/** The y extent of every drawn value, including zero unless told otherwise. */
export function chartExtent(series: readonly ChartSeries[], includeZero = true): [number, number] {
  let min = includeZero ? 0 : Infinity;
  let max = includeZero ? 0 : -Infinity;
  for (const s of series) {
    for (const d of s.data) {
      if (d.y === null || !Number.isFinite(d.y)) continue;
      if (d.y < min) min = d.y;
      if (d.y > max) max = d.y;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0];
  return [min, max];
}

/** True when every drawn value is a whole number (so ticks stay whole too). */
export function chartIsIntegerData(series: readonly ChartSeries[]): boolean {
  return series.every((s) => s.data.every((d) => d.y === null || Number.isInteger(d.y)));
}

/** X position of point `index` of `count`, edge to edge; a lone point is centred. */
export function chartPointX(index: number, count: number, x0: number, x1: number): number {
  if (count <= 1) return (x0 + x1) / 2;
  return x0 + (index / (count - 1)) * (x1 - x0);
}

/** Index of the position nearest to `x` (positions ascending). */
export function chartNearestIndex(x: number, positions: readonly number[]): number {
  if (positions.length === 0) return -1;
  let best = 0;
  let bestDistance = Infinity;
  positions.forEach((p, i) => {
    const distance = Math.abs(p - x);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Which of `count` x labels to show when at most `maxLabels` fit. Anchored
 * on the last (latest) point with an even stride, so labels never crowd.
 */
export function chartTickIndices(count: number, maxLabels: number): number[] {
  if (count <= 0) return [];
  const fit = Math.max(1, Math.floor(maxLabels));
  if (count <= fit) return Array.from({ length: count }, (_, i) => i);
  if (fit === 1) return [count - 1];
  const stride = Math.ceil((count - 1) / (fit - 1));
  const indices: number[] = [];
  for (let i = count - 1; i >= 0; i -= stride) indices.unshift(i);
  return indices;
}

/** Rough rendered width of a label at `px` font size (Inter, tabular digits). */
export function chartTextWidth(text: string, px = 12): number {
  let em = 0;
  for (const char of text) {
    if (/[0-9]/.test(char)) em += 0.62;
    else if (/[\s.,:'’|]/.test(char)) em += 0.3;
    else if (/[A-Z%$€£MW]/.test(char)) em += 0.7;
    else em += 0.56;
  }
  return Math.ceil(em * px);
}

/* ---------------------------------------------------------------------------
 * Paths
 * ------------------------------------------------------------------------- */

export interface ChartPoint {
  x: number;
  y: number;
}

// Path coordinates to two decimals: crisp enough, and keeps markup small.
const r2 = (n: number) => String(Math.round(n * 100) / 100 + 0);

/** Split points at gaps (null) into drawable runs. */
export function chartRuns(points: readonly (ChartPoint | null)[]): ChartPoint[][] {
  const runs: ChartPoint[][] = [];
  let run: ChartPoint[] = [];
  for (const p of points) {
    if (p) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

export type ChartCurve = "linear" | "monotone";

// Fritsch–Carlson monotone cubic: smooth, but never overshoots the data
// (no invented peaks or dips between points).
function monotoneSegments(run: readonly ChartPoint[]): string {
  const n = run.length;
  const xs = run.map((p) => p.x);
  const ys = run.map((p) => p.y);
  const at = (values: readonly number[], i: number) => values[i] ?? 0;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = at(xs, i + 1) - at(xs, i);
    dx.push(h);
    slope.push(h === 0 ? 0 : (at(ys, i + 1) - at(ys, i)) / h);
  }
  const tangent = run.map((_, i) => {
    if (i === 0) return at(slope, 0);
    if (i === n - 1) return at(slope, n - 2);
    const s0 = at(slope, i - 1);
    const s1 = at(slope, i);
    if (s0 * s1 <= 0) return 0;
    const w1 = 2 * at(dx, i) + at(dx, i - 1);
    const w2 = at(dx, i) + 2 * at(dx, i - 1);
    return (w1 + w2) / (w1 / s0 + w2 / s1);
  });
  let d = "";
  for (let i = 0; i < n - 1; i++) {
    const h = at(dx, i) / 3;
    const c1x = at(xs, i) + h;
    const c1y = at(ys, i) + at(tangent, i) * h;
    const c2x = at(xs, i + 1) - h;
    const c2y = at(ys, i + 1) - at(tangent, i + 1) * h;
    d += ` C${r2(c1x)},${r2(c1y)} ${r2(c2x)},${r2(c2y)} ${r2(at(xs, i + 1))},${r2(at(ys, i + 1))}`;
  }
  return d;
}

function runPath(run: readonly ChartPoint[], curve: ChartCurve): string {
  const [head] = run;
  if (!head) return "";
  const start = `M${r2(head.x)},${r2(head.y)}`;
  if (run.length === 1) return start;
  if (curve === "monotone" && run.length > 2) return start + monotoneSegments(run);
  return (
    start +
    run
      .slice(1)
      .map((p) => ` L${r2(p.x)},${r2(p.y)}`)
      .join("")
  );
}

/** SVG path for a line; gaps (null points) break the line. */
export function chartLinePath(
  points: readonly (ChartPoint | null)[],
  curve: ChartCurve = "linear",
): string {
  return chartRuns(points)
    .map((run) => runPath(run, curve))
    .join(" ");
}

/** SVG path for an area down to `baseline`; each run closes separately. */
export function chartAreaPath(
  points: readonly (ChartPoint | null)[],
  baseline: number,
  curve: ChartCurve = "linear",
): string {
  return chartRuns(points)
    .filter((run) => run.length > 1)
    .map((run) => {
      const firstX = run[0]?.x ?? 0;
      const lastX = run[run.length - 1]?.x ?? 0;
      return `${runPath(run, curve)} L${r2(lastX)},${r2(baseline)} L${r2(firstX)},${r2(baseline)} Z`;
    })
    .join(" ");
}

/**
 * A bar with a rounded data end and a square baseline. Vertical by default;
 * `end` above `base` grows up, below grows down. Returns "" for zero height.
 */
export function chartBarPath(
  x: number,
  width: number,
  base: number,
  end: number,
  radius = 4,
): string {
  const height = Math.abs(base - end);
  if (height < 0.01 || width <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  const up = end < base;
  const tip = up ? end + r : end - r;
  const sweep = up ? "1" : "0";
  return [
    `M${r2(x)},${r2(base)}`,
    `V${r2(tip)}`,
    `A${r2(r)},${r2(r)} 0 0 ${sweep} ${r2(x + r)},${r2(end)}`,
    `H${r2(x + width - r)}`,
    `A${r2(r)},${r2(r)} 0 0 ${sweep} ${r2(x + width)},${r2(tip)}`,
    `V${r2(base)}`,
    "Z",
  ].join(" ");
}

/**
 * A ring segment from angle a0 to a1 (radians, 0 = 12 o'clock, clockwise).
 * A full turn is drawn as two halves so the arc never degenerates.
 */
export function chartArcPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  a0: number,
  a1: number,
): string {
  const span = a1 - a0;
  if (span <= 0) return "";
  if (span >= Math.PI * 2 - 1e-6) {
    const mid = a0 + Math.PI;
    return `${chartArcPath(cx, cy, outer, inner, a0, mid)} ${chartArcPath(cx, cy, outer, inner, mid, a0 + Math.PI * 2)}`;
  }
  const at = (radius: number, angle: number) =>
    `${r2(cx + radius * Math.sin(angle))},${r2(cy - radius * Math.cos(angle))}`;
  const large = span > Math.PI ? "1" : "0";
  return [
    `M${at(outer, a0)}`,
    `A${r2(outer)},${r2(outer)} 0 ${large} 1 ${at(outer, a1)}`,
    `L${at(inner, a1)}`,
    `A${r2(inner)},${r2(inner)} 0 ${large} 0 ${at(inner, a0)}`,
    "Z",
  ].join(" ");
}

/* ---------------------------------------------------------------------------
 * Colour slots
 * ------------------------------------------------------------------------- */

/** Each series' slot: its pinned tone, otherwise the fixed order. */
export function chartSeriesTones(
  series: readonly Pick<ChartSeries, "tone">[],
  order: readonly ChartTone[] = CHART_LINE_TONES,
): ChartTone[] {
  return series.map((s, i) => s.tone ?? order[Math.min(i, order.length - 1)] ?? "muted");
}

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

export type ChartNumberFormatter = (value: number) => string;

/** A number formatter from options or a function. */
export function chartNumberFormatter(
  format: ChartValueFormat | undefined,
  locale: string = CHART_DEFAULT_LOCALE,
): ChartNumberFormatter {
  if (typeof format === "function") return format;
  const intl = new Intl.NumberFormat(locale, format ?? { maximumFractionDigits: 2 });
  return (value) => intl.format(value);
}

/**
 * Axis ticks reuse the value format, switching to compact notation (12K,
 * $1.2M) once values reach five digits so the gutter stays narrow.
 */
export function chartAxisFormatter(
  format: ChartValueFormat | undefined,
  locale: string = CHART_DEFAULT_LOCALE,
  maxAbs = 0,
): ChartNumberFormatter {
  if (typeof format === "function") return format;
  const options: Intl.NumberFormatOptions = { ...(format ?? {}) };
  if (maxAbs >= 10_000 && !options.notation) {
    options.notation = "compact";
    options.maximumFractionDigits = 1;
    options.minimumFractionDigits = 0;
    delete options.minimumSignificantDigits;
    delete options.maximumSignificantDigits;
  } else if (options.maximumFractionDigits === undefined) {
    // Round ticks need no cents: "$500", not "$500.00".
    options.maximumFractionDigits = maxAbs >= 10 ? 0 : 2;
    options.minimumFractionDigits = Math.min(
      options.minimumFractionDigits ?? 0,
      options.maximumFractionDigits,
    );
  }
  const intl = new Intl.NumberFormat(locale, options);
  return (value) => intl.format(value);
}

/** Short date for axis labels; dates render in UTC so server and client agree. */
export const CHART_AXIS_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
/** Date in tooltips. */
export const CHART_TOOLTIP_DATE: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};
/** Full date in the table view. */
export const CHART_DETAIL_DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

export type ChartXFormatter = (x: ChartX) => string;

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
// English locales that write the month first ("Sep 25"); the rest write "25 Sep".
const MONTH_FIRST_REGIONS = new Set(["US", "PH", "CA", "UM", "AS", "GU", "MP", "PR", "VI"]);

/**
 * Chart dates in English are formatted here rather than by Intl. A chart
 * renders on the server and again in the browser, and Node and browsers ship
 * different locale data ("Fri 25 Sept" in one, "Fri, 25 Sept" in the other),
 * so Intl text can differ and fail hydration. This covers the chart formats
 * (short weekday, short month, day and year, in UTC); anything else, and
 * other languages, uses Intl. Null when it doesn't apply.
 */
export function chartEnglishDateFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): ((date: Date) => string) | null {
  const [language = "", ...subtags] = locale.split(/[-_]/);
  if (language.toLowerCase() !== "en") return null;
  const { weekday, month, day, year, timeZone, ...other } = options;
  if (Object.keys(other).length > 0) return null;
  if (timeZone !== undefined && timeZone !== "UTC") return null;
  if (month !== "short" || day !== "numeric") return null;
  if (weekday !== undefined && weekday !== "short") return null;
  if (year !== undefined && year !== "numeric") return null;
  // The region is the first two-letter or three-digit subtag ("en-Latn-GB").
  const region = subtags.find((tag) => /^([a-z]{2}|\d{3})$/i.test(tag))?.toUpperCase();
  const monthFirst = region === undefined || MONTH_FIRST_REGIONS.has(region);
  return (date) => {
    const m = MONTHS_SHORT[date.getUTCMonth()] ?? "";
    const d = String(date.getUTCDate());
    const y = String(date.getUTCFullYear());
    const w = WEEKDAYS_SHORT[date.getUTCDay()] ?? "";
    if (monthFirst) {
      const text = year ? `${m} ${d}, ${y}` : `${m} ${d}`;
      return weekday ? `${w}, ${text}` : text;
    }
    const text = year ? `${d} ${m} ${y}` : `${d} ${m}`;
    return weekday ? `${w} ${text}` : text;
  };
}

/** An x formatter: strings pass through, numbers use Intl, dates use `format`. */
export function chartXFormatter(
  format: ChartXFormat | undefined,
  locale: string = CHART_DEFAULT_LOCALE,
  fallback: Intl.DateTimeFormatOptions = CHART_AXIS_DATE,
): ChartXFormatter {
  if (typeof format === "function") return format;
  const options: Intl.DateTimeFormatOptions = { timeZone: "UTC", ...(format ?? fallback) };
  const english = chartEnglishDateFormatter(locale, options);
  const intl = english ? null : new Intl.DateTimeFormat(locale, options);
  const formatDate = english ?? ((date: Date) => intl?.format(date) ?? "");
  const numbers = new Intl.NumberFormat(locale);
  return (x) => (x instanceof Date ? formatDate(x) : typeof x === "number" ? numbers.format(x) : x);
}

/** A stable key for an x value (dates by timestamp). */
export function chartXKey(x: ChartX): string {
  return x instanceof Date ? `d${String(x.getTime())}` : `${typeof x}:${String(x)}`;
}

/** The header for the x column in the table view. */
export function chartXHeader(series: readonly ChartSeries[]): string {
  const first = series[0]?.data[0]?.x;
  return first instanceof Date ? "Date" : "Label";
}

/* ---------------------------------------------------------------------------
 * Data shaping
 * ------------------------------------------------------------------------- */

/** Number of positions on the x axis: the longest series. */
export function chartLength(series: readonly ChartSeries[]): number {
  return series.reduce((n, s) => Math.max(n, s.data.length), 0);
}

/** The x at `index`: from the first series that has one there. */
export function chartXAt(series: readonly ChartSeries[], index: number): ChartX | undefined {
  for (const s of series) {
    const d = s.data[index];
    if (d) return d.x;
  }
  return undefined;
}

export interface ChartPart {
  id: string;
  label: string;
  value: number;
  tone?: ChartTone | undefined;
}

export interface ChartFoldedPart extends ChartPart {
  tone: ChartTone;
  /** True for the folded "Other" segment. */
  other: boolean;
  /** Share of the total, 0–1. */
  share: number;
}

/**
 * Keep at most `maxSegments` (≤ 4) segments: when there are more, the
 * largest `maxSegments - 1` stay, in their original order so colour follows
 * the entity rather than its rank, and the rest fold into one "Other"
 * segment in the grey slot. Negative and non-finite values are dropped:
 * they have no place in a part-to-whole.
 */
export function chartFoldOther(
  parts: readonly ChartPart[],
  maxSegments = 4,
  otherLabel = "Other",
): ChartFoldedPart[] {
  const valid = parts.filter((p) => Number.isFinite(p.value) && p.value > 0);
  // Three colour slots plus one grey: more segments would repeat a colour.
  const cap = Math.max(1, Math.min(maxSegments, CHART_PART_TONES.length + 1));
  let kept = valid;
  let folded: ChartPart[] = [];
  if (valid.length > cap) {
    const ranked = [...valid].sort((a, b) => b.value - a.value);
    const keep = new Set(ranked.slice(0, cap - 1).map((p) => p.id));
    kept = valid.filter((p) => keep.has(p.id));
    folded = valid.filter((p) => !keep.has(p.id));
  }
  const total = valid.reduce((sum, p) => sum + p.value, 0);
  const share = (value: number) => (total > 0 ? value / total : 0);
  // Past the three colour slots a kept segment takes the grey slot under its own name.
  const out: ChartFoldedPart[] = kept.map((p, i) => ({
    ...p,
    tone: p.tone ?? CHART_PART_TONES[i] ?? "muted",
    other: false,
    share: share(p.value),
  }));
  if (folded.length) {
    const value = folded.reduce((sum, p) => sum + p.value, 0);
    out.push({
      id: "other",
      label: otherLabel,
      value,
      tone: "muted",
      other: true,
      share: share(value),
    });
  }
  return out;
}

export interface ChartTableModel {
  /** The x column's header, then one per series. */
  columns: string[];
  /** Formatted values ("—" for a gap), one per series. */
  rows: { key: string; header: string; cells: string[] }[];
  /** Caption notes, e.g. the dates a previous-period column covers. */
  notes: string[];
}

/**
 * Rows by x position, one column per series: the chart's table twin. A
 * series whose own x values differ from the rows' (a previous period drawn
 * under the current one) gets one caption note with its range, rather than
 * a date under every value.
 */
export function chartTableModel(
  series: readonly ChartSeries[],
  options: {
    formatValue: ChartNumberFormatter;
    formatX: ChartXFormatter;
    xHeader?: string | undefined;
  },
): ChartTableModel {
  const length = chartLength(series);
  const columns = [options.xHeader ?? chartXHeader(series), ...series.map((s) => s.label)];
  const rows: ChartTableModel["rows"] = [];
  const offset = new Set<ChartSeries>();
  for (let i = 0; i < length; i++) {
    const x = chartXAt(series, i);
    const rowKey = x === undefined ? "" : chartXKey(x);
    rows.push({
      key: `${String(i)}-${rowKey}`,
      header: x === undefined ? "" : options.formatX(x),
      cells: series.map((s) => {
        const d = s.data[i];
        if (d && x !== undefined && chartXKey(d.x) !== rowKey) offset.add(s);
        return d?.y === null || d?.y === undefined ? "—" : options.formatValue(d.y);
      }),
    });
  }
  const notes = series
    .filter((s) => offset.has(s))
    .map((s) => {
      const first = s.data[0]?.x;
      const last = s.data[s.data.length - 1]?.x;
      const range =
        first === undefined || last === undefined
          ? ""
          : ` ${options.formatX(first)} – ${options.formatX(last)},`;
      return `${s.label}:${range} matched row by row.`;
    });
  return { columns, rows, notes };
}

// English weekday and month names, full or abbreviated ("Mon", "Sept.").
const WEEKDAY_NAME =
  /^(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)\.?$/i;
const MONTH_NAME =
  /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?$/i;

/**
 * Initials for a category axis of weekday or month names ("M T W T F S S"),
 * used when the full names don't fit. Categories are never thinned: a bar
 * without a label can't be read. Null for any other kind of category.
 */
export function chartShortLabels(labels: readonly string[]): string[] | null {
  if (labels.length === 0) return null;
  const trimmed = labels.map((label) => label.trim());
  const named =
    trimmed.every((label) => WEEKDAY_NAME.test(label)) ||
    trimmed.every((label) => MONTH_NAME.test(label));
  return named ? trimmed.map((label) => label.charAt(0).toUpperCase()) : null;
}

/**
 * A one-sentence description of a chart for its accessible name: kind,
 * range, and per series its first, last and peak values.
 */
export function chartSummary(
  kind: string,
  series: readonly ChartSeries[],
  options: {
    formatValue: ChartNumberFormatter;
    formatX: ChartXFormatter;
    label?: string | undefined;
  },
): string {
  const length = chartLength(series);
  const lead = options.label ? `${options.label}. ` : "";
  if (length === 0) return `${lead}${kind}, no data.`;
  const firstX = chartXAt(series, 0);
  const lastX = chartXAt(series, length - 1);
  const range =
    firstX !== undefined && lastX !== undefined && length > 1
      ? ` from ${options.formatX(firstX)} to ${options.formatX(lastX)}`
      : "";
  const parts = series.map((s) => {
    const values = s.data.filter((d) => d.y !== null) as { x: ChartX; y: number }[];
    const first = values[0];
    const last = values[values.length - 1];
    if (!first || !last) return `${s.label}: no data`;
    const peak = values.reduce((best, d) => (d.y > best.y ? d : best), first);
    if (values.length === 1) return `${s.label}: ${options.formatValue(first.y)}`;
    return `${s.label}: ${options.formatValue(first.y)} to ${options.formatValue(last.y)}, peak ${options.formatValue(peak.y)} (${options.formatX(peak.x)})`;
  });
  return `${lead}${kind}, ${String(length)} points${range}. ${parts.join("; ")}.`;
}

/** Trend words for a sparkline's accessible name. */
export function chartTrend(values: readonly (number | null)[]): {
  first: number | null;
  last: number | null;
  change: number | null;
  direction: "up" | "down" | "flat";
} {
  const drawn = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const first = drawn[0] ?? null;
  const last = drawn[drawn.length - 1] ?? null;
  if (first === null || last === null) return { first, last, change: null, direction: "flat" };
  const change = first === 0 ? null : (last - first) / Math.abs(first);
  const direction = last > first ? "up" : last < first ? "down" : "flat";
  return { first, last, change, direction };
}
