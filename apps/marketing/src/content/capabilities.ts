// What Storevia does today and what comes next, in one place. Every status
// on the site comes from here, so the site can't claim more than the product
// delivers. Update a status in the same change that ships the capability.
import { STORE_AREAS } from "@storevia/tenancy/business-types";
import { MEMBER_ROLES } from "@storevia/tenancy/rbac";
import type { GlyphName } from "@storevia/ui/icons";

export type Status = "available" | "in-development" | "roadmap" | "future";

/** Every status, most ready first (legends, filters and groupings use this order). */
export const STATUSES: readonly Status[] = ["available", "in-development", "roadmap", "future"];

export const STATUS_LABELS: Record<Status, string> = {
  available: "Available now",
  // Commerce is designed and scheduled but not started, so "In development"
  // ("being built now") would overclaim.
  "in-development": "Up next",
  roadmap: "On the roadmap",
  future: "Future",
};

/** What each status promises, in one line (the legends on /products and /features). */
export const STATUS_DESCRIPTIONS: Record<Status, string> = {
  available: "Built, tested and ready to use in your dashboard today.",
  "in-development": "Designed and scheduled as the next milestone to be built.",
  roadmap: "Planned and designed into the platform, but not built yet.",
  future: "A direction we're exploring, with no date and no promise.",
};

export interface Capability {
  readonly id: string;
  readonly title: string;
  readonly glyph: GlyphName;
  readonly summary: string;
  readonly status: Status;
  /** Concrete, truthful points; present tense only where available. */
  readonly points: readonly string[];
  /**
   * When an unfinished capability is planned ("Milestone 3", "a later
   * release"), from the public roadmap. Store areas take it from the domain's
   * own availability, so the dashboard and the site agree.
   */
  readonly milestone?: string | undefined;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "organisations",
    title: "Organisations and stores",
    glyph: "online-store",
    status: "available",
    summary: "Run several sites from one account, each with its own address and team access.",
    points: [
      "One organisation, many stores, one plan",
      "Each store reserves its own web address, ready for when storefronts launch",
      "Each store set up for what it is: shop, business site, publication or portfolio",
    ],
  },
  {
    id: "teams",
    title: "Teams and roles",
    glyph: "teams",
    status: "available",
    summary: "Invite your team and give everyone exactly the access they need.",
    points: [
      `${String(MEMBER_ROLES.length)} roles, from owner to author, each mapped to precise permissions`,
      "Role suggestions that match your business type",
      "Suspend access, remove members or transfer ownership",
      "Password confirmation before sensitive changes",
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
    title: "Commerce",
    glyph: "commerce",
    status: "in-development",
    summary: "Products, variants, inventory and a media library, then checkout and orders.",
    points: [
      "Products with options, variants and collections",
      "Inventory by location with a full movement history",
      "Checkout, payments, orders, refunds and fulfilment follow",
    ],
    milestone: STORE_AREAS.products.availability,
  },
  {
    id: "builder",
    title: "Website builder",
    glyph: "builder",
    status: "roadmap",
    summary: "Design pages visually, with responsive previews and safe publishing.",
    points: [
      "Drag-and-drop sections with desktop, tablet and mobile editing",
      "Drafts, autosave, publish and restore",
      "Navigation menus and reusable components",
    ],
    milestone: STORE_AREAS.website.availability,
  },
  {
    id: "content",
    title: "Content and blogging",
    glyph: "content",
    status: "roadmap",
    summary: "Pages, posts, categories and authors for publishers and businesses.",
    points: [
      "Writing and editing workflows with authors and editors",
      "Categories readers can browse",
      "Roles for authors, editors and content managers are already in place",
    ],
    milestone: STORE_AREAS.posts.availability,
  },
  {
    id: "customers",
    title: "Customers",
    glyph: "orders",
    status: "roadmap",
    summary: "Customer records, addresses and order history, arriving with checkout.",
    points: [
      "A record for every customer, with their addresses and orders",
      "Roles that can see customer details, and roles that can't",
      "Arrives with checkout and orders",
    ],
    milestone: STORE_AREAS.customers.availability,
  },
  {
    id: "analytics",
    title: "Analytics",
    glyph: "analytics",
    status: "roadmap",
    summary: "Traffic, engagement and sales reports, with history set by your plan.",
    points: ["Plans already define how much history you keep"],
    milestone: STORE_AREAS.analytics.availability,
  },
  {
    id: "domains",
    title: "Domains",
    glyph: "domains",
    status: "roadmap",
    summary: "Connect your own domain with verification and automatic HTTPS.",
    points: ["Domain verification with clear DNS instructions", "Automatic certificates"],
    milestone: "Milestone 7",
  },
  {
    id: "themes",
    title: "Themes",
    glyph: "themes",
    status: "roadmap",
    summary: "Start from a first-party theme and make it yours.",
    points: ["Customise colours, type and layout", "Preview before you publish"],
    milestone: "Milestone 7",
  },
  {
    id: "integrations",
    title: "Integrations",
    glyph: "integrations",
    status: "roadmap",
    summary: "An API and webhooks so your own tools can work with your store.",
    // No single milestone: API access comes with the catalogue, webhooks and
    // export later. /products lists each part with its status from features.ts.
    points: [
      "An API for your catalogue, arriving with it",
      "Webhooks that tell your systems when something changes",
      "Export your data whenever you need it",
    ],
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

/** "Coming in Milestone 3", "Coming in a later release". */
export function comingLabel(milestone: string): string {
  return `Coming in ${milestone}`;
}
