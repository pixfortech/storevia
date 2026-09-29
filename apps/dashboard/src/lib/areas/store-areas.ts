// Presentation for the placeholder pages of store areas that aren't built
// (s/[storeId]/[area]). Pure data: the page still checks the area's
// permission before it shows anything.
import { AVAILABILITY_LABELS, type Availability } from "@storevia/entitlements/availability";
import type { AreaKey } from "@storevia/tenancy/business-types";
import type { IllustrationName } from "@storevia/ui/illustrations";

/** The empty-state illustration for each area, drawn from the shared set. */
export const AREA_ILLUSTRATION: Readonly<Record<AreaKey, IllustrationName>> = {
  home: "empty-activity",
  orders: "empty-orders",
  products: "empty-products",
  inventory: "empty-products",
  customers: "empty-team",
  website: "empty-domains",
  pages: "empty-content",
  posts: "empty-content",
  categories: "empty-content",
  authors: "empty-team",
  projects: "empty-content",
  blog: "empty-content",
  media: "empty-content",
  marketing: "empty-inbox",
  analytics: "empty-analytics",
  settings: "empty-activity",
};

/**
 * The honest status of an area: "Available" or "Planned" (the neutral
 * vocabulary of @storevia/entitlements/availability), never a milestone or
 * a date.
 */
export function areaScheduleLabel(availability: Availability): string {
  return AVAILABILITY_LABELS[availability];
}
