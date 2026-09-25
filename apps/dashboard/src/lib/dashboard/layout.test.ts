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

describe("arrangeDashboard without data (every real store today)", () => {
  const layout = arrangeDashboard(widgets("ECOMMERCE"), false);

  it("draws no empty frames: only live widgets get a card", () => {
    expect(layout.metrics).toEqual([]);
    expect(keys(layout.main)).toEqual(["setup"]);
    expect(keys(layout.rail)).toEqual(["website-status", "plan-usage", "team"]);
    expect(keys(layout.bands)).toEqual(["focus"]);
  });

  it("gives the live catalogue modules their own row beside recent activity", () => {
    expect(keys(layout.modules)).toEqual(["catalogue", "stock-alerts", "activity"]);
    expect(layout.underMain).toBeNull();
  });

  it("puts a lone secondary module under the main column, not in a row of its own", () => {
    const business = arrangeDashboard(widgets("BUSINESS"), false);
    expect(business.underMain?.key).toBe("activity");
    expect(business.modules).toEqual([]);
  });

  it("summarises the rest by the store area their data starts with, soonest first", () => {
    expect(layout.tracking.map((g) => [g.area, g.metrics])).toEqual([
      ["orders", ["Revenue", "Orders", "Sales", "Top products"]],
      ["customers", ["Customers"]],
      ["analytics", ["Conversion"]],
    ]);
    expect(layout.tracking[0]?.availability).toBe(STORE_AREAS.orders.availability);
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

  it("still summarises plan-locked widgets, with no data, after the rest", () => {
    const layout = arrangeDashboard(widgets("BUSINESS", FREE), true);
    expect(keys(layout.metrics)).toEqual(["enquiries"]);
    expect(layout.tracking).toEqual([
      {
        area: "analytics",
        label: STORE_AREAS.analytics.label,
        availability: STORE_AREAS.analytics.availability,
        metrics: ["Visitors", "Page views", "Top pages"],
        lockedBy: "analytics",
      },
    ]);
  });

  it("gives a designer's single module the main column's width", () => {
    const layout = arrangeDashboard(widgets("PUBLISHING", PAID, "DESIGNER"), true);
    expect(layout.underMain?.key).toBe("authors");
    expect(layout.modules).toEqual([]);
  });
});

describe("trackingGroups", () => {
  it("keeps a locked area apart from the same area's unlocked figures", () => {
    const groups = trackingGroups(widgets("ECOMMERCE", FREE));
    const analytics = groups.filter((g) => g.area === "analytics");
    expect(analytics).toHaveLength(1);
    expect(analytics[0]?.lockedBy).toBe("analytics");
    expect(groups.at(-1)?.lockedBy).toBe("analytics");
  });

  it("ignores live widgets", () => {
    expect(trackingGroups(widgets("PORTFOLIO").filter((w) => w.state.kind === "live"))).toEqual([]);
  });
});
