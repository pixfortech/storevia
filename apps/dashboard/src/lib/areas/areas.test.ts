import { FEATURE_KEYS } from "@storevia/entitlements/features";
import { STORE_AREAS, type AreaKey } from "@storevia/tenancy/business-types";
import { ILLUSTRATION_NAMES } from "@storevia/ui";
import { describe, expect, it } from "vitest";
import { FEATURE_AVAILABILITY, entitlementGroups, intervalLabel, planFacts } from "./billing";
import { expiryText, formatLongDate } from "./dates";
import { filterMembers, storeAccessLabel } from "./members";
import { AREA_ILLUSTRATION, areaScheduleLabel } from "./store-areas";
import { describeUserAgent } from "./user-agent";

describe("store area placeholders", () => {
  it("gives every area an illustration from the shared set", () => {
    for (const key of Object.keys(STORE_AREAS) as AreaKey[]) {
      expect(ILLUSTRATION_NAMES).toContain(AREA_ILLUSTRATION[key]);
    }
  });

  it("names the milestone when one is scheduled, and never promises one otherwise", () => {
    expect(areaScheduleLabel(STORE_AREAS.orders.availability)).toBe("Milestone 6");
    expect(areaScheduleLabel(STORE_AREAS.posts.availability)).toBe("On the roadmap");
    expect(areaScheduleLabel(undefined)).toBe("Available");
  });
});

describe("describeUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
      "Chrome on macOS",
      "desktop",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0",
      "Edge on Windows",
      "desktop",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
      "mobile",
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1",
      "Chrome on iPad",
      "tablet",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
      "Chrome on Android",
      "mobile",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
      "Firefox on Linux",
      "desktop",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0 Safari/537.36",
      "Chrome on Linux",
      "desktop",
    ],
  ])("%s", (ua, label, kind) => {
    expect(describeUserAgent(ua)).toEqual({ label, kind });
  });

  it("stays honest about what it can't recognise", () => {
    expect(describeUserAgent(null)).toEqual({ label: "Unknown device", kind: "unknown" });
    expect(describeUserAgent("  ")).toEqual({ label: "Unknown device", kind: "unknown" });
    expect(describeUserAgent("curl/8.4.0")).toEqual({ label: "Unknown device", kind: "unknown" });
    expect(describeUserAgent("SomeBot (Windows NT 10.0)").label).toBe("Unknown browser on Windows");
  });
});

describe("filterMembers", () => {
  const members = [
    { name: "Priya Sharma", email: "owner@acme.test", roleLabel: "Owner", status: "ACTIVE" },
    { name: "Dev Designer", email: "designer@acme.test", roleLabel: "Designer", status: "ACTIVE" },
    { name: "Sam Support", email: "sam@acme.test", roleLabel: "Support", status: "SUSPENDED" },
  ] as const;

  it("matches every word against name, email and role, ignoring case", () => {
    expect(filterMembers(members, "").map((m) => m.name)).toHaveLength(3);
    expect(filterMembers(members, "DESIGN").map((m) => m.name)).toEqual(["Dev Designer"]);
    expect(filterMembers(members, "acme owner").map((m) => m.name)).toEqual(["Priya Sharma"]);
    expect(filterMembers(members, "nobody")).toEqual([]);
  });

  it("filters by status", () => {
    expect(filterMembers(members, "", "suspended").map((m) => m.name)).toEqual(["Sam Support"]);
    expect(filterMembers(members, "", "active")).toHaveLength(2);
  });
});

describe("storeAccessLabel", () => {
  const names = new Map([
    ["s1", "Acme Outlet"],
    ["s2", "Acme Journal"],
  ]);

  it("reads naturally for every case", () => {
    expect(storeAccessLabel(true, [], names)).toBe("All stores");
    expect(storeAccessLabel(false, [], names)).toBe("No stores");
    expect(storeAccessLabel(false, ["s1"], names)).toBe("Acme Outlet");
    expect(storeAccessLabel(false, ["s1", "s2"], names)).toBe("Acme Outlet and 1 more");
    expect(storeAccessLabel(false, ["x", "y"], names)).toBe("2 stores");
    expect(storeAccessLabel(false, ["x"], names)).toBe("1 store");
  });
});

