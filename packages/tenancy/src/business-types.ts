// Business types (ADR-0024). Client-safe data: onboarding copy, navigation
// emphasis, role presets and home emphasis per type.
//
// Business type is PRESENTATION ONLY. It decides what is shown and where; it
// never decides whether a member may act (RBAC) or whether the organisation
// is entitled (plans). The navigation resolver below therefore filters by the
// member's permissions and marks areas the plan doesn't include; it can only
// ever show less than RBAC and the plan allow.
import type { FeatureKey } from "@storevia/entitlements/features";
import type { MemberRole, Permission } from "./rbac";

export const BUSINESS_TYPES = ["ECOMMERCE", "BUSINESS", "PUBLISHING", "PORTFOLIO"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPES as readonly string[]).includes(value);
}

export type AreaKey =
  | "home"
  | "orders"
  | "products"
  | "inventory"
  | "customers"
  | "website"
  | "pages"
  | "posts"
  | "categories"
  | "authors"
  | "projects"
  | "blog"
  | "media"
  | "marketing"
  | "analytics"
  | "settings";

export interface StoreArea {
  readonly key: AreaKey;
  readonly label: string;
  /** Path segment under /s/{store}; "" for the store home. */
  readonly segment: string;
  /** Members without it don't see the area. */
  readonly permission: Permission;
  /** Plan feature that unlocks the area, if any. */
  readonly feature?: FeatureKey;
  /** undefined = available now; otherwise when it ships (shown honestly). */
  readonly availability?: string;
  /** One sentence for the placeholder page and tooltips. */
  readonly description: string;
}

const LATER = "a later release";

/** Every store area, whatever the business type. */
export const STORE_AREAS: Readonly<Record<AreaKey, StoreArea>> = {
  home: {
    key: "home",
    label: "Home",
    segment: "",
    permission: "store.read",
    description: "Your store at a glance.",
  },
  orders: {
    key: "orders",
    label: "Orders",
    segment: "/orders",
    permission: "order.read",
    availability: "Milestone 6",
    description: "Orders placed on your storefront, with payment and fulfilment status.",
  },
  products: {
    key: "products",
    label: "Products",
    segment: "/products",
    permission: "product.read",
    description: "Products with variants, pricing, media and collections.",
  },
  inventory: {
    key: "inventory",
    label: "Inventory",
    segment: "/inventory",
    permission: "inventory.read",
    description: "Stock levels by location, with a full movement history.",
  },
  customers: {
    key: "customers",
    label: "Customers",
    segment: "/customers",
    permission: "customer.read",
    availability: "Milestone 6",
    description: "Your customers, their addresses and order history.",
  },
  website: {
    key: "website",
    label: "Website",
    segment: "/website",
    permission: "design.edit",
    feature: "visual_builder",
    availability: "Milestone 5",
    description: "Design your site with the visual builder, navigation and themes.",
  },
  pages: {
    key: "pages",
    label: "Pages",
    segment: "/pages",
    permission: "design.edit",
    availability: "Milestone 5",
    description: "Pages such as About, Contact and landing pages.",
  },
  posts: {
    key: "posts",
    label: "Posts",
    segment: "/posts",
    permission: "design.edit",
    availability: LATER,
    description: "Articles and stories, from draft to published.",
  },
  categories: {
    key: "categories",
    label: "Categories",
    segment: "/categories",
    permission: "design.edit",
    availability: LATER,
    description: "Organise posts into sections readers can browse.",
  },
  authors: {
    key: "authors",
    label: "Authors",
    segment: "/authors",
    permission: "design.edit",
    availability: LATER,
    description: "Author profiles shown on your posts.",
  },
  projects: {
    key: "projects",
    label: "Projects",
    segment: "/projects",
    permission: "design.edit",
    availability: LATER,
    description: "Showcase your work as projects with images and case studies.",
  },
  blog: {
    key: "blog",
    label: "Blog",
    segment: "/blog",
    permission: "design.edit",
    availability: LATER,
    description: "News and articles alongside your site.",
  },
  media: {
    key: "media",
    label: "Media",
    segment: "/media",
    permission: "media.read",
    description: "Images used across your store: products, collections and branding.",
  },
  marketing: {
    key: "marketing",
    label: "Marketing",
    segment: "/marketing",
    permission: "discount.read",
    feature: "discounts",
    availability: "Milestone 6",
    description: "Discounts and campaigns.",
  },
  analytics: {
    key: "analytics",
    label: "Analytics",
    segment: "/analytics",
    permission: "analytics.read",
    feature: "analytics",
    availability: LATER,
    description: "Traffic, engagement and sales reports.",
  },
  settings: {
    key: "settings",
    label: "Settings",
    segment: "/settings",
    permission: "store.read",
    description: "Store details, address and preferences.",
  },
};

