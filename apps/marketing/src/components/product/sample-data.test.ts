import { describe, expect, it } from "vitest";
import { exampleSeries, SAMPLE_DASHBOARDS, scaleSeries } from "./sample-data";

describe("exampleSeries", () => {
  it("draws the same series every time", () => {
    const options = { base: 100, growth: 0.2, weekly: 0.1, jitter: 0.1, seed: 7 };
    expect(exampleSeries(30, options)).toEqual(exampleSeries(30, options));
    expect(exampleSeries(30, options)).toHaveLength(30);
  });
});

describe("scaleSeries", () => {
  it("sums to the total exactly and keeps the shape", () => {
    const scaled = scaleSeries([1, 2, 3, 4], 1000);
    expect(scaled.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(scaled[3]).toBeGreaterThan(scaled[0] ?? 0);
  });

  it("returns zeros for an empty or flat-zero series", () => {
    expect(scaleSeries([0, 0], 10)).toEqual([0, 0]);
    expect(scaleSeries([], 10)).toEqual([]);
  });
});

describe("SAMPLE_DASHBOARDS", () => {
  it("gives the analytics chart a figure to agree with", () => {
    expect(SAMPLE_DASHBOARDS.ECOMMERCE.kpis.find((k) => k.label === "Visitors")).toMatchObject({
      value: "8,940",
      delta: 9.1,
    });
  });
});
