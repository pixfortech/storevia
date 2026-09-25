import type { FeatureKey } from "@storevia/entitlements/features";
import { BUSINESS_TYPES, STORE_AREAS } from "@storevia/tenancy/business-types";
import { permissionsFor, type Permission } from "@storevia/tenancy/rbac";
import { describe, expect, it } from "vitest";
import {
  composeDashboard,
  focusAreas,
  hasPeriodData,
  widgetDisplay,
  type ComposedWidget,
} from "./compose";
import { DASHBOARD_LAYOUTS, DASHBOARD_WIDGETS, WIDGET_KEYS } from "./widgets";

const OWNER = permissionsFor("OWNER");
const PAID: ReadonlySet<FeatureKey> = new Set<FeatureKey>(["analytics", "visual_builder"]);
const FREE: ReadonlySet<FeatureKey> = new Set<FeatureKey>();

const keys = (widgets: readonly ComposedWidget[]) => widgets.map((w) => w.key);
const bySize = (widgets: readonly ComposedWidget[], size: ComposedWidget["size"]) =>
  keys(widgets.filter((w) => w.size === size));
const find = (widgets: readonly ComposedWidget[], key: string) => {
  const widget = widgets.find((w) => w.key === key);
  if (!widget) throw new Error(`no ${key}`);
  return widget;
};

describe("the widget registry", () => {
  it("lists every widget once, under its own key", () => {
    expect(Object.keys(DASHBOARD_WIDGETS).sort()).toEqual([...WIDGET_KEYS].sort());
    for (const [key, widget] of Object.entries(DASHBOARD_WIDGETS)) expect(widget.key).toBe(key);
  });

  it("only lays out widgets that suit the business type, each once", () => {
    for (const type of BUSINESS_TYPES) {
      const layout = DASHBOARD_LAYOUTS[type];
      expect(new Set(layout).size).toBe(layout.length);
      for (const key of layout) expect(DASHBOARD_WIDGETS[key].businessTypes).toContain(type);
    }
  });

  it("takes every upcoming widget's schedule from a store area that hasn't shipped", () => {
    for (const widget of Object.values(DASHBOARD_WIDGETS)) {
      if (widget.source.kind !== "upcoming") continue;
      // When an area ships, its widgets must be wired to real data.
      expect(STORE_AREAS[widget.source.area].availability, widget.key).toBeDefined();
    }
  });
});

describe("composeDashboard: business type decides presentation", () => {
  const compose = (type: (typeof BUSINESS_TYPES)[number]) =>
    composeDashboard({ businessType: type, permissions: OWNER, grantedFeatures: PAID }).widgets;

  it("gives an online store commerce performance", () => {
    const widgets = compose("ECOMMERCE");
    expect(bySize(widgets, "kpi")).toEqual(["revenue", "orders", "conversion", "customers"]);
    expect(bySize(widgets, "main")).toEqual(["sales-trend", "setup"]);
    expect(bySize(widgets, "rail")).toEqual(["website-status", "plan-usage", "team"]);
    expect(bySize(widgets, "half")).toEqual(["top-products", "stock-alerts", "activity"]);
  });

  it("gives a business website site performance", () => {
    const widgets = compose("BUSINESS");
    expect(bySize(widgets, "kpi")).toEqual(["visitors", "page-views", "enquiries"]);
    expect(find(widgets, "top-content").title).toBe("Top pages");
    expect(keys(widgets)).toContain("content-updates");
    expect(keys(widgets)).not.toContain("revenue");
  });

  it("gives a publication content performance, in its own words", () => {
    const widgets = compose("PUBLISHING");
    expect(bySize(widgets, "kpi")).toEqual(["visitors", "page-views", "posts-published"]);
    expect(find(widgets, "visitors").title).toBe("Readers");
    expect(find(widgets, "traffic-trend").title).toBe("Readers");
    expect(find(widgets, "top-content").title).toBe("Top posts");
    expect(bySize(widgets, "half")).toEqual([
      "top-content",
      "traffic-sources",
      "authors",
      "activity",
    ]);
  });

  it("gives a portfolio project performance", () => {
    const widgets = compose("PORTFOLIO");
    expect(bySize(widgets, "kpi")).toEqual(["visitors", "project-views", "enquiries"]);
    expect(find(widgets, "traffic-trend").title).toBe("Traffic");
    expect(find(widgets, "top-content").title).toBe("Popular projects");
    expect(find(widgets, "focus").title).toBe("Built around your portfolio");
    expect(keys(widgets)).toContain("portfolio-updates");
  });

  it("shares the live widgets across every type", () => {
    for (const type of BUSINESS_TYPES) {
      expect(keys(compose(type))).toEqual(
        expect.arrayContaining([
          "setup",
          "website-status",
          "plan-usage",
          "team",
          "activity",
          "focus",
        ]),
      );
    }
  });
});

