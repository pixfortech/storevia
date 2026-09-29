// The full capability matrix on /features: every feature Storevia has or
// plans, grouped by area, each with its real status. Plan features take their
// status from plan-features.ts and store areas from the domain's STORE_AREAS
// (both derived from the platform's own sources), so this page, pricing and
// the dashboard can't disagree. Tests check that every plan feature appears
// here and that every status agrees with its source. No dates, no milestones.
import type { FeatureKey } from "@storevia/entitlements/features";
import type { AreaKey } from "@storevia/tenancy/business-types";
import { MEMBER_ROLES } from "@storevia/tenancy/rbac";
import type { GlyphName } from "@storevia/ui/icons";
import { CreditCard, LifeBuoy, ShieldCheck, type LucideIcon } from "lucide-react";
import { areaStatus } from "./business-types";
import { STATUSES, type Status } from "./capabilities";
import { FEATURE_STATUS } from "./plan-features";

export interface FeatureItem {
  readonly title: string;
  readonly description: string;
  readonly status: Status;
  /** The plan feature that decides which plans include it (and how much). */
  readonly planFeature?: FeatureKey | undefined;
  /** The store area it is, when it is one (its status comes from STORE_AREAS). */
  readonly area?: AreaKey | undefined;
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

/** A feature sold by plan: its status always matches the pricing page and the dashboard. */
function planFeature(key: FeatureKey, title: string, description: string): FeatureItem {
  return { title, description, status: FEATURE_STATUS[key], planFeature: key };
}

/** A store area: its status always matches the dashboard's navigation. */
function areaFeature(area: AreaKey, title: string, description: string): FeatureItem {
  return { title, description, status: areaStatus(area), area };
}

export const FEATURE_AREAS: readonly FeatureArea[] = [
  {
    id: "organisations",
    title: "Organisations and stores",
    glyph: "online-store",
    capability: "organisations",
    summary: "One account for every online store you run, each with its own address and team.",
    items: [
      {
        title: "Organisations",
        description: "One account for your business, with its own team and plan.",
        status: "available",
      },
      planFeature(
        "store_count",
        "Several stores",
        "Run several online stores from one organisation, up to your plan's limit.",
      ),
      {
        title: "Online stores",
        description:
          "Every store is set up for selling: navigation, its home and suggested roles are built around orders, products and customers.",
        status: "available",
      },
      {
        title: "Business websites, publications and portfolios",
        description: "Stores built around pages, posts or projects instead of products.",
        status: "roadmap",
      },
      {
        title: "Store web address",
        description: "Each store has its own Storevia address, live when you choose.",
        status: "available",
      },
      {
        title: "Store settings",
        description:
          "Name, date and number format, time zone, and contact and support emails for each store.",
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
    summary: "Bring in staff and freelancers without handing over the keys.",
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
        description: `${String(MEMBER_ROLES.length)} roles, each mapped to precise permissions checked on every request.`,
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
          "Sensitive changes, like granting admin rights or refunding an order, ask you to confirm your password first.",
        status: "available",
      },
      {
        title: "Audit log",
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
        title: "Plan and usage",
        description: "See your plan, what it includes and how much of each limit you're using.",
        status: "available",
      },
      {
        title: "Notifications",
        description:
          "Messages from customers about their orders, for the people who handle orders.",
        status: "available",
      },
    ],
  },
  {
    id: "security",
    title: "Accounts, security and your data",
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
      planFeature(
        "export",
        "Data export",
        "Owners can download their organisation's data, and products can be exported as CSV.",
      ),
      {
        title: "Account and organisation deletion",
        description: "Delete your account, or your whole organisation, from the dashboard.",
        status: "available",
      },
      {
        title: "Two-step sign-in",
        description: "A second step when you sign in, with an authenticator app.",
        status: "roadmap",
      },
      {
        title: "Sign in with Google",
        description: "Sign in with your Google account instead of a password.",
        status: "roadmap",
      },
    ],
  },
  {
    id: "plans",
    title: "Plans and billing",
    icon: CreditCard,
    summary: "Start free. Paid plans are set up with our team.",
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
    summary: "A catalogue built for real stock, with checkout, orders and customers.",
    items: [
      planFeature(
        "product_limit",
        "Products and collections",
        "Products with descriptions, pricing and media, grouped into collections, with tags and categories.",
      ),
      {
        title: "Options and variants",
        description: "Sizes, colours and materials, each variant with its own price and stock.",
        status: "available",
      },
      areaFeature(
        "inventory",
        "Inventory by location",
        "Stock levels per location, with a full history of every movement.",
      ),
      {
        title: "Search and bulk editing",
        description:
          "Find products by title, SKU, barcode, vendor or tag, change many at once and export them as CSV.",
        status: "available",
      },
      planFeature(
        "media_storage",
        "Media library",
        "One library of images and files for your products and pages.",
      ),
      {
        title: "Checkout and payments",
        description:
          "A guest checkout with prices, shipping and tax worked out on the server, paid on Razorpay's secure page.",
        status: "available",
      },
      areaFeature(
        "orders",
        "Orders, fulfilment and refunds",
        "Every order with its payment and fulfilment status, shipments with tracking, delivery, refunds and cancellation.",
      ),
      areaFeature(
        "customers",
        "Customers",
        "A record for every customer who orders, with their order history, notes and tags.",
      ),
      {
        title: "Customer order page",
        description:
          "Each shopper gets a private link to follow their order and send you a message.",
        status: "available",
      },
      {
        title: "Shipping and tax",
        description:
          "Shipping zones with flat and price-based rates, and tax rates you set, with your GST number.",
        status: "available",
      },
      planFeature(
        "discounts",
        "Discount codes",
        "Percentage or fixed-amount codes with minimums, dates and usage limits.",
      ),
      {
        title: "Automatic discounts",
        description: "Discounts that apply at checkout without a code.",
        status: "roadmap",
      },
      {
        title: "Cash on delivery",
        description: "Let shoppers pay when their order arrives.",
        status: "roadmap",
      },
      {
        title: "Customer accounts",
        description: "Shoppers sign in to see their orders and saved addresses.",
        status: "roadmap",
      },
      planFeature(
        "abandoned_cart",
        "Abandoned cart recovery",
        "Remind shoppers about checkouts they didn't finish.",
      ),
    ],
  },
  {
    id: "website",
    title: "Website and storefront",
    glyph: "builder",
    capability: "builder",
    summary: "Your store on the web, and a visual builder to design every page.",
    items: [
      {
        title: "Storefront",
        description:
          "Your store on the web, with product pages, collections, cart and search, served over HTTPS.",
        status: "available",
      },
      planFeature(
        "visual_builder",
        "Visual page builder",
        "Design pages from ready-made sections, with a live preview beside the settings.",
      ),
      {
        title: "Responsive editing",
        description:
          "Preview each page at desktop, tablet and phone widths, and choose where each section shows.",
        status: "available",
      },
      {
        title: "Drafts and publishing",
        description: "Autosaved drafts, a private preview, and publishing when you're ready.",
        status: "available",
      },
      {
        title: "Version history",
        description: "Compare and restore earlier published versions of a page.",
        status: "roadmap",
      },
      areaFeature("pages", "Pages", "Pages such as About, Contact and landing pages."),
      {
        title: "Menus",
        description: "Menus for your site's header and footer.",
        status: "available",
      },
      {
        title: "Search titles and descriptions",
        description: "Set how each product and page appears in search results.",
        status: "available",
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
      areaFeature("posts", "Posts", "Articles and stories, from draft to published."),
      areaFeature("categories", "Categories", "Sections readers can browse."),
      areaFeature("authors", "Author profiles", "Author profiles shown on your posts."),
      areaFeature("blog", "Blog", "News and articles alongside your store."),
      areaFeature(
        "projects",
        "Projects",
        "Show your work as projects with images and case studies.",
      ),
      {
        title: "Site forms",
        description: "Contact and enquiry forms on your site.",
        status: "roadmap",
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
      ),
      {
        title: "Automatic HTTPS",
        description: "Certificates issued and renewed for your domains automatically.",
        status: "available",
      },
      {
        title: "Themes",
        description: "Two first-party themes, each with ready-made presets.",
        status: "available",
      },
      {
        title: "Theme customisation",
        description: "Customise colours, type and layout, and preview before you publish.",
        status: "available",
      },
      planFeature("premium_themes", "Premium themes", "Install premium themes."),
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    glyph: "analytics",
    capability: "analytics",
    summary: "Your sales at a glance today; traffic and reports are planned.",
    items: [
      {
        title: "Business figures on your store's home",
        description:
          "Sales, orders, new customers, a sales trend and top products over the period you choose.",
        status: "available",
      },
      areaFeature(
        "analytics",
        "Storefront visitors and conversion",
        "How many people visit your store, and how many of them order.",
      ),
      planFeature(
        "analytics",
        "Reports",
        "Sales and traffic reports, with how much history you keep set by your plan.",
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
      ),
      planFeature("webhooks", "Webhooks", "Send events to your own endpoints."),
      {
        title: "Apps",
        description: "Add features to your store from other providers.",
        status: "roadmap",
      },
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
        description: "Guides and help articles for every part of Storevia.",
        status: "roadmap",
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
