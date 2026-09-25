// The full capability matrix on /features: every feature Storevia has or
// plans, grouped by area, each with its real status. Plan features take their
// status from plan-features.ts and store areas their timing from the domain's
// STORE_AREAS, so this page, pricing and the dashboard can't disagree. A test
// checks that every plan feature appears here.
import type { FeatureKey } from "@storevia/entitlements/features";
import { STORE_AREAS } from "@storevia/tenancy/business-types";
import { MEMBER_ROLES } from "@storevia/tenancy/rbac";
import type { GlyphName } from "@storevia/ui";
import { CreditCard, LifeBuoy, ShieldCheck, type LucideIcon } from "lucide-react";
import { STATUSES, type Status } from "./capabilities";
import { FEATURE_STATUS } from "./plan-features";

export interface FeatureItem {
  readonly title: string;
  readonly description: string;
  readonly status: Status;
  /** The plan feature that decides which plans include it (and how much). */
  readonly planFeature?: FeatureKey | undefined;
  /** When an unfinished feature is planned: "Milestone 3", "a later release". */
  readonly milestone?: string | undefined;
}

export interface FeatureArea {
  /** Anchor on /features. */
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  /** A Storevia glyph for product concepts… */
  readonly glyph?: GlyphName;
  /** …or a Lucide icon for everything else. */
  readonly icon?: LucideIcon;
  /** The capability on /products that tells the fuller story. */
  readonly capability?: string;
  readonly items: readonly FeatureItem[];
}

/** A feature sold by plan: its status always matches the pricing page. */
function planFeature(
  key: FeatureKey,
  title: string,
  description: string,
  milestone?: string,
): FeatureItem {
  const status = FEATURE_STATUS[key];
  return {
    title,
    description,
    status,
    planFeature: key,
    ...(status === "available" ? {} : { milestone }),
  };
}

const M = {
  catalogue: STORE_AREAS.products.availability,
  inventory: STORE_AREAS.inventory.availability,
  media: STORE_AREAS.media.availability,
  orders: STORE_AREAS.orders.availability,
  customers: STORE_AREAS.customers.availability,
  discounts: STORE_AREAS.marketing.availability,
  website: STORE_AREAS.website.availability,
  pages: STORE_AREAS.pages.availability,
  posts: STORE_AREAS.posts.availability,
  categories: STORE_AREAS.categories.availability,
  authors: STORE_AREAS.authors.availability,
  projects: STORE_AREAS.projects.availability,
  blog: STORE_AREAS.blog.availability,
  analytics: STORE_AREAS.analytics.availability,
  // From the public roadmap (docs/roadmap/implementation-roadmap.md).
  storefront: "Milestone 4",
  domains: "Milestone 7",
  hardening: "Milestone 8",
} as const;

