import { describe, expect, it } from "vitest";
import { nextSlot, retryDelayMs, slotAtOrAfter } from "./schedule";

const daily = { everySeconds: 86_400, anchor: new Date("1970-01-01T03:00:00Z") };
const fiveMin = { everySeconds: 300 };

describe("slots", () => {
  it("aligns to the anchor", () => {
    expect(slotAtOrAfter(daily, new Date("2026-09-24T10:15:00Z"))).toEqual(
      new Date("2026-09-25T03:00:00Z"),
    );
    expect(slotAtOrAfter(daily, new Date("2026-09-25T03:00:00Z"))).toEqual(
      new Date("2026-09-25T03:00:00Z"),
    );
    expect(slotAtOrAfter(fiveMin, new Date("2026-09-24T10:01:00Z"))).toEqual(
      new Date("2026-09-24T10:05:00Z"),
    );
  });

  it("advances by one period, skipping missed slots", () => {
    const slot = new Date("2026-09-20T03:00:00Z");
    expect(nextSlot(daily, slot, new Date("2026-09-20T03:00:05Z"))).toEqual(
      new Date("2026-09-21T03:00:00Z"),
    );
    // Down for three days: the next run is the next future slot, once.
    expect(nextSlot(daily, slot, new Date("2026-09-23T12:00:00Z"))).toEqual(
      new Date("2026-09-24T03:00:00Z"),
    );
  });
});

describe("retry backoff", () => {
  it("doubles and caps", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(retryDelayMs(20)).toBe(15 * 60_000);
  });
});
