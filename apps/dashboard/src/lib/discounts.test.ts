import { describe, expect, it } from "vitest";
import { dateToZonedLocal, discountValueText, usageText, zonedLocalToDate } from "./discounts";

describe("discount date fields", () => {
  it("reads a local time in the store's time zone", () => {
    expect(zonedLocalToDate("2026-10-01T09:00", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-10-01T03:30:00.000Z",
    );
    expect(zonedLocalToDate("2026-10-01T09:00", "UTC")?.toISOString()).toBe(
      "2026-10-01T09:00:00.000Z",
    );
  });

  it("handles daylight saving time", () => {
    // New York: EDT (UTC−4) in July, EST (UTC−5) in December.
    expect(zonedLocalToDate("2026-07-01T12:00", "America/New_York")?.toISOString()).toBe(
      "2026-07-01T16:00:00.000Z",
    );
    expect(zonedLocalToDate("2026-12-01T12:00", "America/New_York")?.toISOString()).toBe(
      "2026-12-01T17:00:00.000Z",
    );
  });

  it("round-trips through the form value", () => {
    const date = new Date("2026-03-15T18:45:00.000Z");
    for (const zone of ["Asia/Kolkata", "Europe/London", "America/Los_Angeles", "UTC"]) {
      expect(zonedLocalToDate(dateToZonedLocal(date, zone), zone)?.toISOString()).toBe(
        date.toISOString(),
      );
    }
  });

  it("rejects values that aren't datetime-local", () => {
    expect(zonedLocalToDate("", "UTC")).toBeNull();
    expect(zonedLocalToDate("tomorrow", "UTC")).toBeNull();
    expect(zonedLocalToDate("2026-10-01", "UTC")).toBeNull();
  });
});

describe("discount wording", () => {
  it("describes the value and usage", () => {
    expect(discountValueText({ type: "PERCENTAGE", percentage: "12.5", amount: null })).toBe(
      "12.5% off",
    );
    expect(
      discountValueText({
        type: "FIXED_AMOUNT",
        percentage: null,
        amount: { amount: "10000", currency: "INR" },
      }),
    ).toBe("₹100.00 off");
    expect(usageText(3, 100)).toBe("3 / 100 used");
    expect(usageText(0, null)).toBe("0 used · no limit");
  });
});
