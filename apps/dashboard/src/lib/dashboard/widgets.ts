// The store home's widget registry (design plan §9, brief §10–12). Pure data,
// client-safe: each widget says what it shows, where it sits, which business
// types it suits, who may see it (RBAC), which plan feature it needs and
// where its data comes from. composeDashboard() turns the registry and a
// business type's layout into the page's widgets.
import type { FeatureKey } from "@storevia/entitlements/features";
import type { AreaKey, BusinessType } from "@storevia/tenancy/business-types";
import type { Permission } from "@storevia/tenancy/rbac";

export const WIDGET_KEYS = [
  // KPI row
  "revenue",
  "orders",
  "conversion",
  "customers",
  "visitors",
  "page-views",
  "project-views",
  "enquiries",
  "posts-published",
  // Main column
  "sales-trend",
  "traffic-trend",
  "setup",
  // Rail
  "website-status",
  "plan-usage",
  "team",
  // Secondary modules
  "activity",
  "top-products",
  "stock-alerts",
  "top-content",
  "traffic-sources",
  "content-updates",
  "portfolio-updates",
  "authors",
  // Closing band
  "focus",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

/**
 * Where a widget sits on desktop: a tile in the KPI row, the 8-column main
 * column (the primary chart first), the 4-column rail beside it, a
 * secondary module in the row below, or a full-width band at the end.
 * Tablet and phone layouts stack the same groups (see DashboardGrid).
 */
export type WidgetSize = "kpi" | "main" | "rail" | "half" | "full";

/** How an upcoming widget draws its data once it has some (and in previews). */
export type UpcomingVisual = "metric" | "trend" | "ranking" | "share" | "list";

export type WidgetSource =
  /** The data exists today; the widget has its own component. */
  | { readonly kind: "live" }
  /**
   * The domain isn't built yet. It starts collecting when the store area
   * ships; the milestone is read from STORE_AREAS, never repeated here.
   */
  | { readonly kind: "upcoming"; readonly area: AreaKey; readonly visual: UpcomingVisual };

export interface WidgetCopy {
  readonly title: string;
  /** One line under the title: what the widget shows. */
  readonly description: string;
}

export interface WidgetDefinition extends WidgetCopy {
  readonly key: WidgetKey;
  readonly size: WidgetSize;
  /** Business types the widget suits (presentation only). */
  readonly businessTypes: readonly BusinessType[];
  /** Members without it never see the widget (RBAC). */
  readonly permission: Permission;
  /** Plan feature that unlocks it; without it the widget is shown locked, with no data. */
  readonly feature?: FeatureKey;
  readonly source: WidgetSource;
  /** Per-type wording for the same data (e.g. visitors are "Readers" on a publication). */
  readonly presentation?: Partial<Record<BusinessType, Partial<WidgetCopy>>>;
}

const ALL: readonly BusinessType[] = ["ECOMMERCE", "BUSINESS", "PUBLISHING", "PORTFOLIO"];
const SITES: readonly BusinessType[] = ["BUSINESS", "PUBLISHING", "PORTFOLIO"];

const upcoming = (area: AreaKey, visual: UpcomingVisual): WidgetSource => ({
  kind: "upcoming",
  area,
  visual,
});
const LIVE: WidgetSource = { kind: "live" };

export const DASHBOARD_WIDGETS: Readonly<Record<WidgetKey, WidgetDefinition>> = {
  revenue: {
    key: "revenue",
    title: "Revenue",
    description: "Sales from paid orders.",
    size: "kpi",
    businessTypes: ["ECOMMERCE"],
    permission: "order.read",
    source: upcoming("orders", "metric"),
  },
  orders: {
    key: "orders",
    title: "Orders",
    description: "Orders placed on your storefront.",
    size: "kpi",
    businessTypes: ["ECOMMERCE"],
    permission: "order.read",
    source: upcoming("orders", "metric"),
  },
  conversion: {
    key: "conversion",
    title: "Conversion",
    description: "Visits that end in an order.",
    size: "kpi",
    businessTypes: ["ECOMMERCE"],
    permission: "analytics.read",
    feature: "analytics",
    source: upcoming("analytics", "metric"),
  },
  customers: {
    key: "customers",
    title: "Customers",
    description: "Customers placing their first order.",
    size: "kpi",
    businessTypes: ["ECOMMERCE"],
    permission: "customer.read",
    source: upcoming("customers", "metric"),
  },
  visitors: {
    key: "visitors",
    title: "Visitors",
    description: "People who visited your site.",
    size: "kpi",
    businessTypes: SITES,
    permission: "analytics.read",
    feature: "analytics",
    source: upcoming("analytics", "metric"),
    presentation: { PUBLISHING: { title: "Readers", description: "People who read your posts." } },
  },
  "page-views": {
    key: "page-views",
    title: "Page views",
    description: "Pages viewed across your site.",
    size: "kpi",
    businessTypes: ["BUSINESS", "PUBLISHING"],
    permission: "analytics.read",
    feature: "analytics",
    source: upcoming("analytics", "metric"),
  },
  "project-views": {
    key: "project-views",
    title: "Project views",
    description: "Views of your project pages.",
    size: "kpi",
    businessTypes: ["PORTFOLIO"],
    permission: "analytics.read",
    feature: "analytics",
    source: upcoming("analytics", "metric"),
  },
  // Enquiries carry visitors' contact details, so only members who may read
  // customer details see them. Forms arrive with the page builder.
  enquiries: {
    key: "enquiries",
    title: "Enquiries",
    description: "Messages sent through your site's forms.",
    size: "kpi",
    businessTypes: ["BUSINESS", "PORTFOLIO"],
    permission: "customer.read",
    source: upcoming("pages", "metric"),
  },
  "posts-published": {
    key: "posts-published",
    title: "Posts published",
    description: "New posts that went live.",
    size: "kpi",
    businessTypes: ["PUBLISHING"],
    permission: "design.edit",
    source: upcoming("posts", "metric"),
  },
  "sales-trend": {
    key: "sales-trend",
    title: "Sales",
    description: "Revenue by day, against the period before.",
    size: "main",
    businessTypes: ["ECOMMERCE"],
    permission: "order.read",
    source: upcoming("orders", "trend"),
  },
  "traffic-trend": {
    key: "traffic-trend",
    title: "Visitors",
    description: "Visitors by day, against the period before.",
    size: "main",
    businessTypes: SITES,
    permission: "analytics.read",
    feature: "analytics",
    source: upcoming("analytics", "trend"),
    presentation: {
      PUBLISHING: {
        title: "Readers",
        description: "Readers by day, against the period before.",
      },
      PORTFOLIO: { title: "Traffic" },
    },
  },
  setup: {
    key: "setup",
    title: "Get set up",
    description: "The steps you can take today.",
    size: "main",
    businessTypes: ALL,
    permission: "store.read",
    source: LIVE,
  },
  "website-status": {
    key: "website-status",
    title: "Website",
    description: "Your web address and when it goes live.",
    size: "rail",
    businessTypes: ALL,
    permission: "store.read",
    source: LIVE,
  },
  "plan-usage": {
    key: "plan-usage",
    title: "Plan usage",
    description: "Shared by every store in your organisation.",
    size: "rail",
    businessTypes: ALL,
    permission: "billing.read",
    source: LIVE,
  },
  team: {
    key: "team",
    title: "Team",
    description: "Who works on your organisation.",
    size: "rail",
    businessTypes: ALL,
    permission: "member.read",
    source: LIVE,
  },
  // The audit log is the only activity source today; it needs audit.read.
  activity: {
    key: "activity",
    title: "Recent activity",
    description: "Changes to this store and your organisation.",
    size: "half",
    businessTypes: ALL,
    permission: "audit.read",
    source: LIVE,
  },
  "top-products": {
    key: "top-products",
    title: "Top products",
    description: "Best sellers by revenue.",
    size: "half",
    businessTypes: ["ECOMMERCE"],
    permission: "order.read",
    source: upcoming("orders", "ranking"),
  },
  "stock-alerts": {
    key: "stock-alerts",
    title: "Stock to watch",
    description: "Products running low or out of stock.",
    size: "half",
    businessTypes: ["ECOMMERCE"],
    permission: "inventory.read",
    source: upcoming("inventory", "list"),
  },
  "top-content": {
    key: "top-content",
    title: "Top pages",
    description: "Your most viewed pages.",
    size: "half",
    businessTypes: SITES,
    permission: "analytics.read",
    feature: "analytics",
    source: upcoming("analytics", "ranking"),
    presentation: {
      PUBLISHING: { title: "Top posts", description: "Your most read posts." },
      PORTFOLIO: { title: "Popular projects", description: "Your most viewed projects." },
    },
  },
  "traffic-sources": {
    key: "traffic-sources",
    title: "Traffic sources",
    description: "Where your visitors come from.",
    size: "half",
    businessTypes: SITES,
    permission: "analytics.read",
    feature: "analytics",
    source: upcoming("analytics", "share"),
    presentation: { PUBLISHING: { description: "Where your readers come from." } },
  },
  "content-updates": {
    key: "content-updates",
    title: "Content updates",
    description: "Pages edited and published most recently.",
    size: "half",
    businessTypes: ["BUSINESS"],
    permission: "design.edit",
    source: upcoming("pages", "list"),
  },
  "portfolio-updates": {
    key: "portfolio-updates",
    title: "Portfolio updates",
    description: "Projects added and edited most recently.",
    size: "half",
    businessTypes: ["PORTFOLIO"],
    permission: "design.edit",
    source: upcoming("projects", "list"),
  },
  authors: {
    key: "authors",
    title: "Authors",
    description: "Who is writing, and how much.",
    size: "half",
    businessTypes: ["PUBLISHING"],
    permission: "design.edit",
    source: upcoming("authors", "list"),
  },
  focus: {
    key: "focus",
    title: "Built around your store",
    description: "What's coming first for your business type, and when.",
    size: "full",
    businessTypes: ALL,
    permission: "store.read",
    source: LIVE,
    presentation: {
      ECOMMERCE: { title: "Built around your online store" },
      BUSINESS: { title: "Built around your business website" },
      PUBLISHING: { title: "Built around your publication" },
      PORTFOLIO: { title: "Built around your portfolio" },
    },
  },
};

/**
 * Each business type's home, in order. Business type decides presentation
 * only: composeDashboard() still filters by permission and plan.
 */
export const DASHBOARD_LAYOUTS: Readonly<Record<BusinessType, readonly WidgetKey[]>> = {
  // Commerce performance.
  ECOMMERCE: [
    "revenue",
    "orders",
    "conversion",
    "customers",
    "sales-trend",
    "setup",
    "website-status",
    "plan-usage",
    "team",
    "top-products",
    "stock-alerts",
    "activity",
    "focus",
  ],
  // Site performance.
  BUSINESS: [
    "visitors",
    "page-views",
    "enquiries",
    "traffic-trend",
    "setup",
    "website-status",
    "plan-usage",
    "team",
    "top-content",
    "content-updates",
    "activity",
    "focus",
  ],
  // Content performance.
  PUBLISHING: [
    "visitors",
    "page-views",
    "posts-published",
    "traffic-trend",
    "setup",
    "website-status",
    "plan-usage",
    "team",
    "top-content",
    "traffic-sources",
    "authors",
    "activity",
    "focus",
  ],
  // Creative and project performance.
  PORTFOLIO: [
    "visitors",
    "project-views",
    "enquiries",
    "traffic-trend",
    "setup",
    "website-status",
    "plan-usage",
    "team",
    "top-content",
    "portfolio-updates",
    "activity",
    "focus",
  ],
};
