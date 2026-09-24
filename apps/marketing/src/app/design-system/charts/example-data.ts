// Example data for the charts gallery. Generated from a fixed seed so server
// and client render the same values; none of it describes a real business.
import type { ChartPart, ChartSeries } from "@storevia/ui";

// The last day of every example series (fixed, so the page is deterministic).
const END = Date.UTC(2026, 8, 23);
const DAY = 86_400_000;

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function days(count: number, endOffset = 0): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(END - (endOffset + count - 1 - i) * DAY));
}

// 180 days of example revenue: a gentle upward trend, busier weekends, noise.
const random = seeded(2447);
const REVENUE = days(180).map((date, i) => {
  const weekday = date.getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 1.16 : weekday === 5 ? 1.08 : 1;
  const trend = 1240 + i * 3.1;
  const noise = 0.9 + random() * 0.2;
  return { x: date, y: Math.round(trend * weekend * noise) };
});

export type ExamplePeriod = "7d" | "30d" | "90d";
export const PERIOD_DAYS: Record<ExamplePeriod, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Revenue for the period and the one before it (aligned day by day). */
export function exampleRevenue(period: ExamplePeriod): ChartSeries[] {
  const n = PERIOD_DAYS[period];
  const current = REVENUE.slice(-n);
  const previous = REVENUE.slice(-2 * n, -n);
  return [
    { id: "revenue", label: "Revenue", data: current },
    { id: "previous", label: "Previous period", data: previous, tone: "muted" },
  ];
}

export function exampleTotal(series: ChartSeries | undefined): number {
  return (series?.data ?? []).reduce((sum, d) => sum + (d.y ?? 0), 0);
}

/** Weekly sessions over twelve weeks (single series, for the area chart). */
export const EXAMPLE_SESSIONS: ChartSeries[] = [
  {
    id: "sessions",
    label: "Sessions",
    data: Array.from({ length: 12 }, (_, i) => ({
      x: new Date(END - (11 - i) * 7 * DAY),
      y: [8420, 8910, 8650, 9480, 10120, 9870, 10640, 11380, 11020, 12150, 12890, 13460][i] ?? 0,
    })),
  },
];

// 60 days of example orders: busier weekends, a slight upward drift.
const ordersRandom = seeded(90210);
const ORDERS = days(60).map((date, i) => {
  const weekday = date.getUTCDay();
  const base = (weekday === 0 || weekday === 6 ? 44 : 33) + i * 0.06;
  return { x: date, y: Math.round(base + ordersRandom() * 14) };
});

/** Orders per day for two weeks (whole numbers). */
export const EXAMPLE_ORDERS: ChartSeries[] = [
  { id: "orders", label: "Orders", data: ORDERS.slice(-14) },
];
/** The 14 days before EXAMPLE_ORDERS, for its headline delta. */
export const EXAMPLE_ORDERS_PREVIOUS: ChartSeries = {
  id: "orders-previous",
  label: "Previous 14 days",
  data: ORDERS.slice(-28, -14),
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Orders by weekday: this week against last week. */
export const EXAMPLE_WEEK_COMPARISON: ChartSeries[] = [
  {
    id: "last-week",
    label: "Last week",
    tone: "muted",
    data: WEEKDAYS.map((x, i) => ({ x, y: [31, 29, 34, 36, 41, 52, 47][i] ?? 0 })),
  },
  {
    id: "this-week",
    label: "This week",
    tone: "primary",
    data: WEEKDAYS.map((x, i) => ({ x, y: [35, 33, 32, 40, 46, 58, 51][i] ?? 0 })),
  },
];

/** Top products by revenue, sorted for a ranking. */
export const EXAMPLE_TOP_PRODUCTS: ChartSeries[] = [
  {
    id: "revenue",
    label: "Revenue",
    data: [
      { x: "Linen overshirt", y: 8420 },
      { x: "Canvas weekender", y: 6180 },
      { x: "Merino crew", y: 4970 },
      { x: "Leather card holder", y: 3310 },
      { x: "Cotton tote", y: 1860 },
    ],
  },
  {
    id: "previous",
    label: "Previous period",
    tone: "muted",
    data: [
      { x: "Linen overshirt", y: 7160 },
      { x: "Canvas weekender", y: 6420 },
      { x: "Merino crew", y: 3880 },
      { x: "Leather card holder", y: 3050 },
      { x: "Cotton tote", y: 2240 },
    ],
  },
];

/** Sessions by channel (part-to-whole). Five inputs fold to three plus "Other". */
export const EXAMPLE_CHANNELS: ChartPart[] = [
  { id: "direct", label: "Direct", value: 5240 },
  { id: "search", label: "Organic search", value: 3910 },
  { id: "social", label: "Social", value: 1880 },
  { id: "email", label: "Email", value: 960 },
  { id: "referral", label: "Referral", value: 470 },
];

function walk(seed: number, count: number, start: number, drift: number, spread: number) {
  const rnd = seeded(seed);
  let value = start;
  return Array.from({ length: count }, () => {
    value = Math.max(0, value + drift + (rnd() - 0.5) * spread);
    return Math.round(value * 100) / 100;
  });
}

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);
const mean = (values: readonly number[]) => sum(values) / Math.max(1, values.length);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** A signed change in percent, rounded for display ({ value: 8.2 } shows "+8.2%"). */
export function examplePercentChange(current: number, previous: number): { value: number } {
  return { value: previous > 0 ? round1(((current - previous) / previous) * 100) : 0 };
}

export interface ExampleKpi {
  id: string;
  label: string;
  value: string;
  /** Signed, as Metric takes it; `label` keeps a unit ("0.3 pts"). */
  delta: { value: number; label?: string };
  /** A fall is good news (refund rate). */
  lowerIsBetter: boolean;
  /** The current 30 days, oldest first: what the sparkline draws. */
  data: number[];
  area: boolean;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** A total over the last 30 days against the 30 before. */
function totalKpi(
  id: string,
  label: string,
  values: readonly number[],
  format: Intl.NumberFormat,
  area = false,
): ExampleKpi {
  const current = values.slice(-30);
  const previous = values.slice(-60, -30);
  return {
    id,
    label,
    value: format.format(sum(current)),
    delta: examplePercentChange(sum(current), sum(previous)),
    lowerIsBetter: false,
    data: [...current],
    area,
  };
}

/** A daily rate (in %): its 30-day average, and the change in points. */
function rateKpi(id: string, label: string, values: readonly number[], lowerIsBetter = false) {
  const current = values.slice(-30);
  const change = round1(mean(current) - mean(values.slice(-60, -30)));
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return {
    id,
    label,
    value: `${mean(current).toFixed(1)}%`,
    // Metric shows a label as given, so it carries the sign.
    delta: { value: change, label: `${sign}${Math.abs(change).toFixed(1)} pts` },
    lowerIsBetter,
    data: [...current],
    area: false,
  } satisfies ExampleKpi;
}

/**
 * KPI tiles, derived from the same example series the charts draw, so a
 * tile's figure, its signed delta and its sparkline always agree.
 */
export const EXAMPLE_KPIS: ExampleKpi[] = [
  totalKpi(
    "revenue",
    "Revenue",
    REVENUE.map((d) => d.y),
    usd,
    true,
  ),
  totalKpi(
    "orders",
    "Orders",
    ORDERS.map((d) => d.y),
    whole,
  ),
  rateKpi("conversion", "Conversion rate", walk(5, 60, 3.4, -0.012, 0.22)),
  rateKpi("refunds", "Refund rate", walk(8, 60, 1.5, -0.008, 0.16), true),
];
