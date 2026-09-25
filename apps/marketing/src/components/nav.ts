// The site's navigation: the header's menus (desktop mega-menus and the
// phone and tablet drawer share this data) and the footer. Product statuses
// come from content/capabilities.ts, business types from the domain, so the
// menus can't claim more than the product does.
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import type { GlyphName } from "@storevia/ui";
import {
  Building2,
  CircleHelp,
  FileText,
  Lock,
  Mail,
  Map as MapIcon,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { BUSINESS_TYPE_ANCHOR, BUSINESS_TYPE_GLYPH } from "@/content/business-types";
import { capability, type Status } from "@/content/capabilities";

export interface MenuLink {
  readonly title: string;
  /** One short line. */
  readonly description: string;
  readonly href: string;
  /** A Storevia glyph for product concepts… */
  readonly glyph?: GlyphName;
  /** …or a Lucide icon for everything else. */
  readonly icon?: LucideIcon;
  /** Present only when the item isn't available today. */
  readonly status?: Status;
}

export interface MenuGroup {
  readonly heading: string;
  readonly links: readonly MenuLink[];
  /** Columns the links flow into on the desktop panel. Default 1. */
  readonly columns?: 1 | 2;
}

export interface NavMenu {
  readonly kind: "menu";
  /** The top-level label, e.g. "Products". */
  readonly label: string;
  /** The menu's landing page (the drawer links the label to it). */
  readonly href: string;
  /** Paths (and their subpaths) that belong to this section, for the current-section mark. */
  readonly section: readonly string[];
  readonly groups: readonly MenuGroup[];
  /** A line and links along the bottom of the desktop panel. */
  readonly footer?: {
    readonly text: string;
    readonly links: readonly { readonly label: string; readonly href: string }[];
  };
}

export interface NavPage {
  readonly kind: "link";
  readonly label: string;
  readonly href: string;
  readonly section: readonly string[];
}

export type PrimaryNavItem = NavMenu | NavPage;

/** A product capability as a menu row: its title, glyph, anchor and (unless live) status. */
function capabilityLink(id: string, description: string): MenuLink {
  const item = capability(id);
  return {
    title: item.title,
    description,
    href: `/products#${item.id}`,
    glyph: item.glyph,
    ...(item.status === "available" ? {} : { status: item.status }),
  };
}

const retail = capability("retail");

export const PRODUCTS_MENU: NavMenu = {
  kind: "menu",
  label: "Products",
  href: "/products",
  section: ["/products", "/features"],
  groups: [
    {
      heading: "Build",
      links: [
        capabilityLink("builder", "Design pages visually, for every screen."),
        capabilityLink("commerce", "Products, variants and inventory, then checkout."),
        capabilityLink("content", "Posts, pages, categories and authors."),
        capabilityLink("domains", "Connect your own domain, with HTTPS."),
      ],
    },
    {
      heading: "Run",
      links: [
        capabilityLink("organisations", "Many stores and sites, one account."),
        capabilityLink("teams", "Roles mapped to precise permissions."),
        capabilityLink("administration", "A dashboard for desktop, tablet and phone."),
        capabilityLink("analytics", "Traffic, engagement and sales reports."),
      ],
    },
  ],
  footer: {
    text: "Storevia is built in stages. Every capability shows its status.",
    links: [
      { label: "Product overview", href: "/products" },
      { label: "All features", href: "/features" },
    ],
  },
};

export const SOLUTIONS_MENU: NavMenu = {
  kind: "menu",
  label: "Solutions",
  href: "/solutions",
  section: ["/solutions"],
  groups: [
    {
      heading: "By business type",
      columns: 2,
      links: BUSINESS_TYPES.map((type) => ({
        title: BUSINESS_TYPE_DEFINITIONS[type].label,
        description: BUSINESS_TYPE_DEFINITIONS[type].tagline,
        href: `/solutions#${BUSINESS_TYPE_ANCHOR[type]}`,
        glyph: BUSINESS_TYPE_GLYPH[type],
      })),
    },
    {
      heading: "Future direction",
      links: [
        {
          title: "In-person selling",
          description: "A possible future link with OmniPOS for shops that also sell in person.",
          href: `/products#${retail.id}`,
          glyph: retail.glyph,
          status: retail.status,
        },
      ],
    },
  ],
  footer: {
    text: "One organisation can run stores of every type, on one plan.",
    links: [{ label: "Compare business types", href: "/solutions" }],
  },
};

export const RESOURCES_MENU: NavMenu = {
  kind: "menu",
  label: "Resources",
  href: "/resources",
  section: ["/resources", "/changelog"],
  groups: [
    {
      heading: "Follow along",
      links: [
        {
          title: "Roadmap",
          description: "What's ready today and what comes next.",
          href: "/resources#roadmap",
          icon: MapIcon,
        },
        {
          title: "Changelog",
          description: "What changed in each release.",
          href: "/changelog",
          icon: ScrollText,
        },
      ],
    },
    {
      heading: "Trust and help",
      links: [
        {
          title: "Security",
          description: "How your data is isolated and protected.",
          href: "/resources#security",
          icon: ShieldCheck,
        },
        {
          title: "FAQ",
          description: "Straight answers on plans and features.",
          href: "/#faq",
          icon: CircleHelp,
        },
      ],
    },
  ],
  footer: {
    text: "Guides and documentation will live here as the product grows.",
    links: [{ label: "Resources overview", href: "/resources" }],
  },
};

export const COMPANY_MENU: NavMenu = {
  kind: "menu",
  label: "Company",
  href: "/about",
  section: ["/about", "/contact", "/legal"],
  groups: [
    {
      heading: "Storevia",
      links: [
        {
          title: "About",
          description: "Who we are and how we build.",
          href: "/about",
          icon: Building2,
        },
        {
          title: "Contact",
          description: "Questions about plans or the product.",
          href: "/contact",
          icon: Mail,
        },
      ],
    },
    {
      heading: "Legal",
      links: [
        {
          title: "Privacy",
          description: "Our privacy policy, published before launch.",
          href: "/legal/privacy",
          icon: Lock,
        },
        {
          title: "Terms",
          description: "Our terms of service, published before launch.",
          href: "/legal/terms",
          icon: FileText,
        },
      ],
    },
  ],
};

export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  PRODUCTS_MENU,
  SOLUTIONS_MENU,
  { kind: "link", label: "Pricing", href: "/pricing", section: ["/pricing"] },
  RESOURCES_MENU,
  COMPANY_MENU,
];

/** Whether a top-level item is the section the visitor is in. */
export function isCurrentSection(item: PrimaryNavItem, pathname: string): boolean {
  return item.section.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export interface FooterLink {
  readonly label: string;
  readonly href: string;
  readonly status?: Status;
}

const PLURAL_TYPE_LABEL = {
  ECOMMERCE: "Online stores",
  BUSINESS: "Business websites",
  PUBLISHING: "Blogs and publications",
  PORTFOLIO: "Portfolios",
} as const;

export const FOOTER_NAV: readonly { title: string; links: readonly FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/products" },
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Solutions",
    links: [
      ...BUSINESS_TYPES.map((type) => ({
        label: PLURAL_TYPE_LABEL[type],
        href: `/solutions#${BUSINESS_TYPE_ANCHOR[type]}`,
      })),
      { label: "In-person selling", href: `/products#${retail.id}`, status: retail.status },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Roadmap", href: "/resources#roadmap" },
      { label: "Security", href: "/resources#security" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
];
