import { describe, expect, it } from "vitest";
import {
  environmentLabel,
  formatDate,
  formatDateTime,
  formatLimit,
  humanise,
  permissionLabel,
} from "./format";

describe("format helpers", () => {
  it("shows dates in UTC", () => {
    const d = new Date("2026-09-24T23:30:00Z");
    expect(formatDate(d)).toBe("24 Sept 2026");
    expect(formatDateTime(d)).toBe("24 Sept 2026, 23:30 UTC");
    expect(formatDate(null)).toBe("—");
  });

  it("humanises enum values and limits", () => {
    expect(humanise("PAST_DUE")).toBe("Past due");
    expect(humanise("subscription.created")).toBe("Subscription created");
    expect(formatLimit("unlimited")).toBe("Unlimited");
    expect(formatLimit(1500n)).toBe("1,500");
  });

  it("names the environment and platform permissions", () => {
    expect(environmentLabel("development")).toBe("Development");
    expect(permissionLabel("platform.billing.simulate")).toBe("Simulate billing events");
    expect(permissionLabel("platform.something_new")).toBe("Platform something new");
  });
});
