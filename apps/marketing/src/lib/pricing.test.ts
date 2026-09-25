import type { EntitlementValue } from "@storevia/entitlements";
import type { PublicCatalogue } from "@storevia/entitlements/catalogue";
import { FEATURE_KEYS, type FeatureKey } from "@storevia/entitlements/features";
import { describe, expect, it } from "vitest";
import { FEATURE_COPY, FEATURE_GROUPS, FEATURE_STATUS } from "@/content/plan-features";
import { comparison, planAvailability, pricing } from "./pricing";

const off: EntitlementValue = { kind: "BOOLEAN", enabled: false };
const on: EntitlementValue = { kind: "BOOLEAN", enabled: true };
const limit = (n: bigint): EntitlementValue => ({ kind: "LIMIT", limit: n });
const values = (
  overrides: Partial<Record<FeatureKey, EntitlementValue>>,
): Record<FeatureKey, EntitlementValue> =>
  Object.fromEntries(FEATURE_KEYS.map((key) => [key, overrides[key] ?? off])) as Record<
    FeatureKey,
    EntitlementValue
  >;

const NAMES: Partial<Record<FeatureKey, string>> = {
  store_count: "Stores",
  staff_accounts: "Team members",
  custom_domain: "Custom domains",
  visual_builder: "Page builder",
  analytics: "Analytics",
  advanced_permissions: "Advanced permissions",
};

const catalogue: PublicCatalogue = {
  features: FEATURE_KEYS.map((key) => ({
    key,
    name: NAMES[key] ?? key,
    description: null,
    type: "BOOLEAN",
  })),
  freeAllowance: values({
    store_count: limit(1n),
    staff_accounts: limit(1n),
    visual_builder: on,
  }),
  plans: [
    {
      key: "starter",
      name: "Starter",
      description: "For one small team.",
      trialDays: 14,
      prices: [
        { interval: "MONTH", currency: "USD", amount: 2900n },
        { interval: "YEAR", currency: "USD", amount: 29000n },
      ],
      values: values({
        store_count: limit(1n),
        staff_accounts: limit(2n),
        visual_builder: on,
        custom_domain: on,
        analytics: { kind: "CONFIGURATION", enabled: true, config: { retentionDays: 30 } },
      }),
    },
    {
      key: "business",
      name: "Business",
      description: null,
      trialDays: 0,
      prices: [{ interval: "MONTH", currency: "USD", amount: 123400n }],
      values: values({
        store_count: limit(3n),
        staff_accounts: limit(10n),
        visual_builder: on,
        custom_domain: on,
        advanced_permissions: on,
        analytics: { kind: "CONFIGURATION", enabled: true, config: { retentionDays: 365 } },
      }),
    },
    {
      key: "enterprise",
      name: "Enterprise",
      description: "Priced with you.",
      trialDays: 30,
      prices: [],
      values: values({
        store_count: { kind: "UNLIMITED" },
        staff_accounts: limit(50n),
        visual_builder: on,
        custom_domain: on,
        advanced_permissions: on,
        analytics: { kind: "CONFIGURATION", enabled: true, config: { retentionDays: 730 } },
      }),
    },
  ],
};

