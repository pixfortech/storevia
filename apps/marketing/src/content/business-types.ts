import {
  BUSINESS_TYPES,
  isLaunchBusinessType,
  STORE_AREAS,
  type AreaKey,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import type { GlyphName } from "@storevia/ui/icons";
import { statusOf, type Status } from "./capabilities";

export const BUSINESS_TYPE_GLYPH: Readonly<Record<BusinessType, GlyphName>> = {
  ECOMMERCE: "online-store",
  BUSINESS: "business-website",
  PUBLISHING: "publication",
  PORTFOLIO: "portfolio",
};

/**
 * Whether merchants can create a store of each type today: the dashboard
 * offers only the launch types (LAUNCH_BUSINESS_TYPES, DB-2), so every other
 * type is on the roadmap, never sold as available.
 */
export const BUSINESS_TYPE_STATUS: Readonly<Record<BusinessType, Status>> = Object.fromEntries(
  BUSINESS_TYPES.map((type) => [type, isLaunchBusinessType(type) ? "available" : "roadmap"]),
) as Record<BusinessType, Status>;

/** The business types merchants can choose today, then the planned ones. */
export const OFFERED_BUSINESS_TYPES = BUSINESS_TYPES.filter(
  (type) => BUSINESS_TYPE_STATUS[type] === "available",
);
export const PLANNED_BUSINESS_TYPES = BUSINESS_TYPES.filter(
  (type) => BUSINESS_TYPE_STATUS[type] !== "available",
);

/** A store area's status on the site, from the domain's STORE_AREAS. */
export function areaStatus(area: AreaKey): Status {
  return statusOf(STORE_AREAS[area].availability);
}

/** Anchors on /solutions. */
export const BUSINESS_TYPE_ANCHOR: Readonly<Record<BusinessType, string>> = {
  ECOMMERCE: "online-stores",
  BUSINESS: "business-websites",
  PUBLISHING: "publications",
  PORTFOLIO: "portfolios",
};

/** Plural names, for headings and links ("Online stores"). */
export const BUSINESS_TYPE_PLURAL: Readonly<Record<BusinessType, string>> = {
  ECOMMERCE: "Online stores",
  BUSINESS: "Business websites",
  PUBLISHING: "Blogs and publications",
  PORTFOLIO: "Portfolios",
};

/**
 * The /solutions headline and lead for each type. Only the launch type is
 * described as something you can use; the others say plainly that they are
 * planned, with no dates.
 */
export const SOLUTION_COPY: Readonly<Record<BusinessType, { headline: string; lead: string }>> = {
  ECOMMERCE: {
    headline: "A store run from one place",
    lead: "Your navigation starts with orders, products and customers, and your store's home with your sales and stock. Shoppers check out on your storefront and pay through your own Razorpay account.",
  },
  BUSINESS: {
    headline: "Business websites",
    lead: "A site built around your pages, with site forms for enquiries. Not offered yet: you can't create a business website today.",
  },
  PUBLISHING: {
    headline: "Blogs and publications",
    lead: "Posts, categories and authors, with a writing workflow for your team. Not offered yet: you can't create a publication today.",
  },
  PORTFOLIO: {
    headline: "Portfolios",
    lead: "Projects with images and case studies. Not offered yet: you can't create a portfolio today.",
  },
};
