// What Storevia does today and what comes next, in one place. Every status
// on the site comes from here or from the platform's own sources (plan
// features: @storevia/entitlements/availability; store areas and business
// types: @storevia/tenancy/business-types), so the site can't claim more, or
// less, than the product delivers. Tests fail when a status here disagrees
// with those sources. Update a status in the same change that ships the
// capability. Nothing here carries a date or an internal milestone.
import type { Availability } from "@storevia/entitlements/availability";
import { MEMBER_ROLES } from "@storevia/tenancy/rbac";
import type { GlyphName } from "@storevia/ui/icons";

export type Status = "available" | "in-development" | "roadmap" | "future";

/** Every status, most ready first (legends, filters and groupings use this order). */
export const STATUSES: readonly Status[] = ["available", "in-development", "roadmap", "future"];

export const STATUS_LABELS: Record<Status, string> = {
  available: "Available now",
  // "In development" ("being built now") would overclaim work that is
  // designed and scheduled but not started.
  "in-development": "Up next",
  roadmap: "On the roadmap",
  future: "Future",
};

/** What each status promises, in one line (the legends on /products and /features). */
export const STATUS_DESCRIPTIONS: Record<Status, string> = {
  available: "Built, tested and ready to use in your dashboard today.",
  "in-development": "Designed and scheduled to be built next.",
  roadmap: "Planned, but not built yet. We don't give dates.",
  future: "A direction we're exploring, with no date and no promise.",
};

/**
 * The site's status for something the platform marks available or planned:
 * planned work is "On the roadmap" (the site never promises a date).
 */
export function statusOf(availability: Availability): Status {
  return availability === "available" ? "available" : "roadmap";
}

export interface Capability {
  readonly id: string;
  readonly title: string;
  readonly glyph: GlyphName;
  readonly summary: string;
  readonly status: Status;
  /** Concrete, truthful points; present tense only where available. */
  readonly points: readonly string[];
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "organisations",
    title: "Organisations and stores",
    glyph: "online-store",
    status: "available",
    summary: "Run several online stores from one account, each with its own address and team.",
    points: [
      "One organisation, many stores, one plan",
      "Each store has its own web address, live when you choose",
      "Each store set up for selling: orders, products and customers first",
    ],
  },
  {
    id: "teams",
    title: "Teams and roles",
    glyph: "teams",
    status: "available",
    summary: "Invite your team and give everyone exactly the access they need.",
    points: [
      `${String(MEMBER_ROLES.length)} standard roles, each mapped to precise permissions`,
      "Suspend access, remove members or transfer ownership",
      "Password confirmation before sensitive changes, and an audit log of changes",
    ],
  },
  {
    id: "administration",
    title: "Responsive administration",
    glyph: "business-website",
    status: "available",
    summary: "A dashboard designed separately for desktop, tablet and phone.",
    points: [
      "A full sidebar on desktop, a touch-friendly rail on tablet",
      "App-style navigation on your phone, with no squeezed tables",
      "Keyboard command menu to jump anywhere",
    ],
  },
  {
    id: "commerce",
    title: "Catalogue, checkout and orders",
    glyph: "commerce",
    status: "available",
    summary: "Products and stock, a secure checkout, and the orders that follow.",
    points: [
      "Products with options, variants, collections and stock by location",
      "Checkout with shipping, tax and discount codes, paid on Razorpay's secure page",
      "Orders with fulfilment, shipment tracking, refunds and cancellation, and emails to your customers",
      "A notification for your order team on every new order, linking straight to it",
      "Search, bulk editing and CSV export",
    ],
  },
  {
    id: "builder",
    title: "Website builder",
    glyph: "builder",
    status: "available",
    summary: "Design pages visually, with responsive previews and safe publishing.",
    points: [
      "Ready-made sections you add, reorder and edit, with desktop, tablet and phone previews",
      "Autosaved drafts, a private preview and publishing when you're ready",
      "Header and footer menus, content pages, and search titles and descriptions",
    ],
  },
  {
    id: "content",
    title: "Content and blogging",
    glyph: "content",
    status: "roadmap",
    summary: "Posts, categories and authors for publishers and businesses.",
    points: [
      "Writing and editing workflows with authors and editors",
      "Categories readers can browse",
      "Roles for authors, editors and content managers are already in place",
    ],
  },
  {
    id: "customers",
    title: "Customers",
    glyph: "orders",
    status: "available",
    summary: "A record for every customer who orders, with their order history.",
    points: [
      "One record per customer, matched by email",
      "Order history, notes and tags for your team",
      "Roles that can see customer details, and roles that can't",
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    glyph: "analytics",
    status: "roadmap",
    summary:
      "Storefront traffic, conversion and reports are planned. Each store's home already shows its sales.",
    points: [
      "Available now: sales, orders, new customers, a sales trend and top products on each store's home",
      "Planned: storefront visitors, conversion and a reports area",
    ],
  },
  {
    id: "domains",
    title: "Domains",
    glyph: "domains",
    status: "available",
    summary: "Connect your own domain, with verification and automatic HTTPS.",
    points: [
      "Domain verification with clear DNS instructions",
      "HTTPS certificates issued and renewed automatically",
    ],
  },
  {
    id: "themes",
    title: "Themes",
    glyph: "themes",
    status: "available",
    summary: "Start from a first-party theme and make it yours.",
    points: [
      "Two themes, each with ready-made presets",
      "Customise colours, type and layout, and preview before you publish",
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    glyph: "integrations",
    status: "roadmap",
    summary: "An API and webhooks so your own tools can work with your store.",
    points: ["An API for your catalogue", "Webhooks that tell your systems when something changes"],
  },
  {
    id: "retail",
    title: "In-person retail",
    glyph: "retail",
    status: "future",
    summary:
      "A future connection to point-of-sale for shops that also sell in person. Not part of Storevia today.",
    points: [],
  },
];

export function capability(id: string): Capability {
  const found = CAPABILITIES.find((c) => c.id === id);
  if (!found) throw new Error(`unknown capability ${id}`);
  return found;
}