export interface RolePreset {
  readonly label: string;
  readonly role: MemberRole;
  readonly description: string;
}

export interface BusinessTypeDefinition {
  readonly type: BusinessType;
  /** Selector title, e.g. "Online store". */
  readonly label: string;
  /** One-line promise for the selector card. */
  readonly tagline: string;
  /** What Storevia adapts for this type (honest, present-tense only where built). */
  readonly adapts: readonly string[];
  /** Store navigation, in order. */
  readonly navigation: readonly AreaKey[];
  /** Up to three areas for the mobile bottom bar (the rest go under "More"). */
  readonly mobilePrimary: readonly AreaKey[];
  readonly rolePresets: readonly RolePreset[];
  /** Areas the store home highlights first. */
  readonly homeFocus: readonly AreaKey[];
}

const ADMIN_PRESET: RolePreset = {
  label: "Admin",
  role: "ADMIN",
  description: "Everything except billing and ownership.",
};
const VIEWER_PRESET: RolePreset = {
  label: "Viewer",
  role: "VIEWER",
  description: "Read-only access, without customer details.",
};
const DESIGNER_PRESET: RolePreset = {
  label: "Designer",
  role: "DESIGNER",
  description: "Designs and publishes pages, navigation and themes.",
};
const CONTENT_EDITOR_PRESET: RolePreset = {
  label: "Content editor",
  role: "EDITOR",
  description: "Writes and publishes content and manages media.",
};