describe("pricing", () => {
  const result = pricing(catalogue, "https://app.example/sign-up");

  it("puts Free first, then every public plan in catalogue order", () => {
    expect(result.columns.map((c) => c.name)).toEqual([
      "Free",
      "Starter",
      "Business",
      "Enterprise",
    ]);
    expect(result.columns.map((c) => c.paid)).toEqual([false, true, true, true]);
  });

  it("formats prices from minor units and marks plans without one as by agreement", () => {
    const [free, starter, business, enterprise] = result.columns;
    expect(free?.price.month.amount).toBe("$0");
    expect(starter?.price.month).toEqual({
      amount: "$29",
      note: "per month",
      summary: "$29 per month",
    });
    expect(business?.price.month.amount).toBe("$1,234");
    expect(enterprise?.price.month).toEqual({
      amount: "Custom",
      note: "Priced by agreement",
      summary: "Priced by agreement",
    });
    expect(enterprise?.price.year).toEqual(enterprise?.price.month);
  });

  it("works out the yearly saving from the catalogue, and never invents a yearly price", () => {
    const [, starter, business] = result.columns;
    expect(starter?.price.year).toEqual({
      amount: "$290",
      note: "per year",
      summary: "$290 per year",
      saving: "Saves $58 a year compared with monthly",
    });
    expect(business?.price.year.amount).toBe("$1,234");
    expect(business?.price.year.note).toBe("per month, billed monthly only");
    expect(result.hasYearly).toBe(true);
    expect(result.bestYearlySaving).toBe(17);
    expect(result.currency).toBe("USD");
  });

  it("has no yearly switch when no plan has a yearly price", () => {
    const monthlyOnly: PublicCatalogue = {
      ...catalogue,
      plans: catalogue.plans.map((plan) => ({
        ...plan,
        prices: plan.prices.filter((p) => p.interval === "MONTH"),
      })),
    };
    const view = pricing(monthlyOnly, "/sign-up");
    expect(view.hasYearly).toBe(false);
    expect(view.bestYearlySaving).toBeNull();
  });

  it("sends Free to sign-up and every paid plan to a conversation, never to checkout", () => {
    const [free, ...paid] = result.columns;
    expect(free?.cta).toEqual({
      label: "Start free",
      href: "https://app.example/sign-up",
      external: true,
    });
    for (const column of paid) {
      expect(column.cta.label).toBe("Talk to us");
      expect(column.cta.href).toBe(`/contact?topic=plans&plan=${encodeURIComponent(column.name)}`);
    }
  });

  it("leads with the headline limits and lists only what each plan adds", () => {
    const [free, starter, business, enterprise] = result.columns;
    expect(free?.limits.map((l) => [l.name, l.value])).toContainEqual(["Stores", "Up to 1"]);
    // Free lists what it includes; the rest build on the column before.
    expect(free?.highlights.map((h) => h.name)).toEqual(["Page builder"]);
    expect(free?.buildsOn).toBeUndefined();
    expect(starter?.buildsOn).toBe("Free");
    expect(starter?.highlights.map((h) => h.name)).toEqual(["Custom domains", "Analytics"]);
    expect(business?.buildsOn).toBe("Starter");
    expect(business?.highlights.map((h) => [h.name, h.value])).toEqual([
      ["Analytics", "365 days of history"],
      ["Advanced permissions", "Included"],
    ]);
    expect(enterprise?.highlights.map((h) => h.value)).toEqual(["730 days of history"]);
    // Headline limits never repeat as highlights.
    expect(business?.highlights.some((h) => h.key === "staff_accounts")).toBe(false);
  });

  it("marks features that aren't live yet, and only those", () => {
    const [, starter, business] = result.columns;
    expect(starter?.highlights.find((h) => h.key === "custom_domain")?.status).toBe("roadmap");
    expect(business?.highlights.find((h) => h.key === "advanced_permissions")?.status).toBe(
      "roadmap",
    );
    for (const column of result.columns) {
      for (const h of column.highlights) {
        const status = FEATURE_STATUS[h.key];
        expect(h.status, h.key).toBe(status === "available" ? undefined : status);
      }
    }
  });
});

describe("comparison", () => {
  it("covers every catalogue feature once, grouped, with a value per column", () => {
    const groups = comparison(catalogue);
    const keys = groups.flatMap((g) => g.rows.map((r) => r.key));
    expect([...keys].sort()).toEqual([...FEATURE_KEYS].sort());
    expect(groups.map((g) => g.title)).toEqual(FEATURE_GROUPS.map((g) => g.title));
    for (const row of groups.flatMap((g) => g.rows)) expect(row.values).toHaveLength(4);
    const analytics = groups.flatMap((g) => g.rows).find((r) => r.key === "analytics");
    expect(analytics?.values).toEqual([
      null,
      "30 days of history",
      "365 days of history",
      "730 days of history",
    ]);
    expect(analytics?.status).toBe("roadmap");
  });

  it("describes each feature in customer words, not the catalogue's notes", () => {
    for (const row of comparison(catalogue).flatMap((g) => g.rows)) {
      expect(row.description, row.key).toBe(FEATURE_COPY[row.key]);
      expect(row.description, row.key).not.toMatch(/bytes|not archived/);
    }
  });

  it("drops features the catalogue doesn't have", () => {
    const partial = { ...catalogue, features: catalogue.features.slice(0, 2) };
    expect(comparison(partial).flatMap((g) => g.rows.map((r) => r.key))).toEqual([
      "store_count",
      "staff_accounts",
    ]);
  });
});

describe("planAvailability", () => {
  it("says which plans include a feature, in a few words", () => {
    expect(planAvailability(catalogue, "visual_builder")).toBe("All plans");
    expect(planAvailability(catalogue, "store_count")).toBe("All plans, limits vary");
    expect(planAvailability(catalogue, "custom_domain")).toBe("Paid plans");
    expect(planAvailability(catalogue, "advanced_permissions")).toBe("Business and Enterprise");
    expect(planAvailability(catalogue, "priority_support")).toBe("Not in current plans");
    const missing = { ...catalogue, features: [] };
    expect(planAvailability(missing, "store_count")).toBeNull();
  });
});
