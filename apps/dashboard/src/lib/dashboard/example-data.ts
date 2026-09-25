// Example data for the store home's development preview (?preview=example,
// development and test only; see preview.ts). Every series comes from a
// fixed seed, so the same period always draws the same values on the server
// and in tests; nothing calls Math.random. None of it describes a real
// business, and every widget that shows it carries the "Example data" badge.
import type { BusinessType } from "@storevia/tenancy/business-types";
import type { ChartDatum, ChartPart, ChartSeries, MetricDelta } from "@storevia/ui";
import type { WidgetKey } from "./widgets";

/** Widgets whose example figures are daily metrics. */
export type ExampleMetric = Extract<
  WidgetKey,
  | "revenue"
  | "orders"
  | "conversion"
  | "customers"
  | "visitors"
  | "page-views"
  | "project-views"
  | "enquiries"
  | "posts-published"
>;

interface MetricModel {
  readonly seed: number;
  /** Typical daily value at the start of the history. */
  readonly base: number;
  /** Daily growth, compounded linearly (0.002 = +0.2% of base a day). */
  readonly growth: number;
  /** Relative noise either side of the trend. */
  readonly noise: number;
  /** Weekend multiplier (shops are busier, business sites quieter). */
  readonly weekend: number;
  /** count and currency sum over a period; rate averages (a percentage). */
  readonly kind: "count" | "currency" | "rate";
}

const MODELS: Readonly<Record<ExampleMetric, MetricModel>> = {
  revenue: { seed: 2447, base: 1240, growth: 0.0026, noise: 0.16, weekend: 1.16, kind: "currency" },
  orders: { seed: 90210, base: 31, growth: 0.0022, noise: 0.3, weekend: 1.24, kind: "count" },
  conversion: { seed: 5, base: 2.6, growth: 0.0012, noise: 0.18, weekend: 1.06, kind: "rate" },
  customers: { seed: 311, base: 9, growth: 0.0024, noise: 0.5, weekend: 1.2, kind: "count" },
  visitors: { seed: 1187, base: 380, growth: 0.003, noise: 0.14, weekend: 0.8, kind: "count" },
  "page-views": {
    seed: 4099,
    base: 1180,
    growth: 0.0028,
    noise: 0.2,
    weekend: 0.82,
    kind: "count",
  },
  "project-views": {
    seed: 733,
    base: 150,
    growth: 0.0032,
    noise: 0.28,
    weekend: 0.9,
    kind: "count",
  },
  enquiries: {
    seed: 97,
    base: 2.4,
    growth: 0.003,
    noise: 0.9,
    weekend: 0.55,
    kind: "count",
  },
  "posts-published": {
    seed: 57,
    base: 0.45,
    growth: 0.002,
    noise: 1.8,
    weekend: 0.4,
    kind: "count",
  },
};

/** Days of history generated; enough for a 90-day period and the one before. */
const HISTORY = 180;
const DAY = 86_400_000;

// mulberry32: a small, well-distributed seeded generator.
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface ExampleWindow {
  /** Days in the period (7, 30 or 90). */
  readonly days: number;
  /** The period's last day (any time on that day, read in UTC). */
  readonly end: Date;
}

const utcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * HISTORY daily values ending on `end`, oldest first. The noise depends on
 * the metric only; `end` places the weekends, so busy days fall on real
 * Saturdays and Sundays.
 */
function history(metric: ExampleMetric, end: Date): readonly number[] {
  const model = MODELS[metric];
  const random = seeded(model.seed);
  const last = utcDay(end);
  return Array.from({ length: HISTORY }, (_, i) => {
    const weekday = new Date(last - (HISTORY - 1 - i) * DAY).getUTCDay();
    const season = weekday === 0 || weekday === 6 ? model.weekend : 1;
    const trend = model.base * (1 + model.growth * i);
    const value = Math.max(0, trend * season * (1 + (random() - 0.5) * model.noise));
    return model.kind === "rate" ? Math.round(value * 100) / 100 : Math.round(value);
  });
}

function dates(window: ExampleWindow): Date[] {
  const last = utcDay(window.end);
  return Array.from(
    { length: window.days },
    (_, i) => new Date(last - (window.days - 1 - i) * DAY),
  );
}

