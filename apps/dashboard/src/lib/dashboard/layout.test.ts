import type { FeatureKey } from "@storevia/entitlements/features";
import { STORE_AREAS, type BusinessType } from "@storevia/tenancy/business-types";
import { permissionsFor } from "@storevia/tenancy/rbac";
import { describe, expect, it } from "vitest";
import { composeDashboard } from "./compose";
import { arrangeDashboard, trackingGroups } from "./layout";

const PAID: ReadonlySet<FeatureKey> = new Set<FeatureKey>(["analytics", "visual_builder"]);
const FREE: ReadonlySet<FeatureKey> = new Set<FeatureKey>();

const widgets = (
  businessType: BusinessType,
  granted: ReadonlySet<FeatureKey> = PAID,
  role: Parameters<typeof permissionsFor>[0] = "OWNER",
) =>
  composeDashboard({ businessType, permissions: permissionsFor(role), grantedFeatures: granted })
    .widgets;
const keys = (list: readonly { key: string }[]) => list.map((w) => w.key);

describe("arrangeDashboard with real data only (production)", () => {
  const layout = arrangeDashboard(widgets("ECOMMERCE"), false);

  it("draws no empty frames: only live widgets get a card", () => {
    // Orders and customers are live: their figures always get a card.
    expect(keys(layout.metrics)).toEqual(["revenue", "orders", "customers"]);
    expect(keys(layout.main)).toEqual(["sales-trend", "setup"]);
    expect(keys(layout.rail)).toEqual(["website-status", "plan-usage", "team"]);
    expect(keys(layout.bands)).toEqual(["focus"]);
  });

  it("gives the live catalogue and sales modules their own row beside recent activity", () => {
    expect(keys(layout.modules)).toEqual(["catalogue", "stock-alerts", "top-products", "activity"]);
    expect(layout.underMain).toBeNull();
  });

  it("shows a member who reads customers but not orders only the customers figure", () => {
    const marketing = arrangeDashboard(widgets("ECOMMERCE", PAID, "MARKETING"), false);
    expect(keys(marketing.metrics)).toEqual(["customers"]);
    expect(keys(marketing.main)).not.toContain("sales-trend");
    expect(keys(marketing.modules)).not.toContain("top-products");
  });

  it("puts a lone secondary module under the main column, not in a row of its own", () => {
    const portfolio = arrangeDashboard(widgets("PORTFOLIO"), false);
    expect(portfolio.underMain?.key).toBe("activity");
    expect(portfolio.modules).toEqual([]);
  });

  it("shows a business's recently edited pages beside recent activity", () => {
    const business = arrangeDashboard(widgets("BUSINESS"), false);
    expect(keys(business.modules)).toEqual(["content-updates", "activity"]);
    expect(business.underMain).toBeNull();
  });

  it("summarises the rest by the store area their figures belong with, with no dates", () => {
    // Nothing from orders or customers is upcoming any more.
    expect(layout.tracking.map((g) => [g.area, g.metrics])).toEqual([
      ["analytics", ["Conversion"]],
    ]);
    expect(Object.keys(layout.tracking[0] ?? {})).not.toContain("availability");
    // Enquiries sit with customers but need site forms, which are planned.
    const business = arrangeDashboard(widgets("BUSINESS"), false);
    expect(business.tracking.find((g) => g.area === "customers")).toMatchObject({
      label: "Customers",
      metrics: ["Enquiries"],
    });
  });

  it("names each figure once, even when two widgets share a title", () => {
    const readers = arrangeDashboard(widgets("PUBLISHING"), false).tracking.find(
      (g) => g.area === "analytics",
    );
    expect(readers?.metrics).toEqual(["Readers", "Page views", "Top posts", "Traffic sources"]);
  });
});

describe("arrangeDashboard in a development preview", () => {
  it("gives every upcoming widget its card and leaves nothing to summarise", () => {
    const layout = arrangeDashboard(widgets("ECOMMERCE"), true);
    expect(keys(layout.metrics)).toEqual(["revenue", "orders", "conversion", "customers"]);
    expect(keys(layout.main)).toEqual(["sales-trend", "setup"]);
    expect(keys(layout.modules)).toEqual(["catalogue", "stock-alerts", "top-products", "activity"]);
    expect(layout.underMain).toBeNull();
    expect(layout.tracking).toEqual([]);
  });

  it("never locks a planned feature, so a preview draws it as example data whatever the plan", () => {
    const layout = arrangeDashboard(widgets("BUSINESS", FREE), true);
    expect(keys(layout.metrics)).toEqual(["visitors", "page-views", "enquiries"]);
    expect(layout.tracking).toEqual([]);
    expect(STORE_AREAS.analytics.availability).toBe("planned");
  });

  it("gives a designer's single module the main column's width", () => {
    const layout = arrangeDashboard(widgets("PUBLISHING", PAID, "DESIGNER"), true);
    expect(layout.underMain?.key).toBe("authors");
    expect(layout.modules).toEqual([]);
  });
});

describe("trackingGroups", () => {
  it("groups planned figures without a plan lock, whatever the plan (AN-6)", () => {
    const groups = trackingGroups(widgets("ECOMMERCE", FREE));
    expect(groups).toEqual([
      { area: "analytics", label: "Analytics", metrics: ["Conversion"], lockedBy: null },
    ]);
  });

  it("ignores live widgets", () => {
    expect(trackingGroups(widgets("PORTFOLIO").filter((w) => w.state.kind === "live"))).toEqual([]);
  });
});