describe("dates", () => {
  const now = new Date("2026-09-25T10:00:00Z");

  it("formats long dates in the given time zone", () => {
    expect(formatLongDate(new Date("2026-09-24T23:30:00Z"))).toBe("24 September 2026");
    expect(formatLongDate(new Date("2026-09-24T23:30:00Z"), "Asia/Kolkata")).toBe(
      "25 September 2026",
    );
  });

  it("says when an invitation expires in calendar days", () => {
    expect(expiryText(new Date("2026-09-25T18:00:00Z"), now)).toBe("Expires today");
    expect(expiryText(new Date("2026-09-26T01:00:00Z"), now)).toBe("Expires tomorrow");
    expect(expiryText(new Date("2026-10-02T10:00:00Z"), now)).toBe("Expires in 7 days");
    expect(expiryText(new Date("2026-09-25T09:00:00Z"), now)).toBe("Expired");
  });
});

describe("billing presentation", () => {
  const base = {
    status: "ACTIVE",
    billingInterval: "MONTH",
    startedAt: new Date("2026-09-24T09:00:00Z"),
    trialEndsAt: null,
    currentPeriodEnd: new Date("2026-10-24T09:00:00Z"),
    expiresAt: null,
    entitling: true,
  } as const;

  it("labels billing intervals", () => {
    expect(intervalLabel("YEAR")).toBe("Annual");
    expect(intervalLabel("MONTH")).toBe("Monthly");
    expect(intervalLabel(null)).toBe("By agreement");
  });

  it("lists only the dates the subscription has", () => {
    expect(planFacts(base)).toEqual([
      { term: "Billing", detail: "Monthly" },
      { term: "Started", detail: "24 September 2026" },
      { term: "Renews", detail: "24 October 2026" },
    ]);
    const trial = planFacts({
      ...base,
      status: "TRIAL",
      trialEndsAt: new Date("2026-10-08T00:00:00Z"),
    });
    expect(trial.map((f) => f.term)).toEqual(["Billing", "Started", "Trial ends", "Renews"]);
    const cancelled = planFacts({
      ...base,
      status: "CANCELLED",
      expiresAt: new Date("2026-10-24T09:00:00Z"),
    });
    expect(cancelled.map((f) => f.term)).toEqual(["Billing", "Started", "Access ends"]);
    const ended = planFacts({ ...base, entitling: false });
    expect(ended.at(-1)).toEqual({
      term: "Plan features",
      detail: "Ended. Free allowance applies",
    });
  });

  it("splits entitlements into limits and features, keeping what isn't included", () => {
    const groups = entitlementGroups([
      { key: "store_count", name: "Stores", type: "LIMIT", value: { kind: "LIMIT", limit: 3n } },
      { key: "product_limit", name: "Products", type: "LIMIT", value: { kind: "UNLIMITED" } },
      {
        key: "custom_domain",
        name: "Custom domains",
        type: "BOOLEAN",
        value: { kind: "BOOLEAN", enabled: true },
      },
      {
        key: "api_access",
        name: "API access",
        type: "BOOLEAN",
        value: { kind: "BOOLEAN", enabled: false },
      },
    ]);
    expect(groups.limits).toEqual([
      {
        key: "store_count",
        name: "Stores",
        label: "Up to 3",
        included: true,
        availability: null,
      },
      {
        key: "product_limit",
        name: "Products",
        label: "Unlimited",
        included: true,
        availability: "Coming in Milestone 3",
      },
    ]);
    expect(groups.features).toEqual([
      {
        key: "custom_domain",
        name: "Custom domains",
        label: "Included",
        included: true,
        availability: "Coming in Milestone 7",
      },
      {
        key: "api_access",
        name: "API access",
        label: "Not included",
        included: false,
        availability: "Coming in Milestone 3",
      },
    ]);
  });

  it("labels every feature that isn't built yet, and only those", () => {
    for (const key of FEATURE_KEYS) {
      const availability = FEATURE_AVAILABILITY[key];
      if (availability !== null) {
        expect(availability).toMatch(/^(Coming in Milestone \d+|On the roadmap)$/);
      }
    }
    // Stores and team members are the only plan features merchants can use today.
    expect(FEATURE_KEYS.filter((key) => FEATURE_AVAILABILITY[key] === null)).toEqual([
      "store_count",
      "staff_accounts",
    ]);
  });
});
