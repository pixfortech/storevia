import type { BusinessType } from "@storevia/tenancy/business-types";
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
