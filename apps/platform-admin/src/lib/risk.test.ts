import { describe, expect, it } from "vitest";
import { activeOverrideCount, riskItems, type RiskInput } from "./risk";

const now = new Date("2026-09-25T12:00:00Z");
const base: RiskInput = {
  organisationStatus: "ACTIVE",
  subscription: { status: "ACTIVE", source: "MANUAL", graceEndsAt: null, expiresAt: null },
  entitling: true,
  usage: [
    { name: "Stores", overLimit: false },
    { name: "Team members", overLimit: false },
  ],
  overrides: [],
  now,
};

describe("riskItems", () => {
  it("is empty when everything is in order", () => {
    expect(riskItems(base)).toEqual([]);
  });

  it("puts danger before warnings before notes, keeping order within a tone", () => {
    const items = riskItems({
      ...base,
      subscription: {
        status: "PAST_DUE",
        source: "MOCK",
        graceEndsAt: new Date("2026-10-01T00:00:00Z"),
        expiresAt: null,
      },
      usage: [
        { name: "Stores", overLimit: true },
        { name: "Team members", overLimit: true },
      ],
      overrides: [{ expiresAt: null }],
    });
    expect(items.map((i) => i.tone)).toEqual(["danger", "danger", "warning", "info", "info"]);
    expect(items[0]?.text).toBe("Over the stores limit.");
    expect(items[1]?.text).toBe("Over the team members limit.");
    expect(items[2]?.text).toBe("Payment overdue. Grace ends 1 Oct 2026, 00:00 UTC.");
    expect(items[3]?.text).toBe("1 active entitlement override.");
    expect(items[4]?.text).toBe("Subscription comes from mock billing (test only).");
  });

  it("flags a suspended organisation and a subscription that no longer entitles", () => {
    const items = riskItems({ ...base, organisationStatus: "SUSPENDED", entitling: false });
    expect(items.map((i) => i.text)).toEqual([
      "Organisation is suspended.",
      "Subscription no longer grants its plan: system defaults apply.",
    ]);
  });

  it("states when a cancelled subscription's access ends", () => {
    const items = riskItems({
      ...base,
      subscription: {
        status: "CANCELLED",
        source: "MANUAL",
        graceEndsAt: null,
        expiresAt: new Date("2026-10-31T00:00:00Z"),
      },
    });
    expect(items).toEqual([
      { tone: "warning", text: "Cancelled. Access ends 31 Oct 2026, 00:00 UTC." },
    ]);
  });

  it("doesn't count expired overrides", () => {
    const overrides = [
      { expiresAt: null },
      { expiresAt: new Date("2026-09-30T00:00:00Z") },
      { expiresAt: new Date("2026-09-01T00:00:00Z") },
    ];
    expect(activeOverrideCount(overrides, now)).toBe(2);
    expect(riskItems({ ...base, overrides })).toEqual([
      { tone: "info", text: "2 active entitlement overrides." },
    ]);
  });
});
