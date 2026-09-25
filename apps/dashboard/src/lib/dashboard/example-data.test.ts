import { describe, expect, it } from "vitest";
import {
  exampleKpi,
  exampleList,
  examplePeriods,
  exampleRanking,
  exampleShare,
  exampleTotal,
  exampleTrend,
} from "./example-data";

const END = new Date("2026-09-25T15:30:00Z");
const FORMAT = { currency: "GBP", locale: "en-GB" };

describe("example data", () => {
  it("is deterministic for a given day", () => {
    const a = exampleTrend("revenue", "Revenue", { days: 30, end: END }, FORMAT);
    const b = exampleTrend("revenue", "Revenue", { days: 30, end: new Date(END) }, FORMAT);
    expect(a).toEqual(b);
  });

  it("covers the period and the one before it, day by day", () => {
    const { current, previous } = examplePeriods("orders", { days: 7, end: END });
    expect(current).toHaveLength(7);
    expect(previous).toHaveLength(7);
    const trend = exampleTrend("orders", "Orders", { days: 7, end: END }, FORMAT);
    const [series, before] = trend.series;
    expect(series?.data.map((d) => (d.x as Date).toISOString().slice(0, 10))).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
    expect(before?.tone).toBe("muted");
    expect(before?.data.map((d) => d.x)).toEqual(series?.data.map((d) => d.x));
  });

  it("formats KPIs so the figure, the change and the sparkline agree", () => {
    const window = { days: 30, end: END };
    const kpi = exampleKpi("revenue", window, FORMAT);
    const { current, previous } = examplePeriods("revenue", window);
    const total = current.reduce((sum, v) => sum + v, 0);
    const before = previous.reduce((sum, v) => sum + v, 0);
    expect(kpi.value).toBe(
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
      }).format(total),
    );
    expect(kpi.short).toBe(
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(total),
    );
    expect(kpi.delta.value).toBe(Math.round(((total - before) / before) * 1000) / 10);
    expect(exampleKpi("orders", window, FORMAT).short).toMatch(/^\d,\d{3}$/);
    // The sparkline runs from the previous period's daily average to this one's.
    expect(kpi.data).toHaveLength(31);
    expect(kpi.data[0]).toBeCloseTo(before / 30, 1);
    expect(kpi.data.at(-1)).toBeCloseTo(total / 30, 1);
  });

  it("draws every sparkline in the direction of its change", () => {
    const metrics = [
      "revenue",
      "orders",
      "conversion",
      "customers",
      "visitors",
      "page-views",
      "project-views",
      "enquiries",
      "posts-published",
    ] as const;
    for (const metric of metrics) {
      for (const days of [7, 30, 90]) {
        const { data, delta } = exampleKpi(metric, { days, end: END }, FORMAT);
        const rise = (data.at(-1) ?? 0) - (data[0] ?? 0);
        if (delta.value > 0) expect(rise, `${metric} ${String(days)}`).toBeGreaterThan(0);
        if (delta.value < 0) expect(rise, `${metric} ${String(days)}`).toBeLessThan(0);
      }
    }
  });

  it("fits the trend axis to the data, never below zero", () => {
    const trend = exampleTrend("revenue", "Revenue", { days: 30, end: END }, FORMAT);
    const values = trend.series.flatMap((s) => s.data.map((d) => d.y ?? 0));
    const [lo, hi] = trend.domain;
    expect(lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(Math.min(...values));
    expect(hi).toBe(Math.max(...values));
  });

  it("gives rates an average and a change in points", () => {
    const kpi = exampleKpi("conversion", { days: 30, end: END }, FORMAT);
    expect(kpi.value).toMatch(/^\d+\.\d%$/);
    expect(kpi.delta.label).toMatch(/^([+−]\d+\.\d|0\.0) pts$/);
  });

  it("scales rankings and shares with the period", () => {
    const week = exampleRanking("top-content", "PUBLISHING", "Views", 7)[0]?.data[0]?.y ?? 0;
    const quarter = exampleRanking("top-content", "PUBLISHING", "Views", 90)[0]?.data[0]?.y ?? 0;
    expect(quarter).toBeGreaterThan(week);
    expect(exampleRanking("top-products", "ECOMMERCE", "Revenue", 30)[0]?.data[0]).toEqual({
      x: "Linen overshirt",
      y: 8420,
    });
  });

  it("splits traffic so the parts add up to the period's visitors", () => {
    const visitors = exampleTotal("visitors", { days: 30, end: END });
    const parts = exampleShare(visitors);
    expect(parts.reduce((sum, p) => sum + p.value, 0)).toBe(visitors);
    expect(parts.map((p) => p.value)).toEqual([...parts.map((p) => p.value)].sort((a, b) => b - a));
  });

  it("has example rows for every list widget", () => {
    for (const key of [
      "stock-alerts",
      "content-updates",
      "portfolio-updates",
      "authors",
    ] as const) {
      expect(exampleList(key).length).toBeGreaterThan(0);
    }
  });
});
