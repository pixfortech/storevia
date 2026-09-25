import type { UsageLine } from "@storevia/entitlements";
import type { OrganisationBilling } from "@storevia/tenancy";
import { describe, expect, it } from "vitest";
import { atLimit, planIndicator, tightestUsage } from "./plan";

const line = (
  key: UsageLine["key"],
  name: string,
  usage: number,
  limit: number | "unlimited",
): UsageLine => ({
  key,
  name,
  usage: BigInt(usage),
  limit: limit === "unlimited" ? limit : BigInt(limit),
  overLimit: limit !== "unlimited" && usage > limit,
});

type Subscription = NonNullable<OrganisationBilling["subscription"]>;

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub_1",
    status: "ACTIVE",
    managedBy: "STOREVIA",
    planId: "plan_1",
    planName: "Growth",
    billingInterval: "MONTH",
    startedAt: new Date("2026-01-01T00:00:00Z"),
    trialStartsAt: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    expiresAt: null,
    cancelledAt: null,
    pastDueSince: null,
    graceEndsAt: null,
    entitling: true,
    ...overrides,
  };
}

describe("tightestUsage", () => {
  it("shows the line closest to its limit", () => {
    const usage = [
      line("store_count", "Stores", 1, 3),
      line("staff_accounts", "Team members", 9, 10),
    ];
    expect(tightestUsage(usage)).toEqual({ label: "Team members", used: 9, limit: 10 });
  });

  it("puts over-limit lines first and unlimited lines last", () => {
    expect(
      tightestUsage([
        line("store_count", "Stores", 3, 3),
        line("staff_accounts", "Team members", 12, 10),
      ]),
    ).toEqual({ label: "Team members", used: 12, limit: 10 });
    expect(
      tightestUsage([
        line("store_count", "Stores", 40, "unlimited"),
        line("staff_accounts", "Team members", 0, 5),
      ]),
    ).toEqual({ label: "Team members", used: 0, limit: 5 });
  });

  it("keeps catalogue order on a tie and reports unlimited usage honestly", () => {
    const usage = [
      line("store_count", "Stores", 1, 2),
      line("staff_accounts", "Team members", 5, 10),
    ];
    expect(tightestUsage(usage)?.label).toBe("Stores");
    expect(tightestUsage([line("store_count", "Stores", 7, "unlimited")])).toEqual({
      label: "Stores",
      used: 7,
      limit: null,
    });
    expect(tightestUsage([])).toBeUndefined();
  });

  it("treats a zero limit as full, and any use of it as over", () => {
    expect(
      tightestUsage([line("store_count", "Stores", 1, 2), line("staff_accounts", "Team", 0, 0)]),
    ).toEqual({ label: "Team", used: 0, limit: 0 });
    expect(
      tightestUsage([line("store_count", "Stores", 5, 5), line("staff_accounts", "Team", 1, 0)])
        ?.label,
    ).toBe("Team");
  });
});

describe("planIndicator", () => {
  const usage = [line("store_count", "Stores", 1, 1)];

  it("names the plan and stays quiet while it is active", () => {
    expect(planIndicator({ subscription: subscription(), usage }, "/o/x/billing")).toEqual({
      name: "Growth plan",
      status: undefined,
      href: "/o/x/billing",
      meter: { label: "Stores", used: 1, limit: 1 },
    });
  });

  it("calls the free allowance by its name when there is no subscription", () => {
    expect(planIndicator({ subscription: null, usage }, "/b").name).toBe("Free allowance");
  });

  it.each([
    [{ status: "TRIAL" as const }, { label: "Trial", tone: "info" }],
    [{ status: "PAST_DUE" as const }, { label: "Past due", tone: "warning" }],
    [{ status: "CANCELLED" as const }, { label: "Cancelled", tone: "warning" }],
    [
      { status: "PAST_DUE" as const, entitling: false },
      { label: "Ended", tone: "neutral" },
    ],
  ])("flags a plan that needs attention (%o)", (overrides, status) => {
    expect(planIndicator({ subscription: subscription(overrides), usage }, "/b").status).toEqual(
      status,
    );
  });
});

describe("atLimit", () => {
  it("is true at or past the limit, including a zero limit", () => {
    expect(atLimit(line("store_count", "Stores", 3, 3))).toBe(true);
    expect(atLimit(line("store_count", "Stores", 4, 3))).toBe(true);
    expect(atLimit(line("store_count", "Stores", 0, 0))).toBe(true);
  });

  it("is false with room left, without a limit or without a line", () => {
    expect(atLimit(line("store_count", "Stores", 2, 3))).toBe(false);
    expect(atLimit(line("store_count", "Stores", 9, "unlimited"))).toBe(false);
    expect(atLimit(undefined)).toBe(false);
    expect(atLimit(null)).toBe(false);
  });
});