describe("composeDashboard: RBAC decides visibility", () => {
  const withPermissions = (permissions: readonly Permission[]) =>
    keys(
      composeDashboard({
        businessType: "ECOMMERCE",
        permissions: new Set(permissions),
        grantedFeatures: PAID,
      }).widgets,
    );

  it("hides plan usage without billing.read and activity without audit.read", () => {
    const widgets = withPermissions(["store.read", "member.read"]);
    expect(widgets).not.toContain("plan-usage");
    expect(widgets).not.toContain("activity");
    expect(widgets).toContain("team");
  });

  it("hides the team without member.read and order data without order.read", () => {
    const widgets = withPermissions(["store.read", "billing.read", "audit.read"]);
    expect(widgets).not.toContain("team");
    for (const key of ["revenue", "orders", "sales-trend", "top-products"]) {
      expect(widgets).not.toContain(key);
    }
    expect(widgets).toEqual(expect.arrayContaining(["plan-usage", "activity"]));
  });

  it("shows a designer only what their role can read", () => {
    const designer = keys(
      composeDashboard({
        businessType: "ECOMMERCE",
        permissions: permissionsFor("DESIGNER"),
        grantedFeatures: PAID,
      }).widgets,
    );
    expect(designer).toEqual(["setup", "website-status", "stock-alerts", "focus"]);
  });

  it("never lets a plan reveal a widget the role can't read", () => {
    const viewer = composeDashboard({
      businessType: "ECOMMERCE",
      permissions: permissionsFor("VIEWER"),
      grantedFeatures: new Set<FeatureKey>(["analytics", "discounts", "api_access"]),
    }).widgets;
    expect(keys(viewer)).not.toContain("revenue");
    expect(keys(viewer)).toContain("conversion");
  });
});

describe("composeDashboard: entitlements decide commercial access", () => {
  it("locks plan features without hiding them, and never locks what needs no feature", () => {
    const widgets = composeDashboard({
      businessType: "BUSINESS",
      permissions: OWNER,
      grantedFeatures: FREE,
    }).widgets;
    expect(find(widgets, "visitors").state).toEqual({ kind: "locked", feature: "analytics" });
    expect(find(widgets, "traffic-trend").state.kind).toBe("locked");
    expect(find(widgets, "enquiries").state.kind).toBe("upcoming");
    expect(find(widgets, "plan-usage").state.kind).toBe("live");
  });

  it("marks upcoming widgets with the store area and milestone they arrive with", () => {
    const widgets = composeDashboard({
      businessType: "ECOMMERCE",
      permissions: OWNER,
      grantedFeatures: PAID,
    }).widgets;
    const revenue = find(widgets, "revenue").state;
    expect(revenue).toMatchObject({ kind: "upcoming", area: "orders", visual: "metric" });
    if (revenue.kind !== "upcoming") throw new Error("expected upcoming");
    expect(revenue.availability).toBe(STORE_AREAS.orders.availability);
    expect(revenue.areaLabel).toBe("Orders");
    expect(find(widgets, "stock-alerts").state).toMatchObject({
      area: "inventory",
      visual: "list",
    });
  });
});

describe("composeDashboard: preferences", () => {
  const base = { businessType: "ECOMMERCE" as const, permissions: OWNER, grantedFeatures: PAID };

  it("hides the widgets a member hid", () => {
    const widgets = keys(
      composeDashboard({ ...base, preferences: { hidden: ["team", "orders"] } }).widgets,
    );
    expect(widgets).not.toContain("team");
    expect(widgets).not.toContain("orders");
    expect(widgets).toContain("revenue");
  });

  it("reorders only the named widgets, within the slots they held", () => {
    const widgets = composeDashboard({
      ...base,
      preferences: { order: ["team", "website-status"] },
    }).widgets;
    expect(bySize(widgets, "rail")).toEqual(["team", "plan-usage", "website-status"]);
    expect(bySize(widgets, "kpi")).toEqual(["revenue", "orders", "conversion", "customers"]);
  });

  it("can't show a widget RBAC hides, or add one the layout lacks", () => {
    const widgets = keys(
      composeDashboard({
        ...base,
        permissions: permissionsFor("DESIGNER"),
        preferences: { order: ["plan-usage", "authors"] },
      }).widgets,
    );
    expect(widgets).not.toContain("plan-usage");
    expect(widgets).not.toContain("authors");
  });

  it("defaults to comfortable density and honours compact", () => {
    expect(composeDashboard(base).density).toBe("comfortable");
    expect(composeDashboard({ ...base, preferences: { density: "compact" } }).density).toBe(
      "compact",
    );
  });
});

describe("widgetDisplay and the period control", () => {
  const compose = (granted: ReadonlySet<FeatureKey>) =>
    composeDashboard({ businessType: "PUBLISHING", permissions: OWNER, grantedFeatures: granted })
      .widgets;

  it("shows honest empty frames in production and example data only in a preview", () => {
    const readers = find(compose(PAID), "traffic-trend");
    expect(widgetDisplay(readers, false)).toBe("empty");
    expect(widgetDisplay(readers, true)).toBe("example");
    expect(widgetDisplay(find(compose(PAID), "activity"), true)).toBe("live");
  });

  it("never shows data, even example data, in a locked widget", () => {
    expect(widgetDisplay(find(compose(FREE), "traffic-trend"), true)).toBe("locked");
  });

  it("offers the period control only when a time-based widget has data", () => {
    expect(hasPeriodData(compose(PAID), false)).toBe(false);
    expect(hasPeriodData(compose(PAID), true)).toBe(true);
    // A designer on an online store sees only stock alerts (a list): nothing to scope.
    const designer = composeDashboard({
      businessType: "ECOMMERCE",
      permissions: permissionsFor("DESIGNER"),
      grantedFeatures: PAID,
    }).widgets;
    expect(hasPeriodData(designer, true)).toBe(false);
  });
});

describe("focusAreas", () => {
  it("lists the type's focus areas the member may open, marking plan locks", () => {
    const areas = focusAreas("ECOMMERCE", OWNER, FREE);
    expect(areas.map((a) => a.area.key)).toEqual(["products", "website", "orders"]);
    expect(areas.find((a) => a.area.key === "website")?.locked).toBe(true);
    expect(areas.find((a) => a.area.key === "products")?.locked).toBe(false);
    expect(
      focusAreas("ECOMMERCE", permissionsFor("DESIGNER"), PAID).map((a) => a.area.key),
    ).toEqual(["products", "website"]);
  });
});
