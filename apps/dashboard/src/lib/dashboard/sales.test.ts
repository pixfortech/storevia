import { describe, expect, it } from "vitest";
import {
  customersKpi,
  majorUnits,
  periodChange,
  rollingMeans,
  salesKpi,
  salesTrend,
  topProductsSeries,
  type CustomerFigures,
  type SalesFigures,
} from "./sales";

const LOCALE = "en-IN";

/** A 7-day summary: revenue in rupees and order counts per day, oldest first. */
function figures(
  current: readonly [rupees: number, orders: number][],
  previous: readonly [rupees: number, orders: number][],
  topProducts: SalesFigures["topProducts"] = [],
): SalesFigures {
  const days = current.length;
  const date = (i: number) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
  const daily = (list: typeof current, offset: number) =>
    list.map(([rupees, orders], i) => ({
      date: date(offset + i),
      revenue: String(rupees * 100),
      orders,
    }));
  return {
    days,
    timezone: "Asia/Kolkata",
    currency: "INR",
    previous: { daily: daily(previous, 0) },
    current: { daily: daily(current, days) },
    topProducts,
  };
}

const zeros = (n: number) => Array.from({ length: n }, () => [0, 0] as [number, number]);

describe("money and change", () => {
  it("reads minor units in the currency's own exponent", () => {
    expect(majorUnits("123456", "INR")).toBe(1234.56);
    expect(majorUnits("1500", "JPY")).toBe(1500);
    expect(majorUnits("1500", "KWD")).toBe(1.5);
  });

  it("gives a percentage change, and none when there was nothing before", () => {
    expect(periodChange(150, 100)).toEqual({ value: 50 });
    expect(periodChange(0, 80)).toEqual({ value: -100 });
    expect(periodChange(1, 3)).toEqual({ value: -66.7 });
    expect(periodChange(40, 0)).toBeUndefined();
  });

  it("draws the sparkline as rolling period averages, from the period before to now", () => {
    expect(rollingMeans([0, 0], [2, 4])).toEqual([0, 1, 3]);
  });
});

describe("KPI tiles", () => {
  it("shows honest zeros, and says so, for a store with no orders", () => {
    const empty = figures(zeros(7), zeros(7));
    const revenue = salesKpi("revenue", empty, LOCALE);
    expect(revenue.value).toBe("₹0.00");
    expect(revenue.delta).toBeUndefined();
    expect(revenue.comparison).toBe("No orders in the last 7 days");
    expect(revenue.data).toBeNull();
    expect(salesKpi("orders", empty, LOCALE)).toMatchObject({
      value: "0",
      comparison: "No orders in the last 7 days",
      data: null,
    });
  });

  it("sums the period's revenue and orders, and compares them with the period before", () => {
    const sales = figures(
      [
        [1040, 1],
        [0, 0],
        [0, 0],
        [940, 1],
        [0, 0],
        [0, 0],
        [240, 1],
      ],
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [540, 1],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    );
    const revenue = salesKpi("revenue", sales, LOCALE);
    expect(revenue.value).toBe("₹2,220.00");
    expect(revenue.short).toBe(revenue.value);
    expect(revenue.delta).toEqual({ value: 311.1 });
    expect(revenue.comparison).toBe("vs previous 7 days");
    expect(revenue.data).toHaveLength(8);
    expect(revenue.data?.at(-1)).toBeGreaterThan(revenue.data?.[0] ?? 0);
    const orders = salesKpi("orders", sales, LOCALE);
    expect(orders).toMatchObject({ value: "3", delta: { value: 200 } });
  });

  it("gives no change when the period before had nothing to compare", () => {
    const first = figures([...zeros(6), [540, 1]], zeros(7));
    const revenue = salesKpi("revenue", first, LOCALE);
    expect(revenue.delta).toBeUndefined();
    expect(revenue.comparison).toBe("Last 7 days");
    expect(revenue.data).not.toBeNull();
  });

  it("compacts large figures for a phone's tile", () => {
    const big = figures([...zeros(6), [1_234_567, 40]], zeros(7));
    const revenue = salesKpi("revenue", big, LOCALE);
    expect(revenue.value).toBe("₹12,34,567.00");
    expect(revenue.short).not.toBe(revenue.value);
    expect(revenue.short.length).toBeLessThan(revenue.value.length);
  });

  it("counts new customers", () => {
    const customers: CustomerFigures = {
      days: 3,
      current: { daily: [{ count: 2 }, { count: 0 }, { count: 1 }] },
      previous: { daily: [{ count: 0 }, { count: 1 }, { count: 0 }] },
    };
    expect(customersKpi(customers, LOCALE)).toMatchObject({
      value: "3",
      delta: { value: 200 },
      comparison: "vs previous 3 days",
    });
    const none: CustomerFigures = {
      days: 3,
      current: { daily: [{ count: 0 }, { count: 0 }, { count: 0 }] },
      previous: { daily: [{ count: 0 }, { count: 0 }, { count: 0 }] },
    };
    expect(customersKpi(none, LOCALE)).toMatchObject({
      value: "0",
      comparison: "No new customers in the last 3 days",
      data: null,
    });
  });
});

describe("the Sales chart", () => {
  it("draws each store day at UTC midnight, the period before aligned beneath it", () => {
    const sales = figures([...zeros(6), [240, 1]], [[540, 1], ...zeros(6)]);
    const trend = salesTrend(sales, LOCALE);
    expect(trend.empty).toBe(false);
    expect(trend.value).toBe("₹240.00");
    expect(trend.delta).toEqual({ value: -55.6 });
    const [current, previous] = trend.series;
    expect(current?.label).toBe("Revenue");
    expect(current?.data).toHaveLength(7);
    expect(current?.data.at(-1)).toEqual({ x: new Date("2026-09-14T00:00:00Z"), y: 240 });
    expect(previous).toMatchObject({ tone: "muted", label: "Previous period" });
    // Aligned by day: the previous period's first day sits on this period's first day.
    expect(previous?.data[0]).toEqual({ x: new Date("2026-09-08T00:00:00Z"), y: 540 });
    expect(trend.valueFormat).toMatchObject({ style: "currency", currency: "INR" });
  });

  it("is empty, not a flat line, with no revenue in either period", () => {
    expect(salesTrend(figures(zeros(7), zeros(7)), LOCALE).empty).toBe(true);
  });
});

describe("Top products", () => {
  it("ranks by units sold, and is empty when nothing sold", () => {
    const sales = figures(zeros(7), zeros(7), [
      { productId: "product_1", title: "Cap", units: 4 },
      { productId: null, title: "Old tee", units: 2 },
    ]);
    expect(topProductsSeries(sales)).toEqual([
      {
        id: "top-products",
        label: "Units sold",
        data: [
          { x: "Cap", y: 4 },
          { x: "Old tee", y: 2 },
        ],
      },
    ]);
    expect(topProductsSeries(figures(zeros(7), zeros(7)))).toBeNull();
  });
});
