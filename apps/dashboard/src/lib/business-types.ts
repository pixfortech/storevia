import type { BusinessType } from "@storevia/tenancy/business-types";
import type { GlyphName } from "@storevia/ui/icons";

/** The Storevia glyph that represents each business type. */
export const BUSINESS_TYPE_GLYPH: Readonly<Record<BusinessType, GlyphName>> = {
  ECOMMERCE: "online-store",
  BUSINESS: "business-website",
  PUBLISHING: "publication",
  PORTFOLIO: "portfolio",
};