/** The period's values and the period before it, day for day. */
export function examplePeriods(
  metric: ExampleMetric,
  window: ExampleWindow,
): { current: number[]; previous: number[] } {
  const values = history(metric, window.end);
  const n = Math.min(Math.max(1, Math.trunc(window.days)), HISTORY / 2);
  return { current: values.slice(-n), previous: values.slice(-2 * n, -n) };
}

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);
const mean = (values: readonly number[]) => sum(values) / Math.max(1, values.length);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** A signed change, as Metric and ChartHeadline take it. Rates change in points. */
function change(kind: MetricModel["kind"], current: number[], previous: number[]): MetricDelta {
  if (kind === "rate") {
    const points = round1(mean(current) - mean(previous));
    const sign = points > 0 ? "+" : points < 0 ? "−" : "";
    return { value: points, label: `${sign}${Math.abs(points).toFixed(1)} pts` };
  }
  const before = sum(previous);
  return { value: before > 0 ? round1(((sum(current) - before) / before) * 100) : 0 };
}

export interface ExampleFormat {
  /** ISO 4217 code for currency figures (the store's currency). */
  readonly currency: string;
  /** BCP 47 locale for figures (the store's language). */
  readonly locale: string;
}

/** Intl options for a metric's figures, serialisable for client charts. */
export function exampleValueFormat(
  metric: ExampleMetric,
  format: ExampleFormat,
): Intl.NumberFormatOptions {
  switch (MODELS[metric].kind) {
    case "currency":
      return { style: "currency", currency: format.currency, maximumFractionDigits: 0 };
    case "rate":
      return { maximumFractionDigits: 1 };
    default:
      return { maximumFractionDigits: 0 };
  }
}

export interface ExampleKpi {
  /** The formatted figure: a period total, or a rate's average. */
  readonly value: string;
  /** The same figure in compact notation ("£54.9K"), for a phone's half-width tile. */
  readonly short: string;
  readonly delta: MetricDelta;
  /**
   * The sparkline: the period-long rolling average, from the previous
   * period's average (first point) to this period's (last point). Smooth,
   * and it rises or falls exactly as the delta says.
   */
  readonly data: readonly number[];
}

/** Rolling means of `n` days, one per day from the previous period's last day. */
function rolling(values: readonly number[], n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const end = values.length - n + i;
    return Math.round(mean(values.slice(end - n, end)) * 100) / 100;
  });
}

