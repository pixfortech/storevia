// What Storevia does today and what is being built, in one place. Every status
// on the site comes from here, so the site can't claim more than the product
// delivers. Update a status in the same change that ships the capability.
import { MEMBER_ROLES } from "@storevia/tenancy/rbac";
import type { GlyphName } from "@storevia/ui";

export type Status = "available" | "in-development" | "roadmap" | "future";

export const STATUS_LABELS: Record<Status, string> = {
  available: "Available now",
  "in-development": "In development",
  roadmap: "On the roadmap",
  future: "Future",
};

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
    id: "teams",
    title: "Teams and roles",
    glyph: "teams",
    status: "available",
    summary: "Invite your team and give everyone exactly the access they need.",
    points: [
      `${String(MEMBER_ROLES.length)} roles, from owner to author, each mapped to precise permissions`,
      "Role suggestions that match your business type",
      "Access to selected stores only, suspensions and ownership transfer",
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
  },
  {
    id: "domains",
    title: "Domains",
    glyph: "domains",
    status: "roadmap",
    summary: "Connect your own domain with verification and automatic HTTPS.",
    points: ["Domain verification with clear DNS instructions", "Automatic certificates"],
  },
  {
    id: "themes",
    title: "Themes",
    glyph: "themes",
    status: "roadmap",
    summary: "Start from a first-party theme and make it yours.",
    points: ["Customise colours, type and layout", "Preview before you publish"],
  },
  {
    id: "analytics",
    title: "Analytics",
    glyph: "analytics",
    status: "roadmap",
    summary: "Traffic, engagement and sales reports, with history set by your plan.",
    points: ["Plans already define how much history you keep"],
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