export const BUSINESS_TYPE_DEFINITIONS: Readonly<Record<BusinessType, BusinessTypeDefinition>> = {
  ECOMMERCE: {
    type: "ECOMMERCE",
    label: "Online store",
    tagline: "Sell products online with a storefront you design.",
    adapts: [
      "Navigation built around orders, products and customers",
      "Team roles for store, order, catalogue and inventory management",
      "A home that starts with your catalogue and storefront",
    ],
    navigation: [
      "home",
      "orders",
      "products",
      "inventory",
      "customers",
      "website",
      "pages",
      "marketing",
      "analytics",
      "settings",
    ],
    mobilePrimary: ["home", "orders", "products"],
    rolePresets: [
      ADMIN_PRESET,
      {
        label: "Store manager",
        role: "STORE_MANAGER",
        description: "Runs the store day to day: catalogue, orders, customers and design.",
      },
      {
        label: "Order manager",
        role: "ORDER_MANAGER",
        description: "Handles orders, refunds and customer records.",
      },
      {
        label: "Catalogue manager",
        role: "CATALOGUE_MANAGER",
        description: "Manages products, collections, media and stock.",
      },
      {
        label: "Inventory manager",
        role: "INVENTORY_MANAGER",
        description: "Adjusts stock levels. Can't change products or orders.",
      },
      DESIGNER_PRESET,
      {
        label: "Marketing",
        role: "MARKETING",
        description: "Runs discounts and campaigns and edits pages for review.",
      },
      {
        label: "Support",
        role: "SUPPORT",
        description: "Views orders and updates customer records.",
      },
      VIEWER_PRESET,
    ],
    homeFocus: ["products", "website", "orders"],
  },
  BUSINESS: {
    type: "BUSINESS",
    label: "Business website",
    tagline: "Present your business with a fast, professional website.",
    adapts: [
      "Navigation built around your website, pages and blog",
      "Team roles for site management and content editing",
      "No commerce areas in your way until you need them",
    ],
    navigation: ["home", "website", "pages", "blog", "media", "analytics", "settings"],
    mobilePrimary: ["home", "website", "pages"],
    rolePresets: [
      ADMIN_PRESET,
      {
        label: "Site manager",
        role: "SITE_MANAGER",
        description: "Manages the website, its settings, content and design.",
      },
      CONTENT_EDITOR_PRESET,
      DESIGNER_PRESET,
      VIEWER_PRESET,
    ],
    homeFocus: ["website", "pages", "blog"],
  },
  PUBLISHING: {
    type: "PUBLISHING",
    label: "Blog or publication",
    tagline: "Publish articles and grow an audience for your writing.",
    adapts: [
      "Navigation built around posts, categories and authors",
      "Team roles for content managers, editors and authors",
      "A home that starts with your writing",
    ],
    navigation: [
      "home",
      "posts",
      "categories",
      "authors",
      "pages",
      "media",
      "website",
      "analytics",
      "settings",
    ],
    mobilePrimary: ["home", "posts", "pages"],
    rolePresets: [
      ADMIN_PRESET,
      {
        label: "Content manager",
        role: "CONTENT_MANAGER",
        description: "Plans, edits and publishes content and manages navigation.",
      },
      {
        label: "Editor",
        role: "EDITOR",
        description: "Edits and publishes posts and pages.",
      },
      {
        label: "Author",
        role: "AUTHOR",
        description: "Writes drafts for an editor to publish.",
      },
      DESIGNER_PRESET,
      VIEWER_PRESET,
    ],
    homeFocus: ["posts", "categories", "website"],
  },
  PORTFOLIO: {
    type: "PORTFOLIO",
    label: "Portfolio",
    tagline: "Show your work beautifully and win new clients.",
    adapts: [
      "Navigation built around projects and media",
      "Team roles for portfolio management and content editing",
      "A home that starts with your projects",
    ],
    navigation: ["home", "projects", "media", "pages", "blog", "website", "analytics", "settings"],
    mobilePrimary: ["home", "projects", "media"],
    rolePresets: [
      ADMIN_PRESET,
      {
        label: "Portfolio manager",
        role: "SITE_MANAGER",
        description: "Manages the portfolio site, its settings, content and design.",
      },
      CONTENT_EDITOR_PRESET,
      DESIGNER_PRESET,
      VIEWER_PRESET,
    ],
    homeFocus: ["projects", "media", "website"],
  },
};

export interface NavigationItem extends StoreArea {
  /** The plan doesn't include this area's feature (shown, but locked). */
  readonly locked: boolean;
  readonly primaryOnMobile: boolean;
}

/**
 * The store navigation for a business type, filtered by the member's
 * permissions and marked where the plan doesn't include the area.
 */
export function storeNavigation(
  type: BusinessType,
  permissions: ReadonlySet<Permission>,
  isEntitled: (feature: FeatureKey) => boolean,
): NavigationItem[] {
  const definition = BUSINESS_TYPE_DEFINITIONS[type];
  return definition.navigation
    .map((key) => STORE_AREAS[key])
    .filter((area) => permissions.has(area.permission))
    .map((area) => ({
      ...area,
      locked: area.feature !== undefined && !isEntitled(area.feature),
      primaryOnMobile: definition.mobilePrimary.includes(area.key),
    }));
}

/** The area for a URL segment, if it belongs to this business type. */
export function areaForSegment(type: BusinessType, segment: string): StoreArea | undefined {
  return BUSINESS_TYPE_DEFINITIONS[type].navigation
    .map((key) => STORE_AREAS[key])
    .find((area) => area.segment === `/${segment}`);
}

/**
 * Role presets for the given business types (e.g. every store type in an
 * organisation), first label wins per role. Suggestions only: each maps to an
 * existing MemberRole, and assigning it goes through the usual RBAC checks.
 */
export function rolePresetsFor(types: readonly BusinessType[]): RolePreset[] {
  const seen = new Set<MemberRole>();
  const presets: RolePreset[] = [];
  for (const type of new Set(types)) {
    for (const preset of BUSINESS_TYPE_DEFINITIONS[type].rolePresets) {
      if (seen.has(preset.role)) continue;
      seen.add(preset.role);
      presets.push(preset);
    }
  }
  return presets;
}