export const FEATURE_AREAS: readonly FeatureArea[] = [
  {
    id: "organisations",
    title: "Organisations and stores",
    glyph: "online-store",
    capability: "organisations",
    summary: "One account for everything you run online, each store set up for what it is.",
    items: [
      {
        title: "Organisations",
        description: "One account for your business, with its own team and plan.",
        status: "available",
      },
      planFeature(
        "store_count",
        "Several stores",
        "Run stores and sites from one organisation, up to your plan's limit.",
      ),
      {
        title: "Business types",
        description:
          "Tell Storevia what each store is: an online store, a business website, a publication or a portfolio.",
        status: "available",
      },
      {
        title: "Change type at any time",
        description:
          "Switch a store's business type later. Nothing is deleted, and your plan and permissions stay the same.",
        status: "available",
      },
      {
        title: "Store web address",
        description: "Each store reserves its own Storevia address, ready for its storefront.",
        status: "available",
      },
      {
        title: "Store settings",
        description: "Name, language, time zone, and contact and support emails for each store.",
        status: "available",
      },
      {
        title: "Archive a store",
        description: "Archive a store you no longer need; it stops counting towards your plan.",
        status: "available",
      },
    ],
  },
  {
    id: "team",
    title: "Team and access",
    glyph: "teams",
    capability: "teams",
    summary: "Bring in staff, freelancers and writers without handing over the keys.",
    items: [
      {
        title: "Invitations",
        description: "Invite people by email; they join with the role you choose.",
        status: "available",
      },
      planFeature(
        "staff_accounts",
        "Team members",
        "Members of your organisation, including the owner, up to your plan's limit.",
      ),
      {
        title: "Standard roles",
        description: `${String(MEMBER_ROLES.length)} roles, from owner to author, each mapped to precise permissions checked on every request.`,
        status: "available",
      },
      {
        title: "Suggested roles",
        description: "Role suggestions that match each store's business type when you invite.",
        status: "available",
      },
      planFeature(
        "advanced_permissions",
        "Access to selected stores",
        "Give someone access to the stores they work on, and no others.",
      ),
      {
        title: "Suspend, remove and transfer",
        description:
          "Suspend someone's access without removing them, remove them, or hand the organisation to another member.",
        status: "available",
      },
      {
        title: "Password confirmation",
        description:
          "Sensitive changes, like granting admin rights, ask you to confirm your password first.",
        status: "available",
      },
      {
        title: "Audit trail",
        description:
          "Changes to members, roles, stores and plans are recorded with who made them and when.",
        status: "available",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    glyph: "website",
    capability: "administration",
    summary: "One workspace, designed separately for desktop, tablet and phone.",
    items: [
      {
        title: "Desktop, tablet and phone layouts",
        description:
          "A full sidebar on desktop, a touch rail on tablet and an app-style bottom bar on your phone.",
        status: "available",
      },
      {
        title: "Command menu",
        description: "Press ⌘K or Ctrl+K to jump to any page or store.",
        status: "available",
      },
      {
        title: "Store and organisation switcher",
        description: "Move between the stores and organisations you belong to in a click.",
        status: "available",
      },
      {
        title: "Navigation by business type",
        description: "Each store's navigation puts what matters for its type first.",
        status: "available",
      },
      {
        title: "Plan and usage",
        description: "See your plan, what it includes and how much of each limit you're using.",
        status: "available",
      },
      {
        title: "Business figures on your store's home",
        description:
          "Sales, orders and visitors on each store's home, filling in as each part of Storevia ships.",
        status: "roadmap",
        milestone: M.orders,
      },
    ],
  },
  {
    id: "security",
    title: "Accounts and security",
    icon: ShieldCheck,
    summary: "Protection that's built in from the first line, not added at the end.",
    items: [
      {
        title: "Email verification",
        description: "New accounts confirm their email address before they start.",
        status: "available",
      },
      {
        title: "Password reset",
        description: "Reset a forgotten password with a link sent to your email.",
        status: "available",
      },
      {
        title: "Signed-in devices",
        description: "See where you're signed in and sign out of other devices.",
        status: "available",
      },
      {
        title: "Data isolation",
        description:
          "Each organisation's data is separated in the database itself, not only in application code.",
        status: "available",
      },
      {
        title: "Rate limiting",
        description: "Sign-in, sign-up and public forms are rate limited against abuse.",
        status: "available",
      },
      {
        title: "Two-step sign-in and Google sign-in",
        description: "A second step at sign-in, and signing in with your Google account.",
        status: "roadmap",
        milestone: M.hardening,
      },
    ],
  },
  {
    id: "plans",
    title: "Plans and billing",
    icon: CreditCard,
    summary: "Start free. Plans are set up with our team until online checkout arrives.",
    items: [
      {
        title: "Free to start",
        description: "Every organisation starts on the free allowance, with no card needed.",
        status: "available",
      },
      {
        title: "Paid plans, set up with our team",
        description: "Choose a plan with us and we set it up. Trials are arranged the same way.",
        status: "available",
      },
      {
        title: "Usage limits",
        description: "Plan limits apply as you grow, and the dashboard shows what you're using.",
        status: "available",
      },
      {
        title: "Online checkout and self-serve plan changes",
        description: "Choose, change or cancel a plan yourself, and pay online.",
        status: "roadmap",
      },
      {
        title: "Invoices and payment methods",
        description: "Download invoices and manage how you pay.",
        status: "roadmap",
      },
    ],
  },
  {
    id: "commerce",
    title: "Commerce",
    glyph: "commerce",
    capability: "commerce",
    summary: "A catalogue built for real stock first, then checkout, orders and customers.",
    items: [
      planFeature(
        "product_limit",
        "Products and collections",
        "Products with descriptions, pricing and media, grouped into collections.",
        M.catalogue,
      ),
      {
        title: "Options and variants",
        description: "Sizes, colours and materials, each variant with its own price and stock.",
        status: "in-development",
        milestone: M.catalogue,
      },
      {
        title: "Inventory by location",
        description: "Stock levels per location, with a full history of every movement.",
        status: "in-development",
        milestone: M.inventory,
      },
      planFeature(
        "media_storage",
        "Media library",
        "One library of images and files for your products and pages.",
        M.media,
      ),
      {
        title: "Checkout and payments",
        description: "A checkout with prices worked out on the server, then payments.",
        status: "roadmap",
        milestone: M.orders,
      },
      {
        title: "Orders, refunds and fulfilment",
        description: "Every order with its payment and fulfilment status, refunds included.",
        status: "roadmap",
        milestone: M.orders,
      },
      {
        title: "Customers",
        description: "Customer records with their addresses and order history.",
        status: "roadmap",
        milestone: M.customers,
      },
      planFeature("discounts", "Discounts", "Discount codes and automatic discounts.", M.discounts),
      planFeature("abandoned_cart", "Abandoned cart recovery", "Recover abandoned checkouts."),
    ],
  },
  {
    id: "website",
    title: "Website and storefront",
    glyph: "builder",
    capability: "builder",
    summary: "Your store on the web, then a visual builder to design every page.",
    items: [
      {
        title: "Storefront",
        description:
          "Your store on the web at its Storevia address, with a default theme, cart and search.",
        status: "roadmap",
        milestone: M.storefront,
      },
      planFeature(
        "visual_builder",
        "Visual page builder",
        "Design pages by arranging sections and editing words where they sit.",
        M.website,
      ),
      {
        title: "Responsive editing",
        description: "Check and adjust each page for desktop, tablet and phone.",
        status: "roadmap",
        milestone: M.website,
      },
      {
        title: "Drafts, publishing and history",
        description:
          "Autosaved drafts, publishing when you're ready and restoring earlier versions.",
        status: "roadmap",
        milestone: M.website,
      },
      {
        title: "Pages",
        description: "Pages such as About, Contact and landing pages.",
        status: "roadmap",
        milestone: M.pages,
      },
      planFeature(
        "advanced_builder",
        "Advanced builder components",
        "Advanced layout and interaction components for the builder.",
      ),
      planFeature("custom_code", "Custom code", "Add your own code to storefront pages."),
    ],
  },
  {
    id: "content",
    title: "Content and publishing",
    glyph: "content",
    capability: "content",
    summary: "Write, edit and publish as a team, for publications and any business with news.",
    items: [
      {
        title: "Posts",
        description: "Articles and stories, from draft to published.",
        status: "roadmap",
        milestone: M.posts,
      },
      {
        title: "Categories",
        description: "Sections readers can browse.",
        status: "roadmap",
        milestone: M.categories,
      },
      {
        title: "Author profiles",
        description: "Author profiles shown on your posts.",
        status: "roadmap",
        milestone: M.authors,
      },
      {
        title: "Blog",
        description: "News and articles alongside a business website or portfolio.",
        status: "roadmap",
        milestone: M.blog,
      },
      {
        title: "Projects",
        description: "Show your work as projects with images and case studies.",
        status: "roadmap",
        milestone: M.projects,
      },
      {
        title: "Search previews",
        description: "Titles and descriptions for search engines, set per page and per post.",
        status: "roadmap",
      },
      {
        title: "Writer and editor roles",
        description: "Author, editor and content manager roles are ready for your team today.",
        status: "available",
      },
    ],
  },
  {
    id: "domains-themes",
    title: "Domains and themes",
    glyph: "domains",
    capability: "domains",
    summary: "Your own address and your own look.",
    items: [
      planFeature(
        "custom_domain",
        "Custom domains",
        "Serve your store on your own domain, with clear DNS instructions and verification.",
        M.domains,
      ),
      {
        title: "Automatic HTTPS",
        description: "Certificates issued and renewed for your domains automatically.",
        status: "roadmap",
        milestone: M.domains,
      },
      {
        title: "Theme customisation",
        description: "Customise colours, type and layout, and preview before you publish.",
        status: "roadmap",
        milestone: M.domains,
      },
      planFeature("premium_themes", "Premium themes", "Install premium themes."),
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    glyph: "analytics",
    capability: "analytics",
    summary: "Reports on traffic, engagement and sales, with history set by your plan.",
    items: [
      planFeature(
        "analytics",
        "Reports",
        "Traffic, engagement and sales reports. How much history you keep is set by your plan.",
        M.analytics,
      ),
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    glyph: "integrations",
    capability: "integrations",
    summary: "Connect your own tools to your store.",
    items: [
      planFeature(
        "api_access",
        "API access",
        "Use the Storevia API with API keys, starting with the catalogue.",
        M.catalogue,
      ),
      planFeature("webhooks", "Webhooks", "Send events to your own endpoints.", M.orders),
      planFeature("export", "Data export", "Export your data.", M.hardening),
    ],
  },
  {
    id: "support",
    title: "Support",
    icon: LifeBuoy,
    summary: "People who read every message.",
    items: [
      {
        title: "Contact the team",
        description: "Send us a message and a person replies by email.",
        status: "available",
      },
      planFeature("priority_support", "Priority support", "Faster responses from our team."),
      {
        title: "Guides and help centre",
        description: "Guides and help articles, arriving with the storefront.",
        status: "roadmap",
        milestone: M.storefront,
      },
    ],
  },
  {
    id: "retail",
    title: "In-person retail",
    glyph: "retail",
    capability: "retail",
    summary: "A future direction for shops that also sell in person.",
    items: [
      {
        title: "Point of sale",
        description:
          "A possible future connection with OmniPOS point of sale, as part of the wider Storevia ecosystem. It isn't part of Storevia today.",
        status: "future",
      },
    ],
  },
];

/** How many features have each status, overall or in one area. */
export function statusCounts(
  items: readonly Pick<FeatureItem, "status">[],
): Readonly<Record<Status, number>> {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    Status,
    number
  >;
  for (const item of items) counts[item.status] += 1;
  return counts;
}

/** Every feature in the matrix, in page order. */
export const ALL_FEATURES: readonly FeatureItem[] = FEATURE_AREAS.flatMap((area) => area.items);