export function exampleKpi(
  metric: ExampleMetric,
  window: ExampleWindow,
  format: ExampleFormat,
): ExampleKpi {
  const { kind } = MODELS[metric];
  const { current, previous } = examplePeriods(metric, window);
  const options = exampleValueFormat(metric, format);
  const intl = new Intl.NumberFormat(format.locale, options);
  const compact = new Intl.NumberFormat(format.locale, {
    ...options,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const value = kind === "rate" ? `${mean(current).toFixed(1)}%` : intl.format(sum(current));
  return {
    value,
    // Four digits fit a phone tile; compact from five ("£54.9k").
    short: kind === "rate" || sum(current) < 10_000 ? value : compact.format(sum(current)),
    delta: change(kind, current, previous),
    data: rolling(history(metric, window.end), current.length),
  };
}

/** A metric's total over the period (e.g. visitors, for the traffic split). */
export function exampleTotal(metric: ExampleMetric, window: ExampleWindow): number {
  return sum(examplePeriods(metric, window).current);
}

export interface ExampleTrend extends ExampleKpi {
  /** The period and, dashed in grey, the period before (aligned by day). */
  readonly series: ChartSeries[];
  /**
   * The y axis fitted to the data rather than from zero, so the two periods'
   * shapes can be compared (a line needs no zero baseline).
   */
  readonly domain: readonly [number, number];
}

export function exampleTrend(
  metric: ExampleMetric,
  label: string,
  window: ExampleWindow,
  format: ExampleFormat,
): ExampleTrend {
  const { current, previous } = examplePeriods(metric, window);
  const x = dates(window);
  const points = (values: readonly number[]): ChartDatum[] =>
    x.map((date, i) => ({ x: date, y: values[i] ?? null }));
  const all = [...current, ...previous];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return {
    ...exampleKpi(metric, window, format),
    series: [
      { id: metric, label, data: points(current) },
      { id: `${metric}-previous`, label: "Previous period", data: points(previous), tone: "muted" },
    ],
    // Half the range again below the lowest day: the lines fill the top two
    // thirds, so day-to-day swings don't read as drama.
    domain: [Math.max(0, lo - (hi - lo) / 2), hi],
  };
}

// Rankings and shares: fixed monthly figures, scaled to the period, so the
// period control visibly re-scopes them.
const RANKINGS: Readonly<Record<string, readonly (readonly [string, number])[]>> = {
  products: [
    ["Linen overshirt", 8420],
    ["Canvas weekender", 6180],
    ["Merino crew", 4970],
    ["Leather card holder", 3310],
    ["Cotton tote", 1860],
  ],
  BUSINESS: [
    ["Home", 4210],
    ["Services", 2380],
    ["About us", 1540],
    ["Case studies", 1120],
    ["Contact", 860],
  ],
  PUBLISHING: [
    ["A field guide to slow travel", 3860],
    ["What we learned from 100 interviews", 2940],
    ["The quiet economics of print", 2210],
    ["Notes on a better morning", 1630],
    ["Ten books for a long weekend", 1180],
  ],
  PORTFOLIO: [
    ["Harbour House", 1320],
    ["Atlas identity", 1045],
    ["Riverside library", 860],
    ["Northlight studio", 610],
    ["Folio no. 7", 420],
  ],
};

const scale = (monthly: number, days: number) => Math.round((monthly * days) / 30);

/** A ranking for a horizontal bar chart, largest first. */
export function exampleRanking(
  widget: "top-products" | "top-content",
  businessType: BusinessType,
  label: string,
  days: number,
): ChartSeries[] {
  const rows = RANKINGS[widget === "top-products" ? "products" : businessType] ?? [];
  return [
    { id: widget, label, data: rows.map(([x, monthly]) => ({ x, y: scale(monthly, days) })) },
  ];
}

// How visits split by channel; the smallest part is folded into "Other".
const CHANNELS: readonly (readonly [id: string, label: string, share: number])[] = [
  ["search", "Organic search", 0.42],
  ["direct", "Direct", 0.31],
  ["social", "Social", 0.15],
  ["email", "Email", 0.08],
  ["referral", "Referral", 0.04],
];

/** Traffic by channel, adding up to `total` (the period's visitors). */
export function exampleShare(total: number): ChartPart[] {
  let left = total;
  return CHANNELS.map(([id, label, share], i) => {
    const value = i === CHANNELS.length - 1 ? left : Math.round(total * share);
    left -= value;
    return { id, label, value };
  });
}

export interface ExampleListItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly badge?: { readonly label: string; readonly tone: "neutral" | "warning" | "danger" };
}

const LISTS: Readonly<Record<string, readonly ExampleListItem[]>> = {
  "stock-alerts": [
    {
      id: "weekender",
      title: "Canvas weekender · Olive",
      detail: "Sold out 2 days ago",
      badge: { label: "Out of stock", tone: "danger" },
    },
    {
      id: "crew",
      title: "Merino crew · Navy, M",
      detail: "2 left · sells about 3 a week",
      badge: { label: "Low stock", tone: "warning" },
    },
    {
      id: "overshirt",
      title: "Linen overshirt · White, L",
      detail: "3 left · sells about 5 a week",
      badge: { label: "Low stock", tone: "warning" },
    },
    {
      id: "holder",
      title: "Leather card holder · Tan",
      detail: "6 left · sells about 2 a week",
      badge: { label: "Low stock", tone: "warning" },
    },
  ],
  "content-updates": [
    {
      id: "services",
      title: "Services",
      detail: "Edited 2 hours ago",
      badge: { label: "Draft", tone: "neutral" },
    },
    { id: "case", title: "Case study: Harbour Mill", detail: "Published yesterday" },
    { id: "about", title: "About us", detail: "Published 3 days ago" },
    { id: "contact", title: "Contact", detail: "Edited last week" },
  ],
  "portfolio-updates": [
    { id: "harbour", title: "Harbour House", detail: "Photos added 3 hours ago" },
    { id: "atlas", title: "Atlas identity", detail: "Published yesterday" },
    {
      id: "library",
      title: "Riverside library",
      detail: "Edited 4 days ago",
      badge: { label: "Draft", tone: "neutral" },
    },
    { id: "folio", title: "Folio no. 7", detail: "Published last week" },
  ],
  authors: [
    { id: "a1", title: "Amara Osei", detail: "5 posts this month · 2 drafts" },
    { id: "a2", title: "Tom Lindqvist", detail: "3 posts this month" },
    { id: "a3", title: "Priti Rao", detail: "2 posts this month · 1 draft" },
    { id: "a4", title: "Guest writers", detail: "1 post this month" },
  ],
};

export function exampleList(widget: WidgetKey): readonly ExampleListItem[] {
  return LISTS[widget] ?? [];
}
