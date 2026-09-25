import { STORE_AREAS, type BusinessType } from "@storevia/tenancy/business-types";
import type { GlyphName } from "@storevia/ui";

export const BUSINESS_TYPE_GLYPH: Readonly<Record<BusinessType, GlyphName>> = {
  ECOMMERCE: "online-store",
  BUSINESS: "business-website",
  PUBLISHING: "publication",
  PORTFOLIO: "portfolio",
};

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

const when = (area: keyof typeof STORE_AREAS) =>
  STORE_AREAS[area].availability ?? "a later release";

/**
 * The /solutions headline and lead for each type. Timings come from the
 * domain's store areas, so they can't drift from the dashboard's own labels.
 */
export const SOLUTION_COPY: Readonly<Record<BusinessType, { headline: string; lead: string }>> = {
  ECOMMERCE: {
    headline: "A store run from one place",
    lead: `Your navigation starts with orders, products and customers, and your store's home with your catalogue and storefront. The catalogue arrives in ${when("products")}, and checkout and orders in ${when("orders")}.`,
  },
  BUSINESS: {
    headline: "A professional website, without the clutter",
    lead: `Navigation built around your website, pages and blog, with no commerce areas in your way until you need them. The visual builder arrives in ${when("website")}.`,
  },
  PUBLISHING: {
    headline: "A publication your whole team can write for",
    lead: `Posts, categories and authors come first, and the roles for content managers, editors and authors are ready today. Writing tools arrive in ${when("posts")}.`,
  },
  PORTFOLIO: {
    headline: "A portfolio that puts your work first",
    lead: `Projects and media lead your navigation, with roles for everyone who helps you show your work. Portfolio tools arrive in ${when("projects")}.`,
  },
};

/** When a store area is available: "Available", "Milestone 3", "A later release". */
export function areaTiming(availability: string | undefined): string {
  if (!availability) return "Available";
  return availability.charAt(0).toUpperCase() + availability.slice(1);
}
