// Real sales figures for the store home's live order and customer widgets:
// turns the commerce summaries (storeSalesSummary, storeCustomerSummary;
// money as minor-unit strings, days in the store's timezone) into what the
// KPI tiles, the Sales chart and Top products draw. Pure, so the arithmetic
// and the empty states are unit-tested. Nothing here is estimated: a store
// with no orders gets zeros and says so.
import { currencyExponent, isKnownCurrency } from "@storevia/commerce/money";
import type { ChartSeries } from "@storevia/ui/charts";
import type { MetricDelta } from "@storevia/ui/data";

/** The parts of storeSalesSummary() the widgets read. */
export interface SalesFigures {
  readonly days: number;
  readonly timezone: string;
  readonly currency: string;
  readonly current: SalesPeriodFigures;
  readonly previous: SalesPeriodFigures;
  readonly topProducts: readonly {
    readonly productId: string | null;
    readonly title: string;
    readonly units: number;
  }[];
}

interface SalesPeriodFigures {
  readonly daily: readonly {
    readonly date: string;
    readonly revenue: string;
    readonly orders: number;
  }[];
}

/** The parts of storeCustomerSummary() the widgets read. */
export interface CustomerFigures {
  readonly days: number;
  readonly current: { readonly daily: readonly { readonly count: number }[] };
  readonly previous: { readonly daily: readonly { readonly count: number }[] };
}

export interface LiveKpi {
  /** The period's figure, formatted. */
  readonly value: string;
  /** Compact from five digits ("₹54.9K"), for a phone's half-width tile. */
  readonly short: string;
  /** Change against the period before; none when that period had nothing to compare. */
  readonly delta?: MetricDelta;
  /** "vs previous 30 days", "Last 30 days" or the empty state ("No orders in the last 30 days"). */
  readonly comparison: string;
  /**
   * The sparkline: rolling period-long averages from the previous period to
   * this one, so it rises or falls as the delta says. Null with no data.
   */
  readonly data: readonly number[] | null;
}

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);

/** Minor units as a number of major units (paise → rupees). */
export function majorUnits(minor: string, currency: string): number {
  const exponent = isKnownCurrency(currency) ? currencyExponent(currency) : 2;
  return Number(minor) / 10 ** exponent;
}

/** A percentage change, to one decimal; none when there was nothing before. */
export function periodChange(current: number, previous: number): MetricDelta | undefined {
  if (previous <= 0) return undefined;
  return { value: Math.round(((current - previous) / previous) * 1000) / 10 };
}

/** Rolling means of `current.length` days, from the previous period's last day to today. */
export function rollingMeans(previous: readonly number[], current: readonly number[]): number[] {
  // The two periods are the same length: point i averages days i to i + n.
  const values = [...previous, ...current];
  const n = current.length;
  const offset = values.length - 2 * n;
  return Array.from({ length: n + 1 }, (_, i) => {
    const window = values.slice(Math.max(0, offset + i), offset + i + n);
    return Math.round((sum(window) / Math.max(1, n)) * 100) / 100;
  });
}

function kpi(
  current: readonly number[],
  previous: readonly number[],
  days: number,
  none: string,
  format: Intl.NumberFormatOptions,
  locale: string,
): LiveKpi {
  const total = sum(current);
  const before = sum(previous);
  const intl = new Intl.NumberFormat(locale, format);
  const compact = new Intl.NumberFormat(locale, {
    ...format,
    notation: "compact",
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  const value = intl.format(total);
  const delta = periodChange(total, before);
  const empty = total === 0 && before === 0;
  return {
    value,
    short: total < 10_000 ? value : compact.format(total),
    ...(delta ? { delta } : {}),
    comparison: delta
      ? `vs previous ${String(days)} days`
      : empty
        ? `${none} in the last ${String(days)} days`
        : `Last ${String(days)} days`,
    data: empty ? null : rollingMeans(previous, current),
  };
}

const revenueOf = (figures: SalesFigures, period: SalesPeriodFigures) =>
  period.daily.map((d) => majorUnits(d.revenue, figures.currency));

/** The Revenue or Orders tile. */
export function salesKpi(
  metric: "revenue" | "orders",
  figures: SalesFigures,
  locale: string,
): LiveKpi {
  if (metric === "orders") {
    return kpi(
      figures.current.daily.map((d) => d.orders),
      figures.previous.daily.map((d) => d.orders),
      figures.days,
      "No orders",
      { maximumFractionDigits: 0 },
      locale,
    );
  }
  return kpi(
    revenueOf(figures, figures.current),
    revenueOf(figures, figures.previous),
    figures.days,
    "No orders",
    { style: "currency", currency: figures.currency },
    locale,
  );
}

/** The Customers tile: new customers in the period. */
export function customersKpi(figures: CustomerFigures, locale: string): LiveKpi {
  return kpi(
    figures.current.daily.map((d) => d.count),
    figures.previous.daily.map((d) => d.count),
    figures.days,
    "No new customers",
    { maximumFractionDigits: 0 },
    locale,
  );
}

export interface SalesTrend {
  readonly value: string;
  readonly delta?: MetricDelta;
  readonly comparison: string;
  /** No revenue in either period: the chart shows its empty state, not a flat line. */
  readonly empty: boolean;
  /** This period and, muted, the period before (aligned by day). */
  readonly series: ChartSeries[];
  readonly valueFormat: Intl.NumberFormatOptions;
}

/**
 * The Sales chart. Each day is a Date at UTC midnight of the store's
 * calendar day, since charts format dates in UTC.
 */
export function salesTrend(figures: SalesFigures, locale: string): SalesTrend {
  const current = revenueOf(figures, figures.current);
  const previous = revenueOf(figures, figures.previous);
  const headline = salesKpi("revenue", figures, locale);
  const x = figures.current.daily.map((d) => new Date(`${d.date}T00:00:00Z`));
  const points = (values: readonly number[]) =>
    x.map((date, i) => ({ x: date, y: values[i] ?? null }));
  return {
    value: headline.value,
    ...(headline.delta ? { delta: headline.delta } : {}),
    comparison: headline.comparison,
    empty: sum(current) === 0 && sum(previous) === 0,
    series: [
      { id: "revenue", label: "Revenue", data: points(current) },
      { id: "revenue-previous", label: "Previous period", data: points(previous), tone: "muted" },
    ],
    valueFormat: { style: "currency", currency: figures.currency, maximumFractionDigits: 0 },
  };
}

/** Top products as a horizontal bar series (units sold); null when nothing sold. */
export function topProductsSeries(figures: SalesFigures): ChartSeries[] | null {
  if (figures.topProducts.length === 0) return null;
  return [
    {
      id: "top-products",
      label: "Units sold",
      data: figures.topProducts.map((p) => ({ x: p.title, y: p.units })),
    },
  ];
}
