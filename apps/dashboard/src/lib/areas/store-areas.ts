// Presentation for the placeholder pages of store areas that haven't shipped
// (s/[storeId]/[area]). Pure data: the page still checks the area's
// permission and the plan before it shows anything.
import type { AreaKey } from "@storevia/tenancy/business-types";
import type { IllustrationName } from "@storevia/ui";

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
 * The honest status of an area that hasn't shipped: its milestone when one
 * is scheduled ("Milestone 6"), otherwise "On the roadmap".
 */
export function areaScheduleLabel(availability: string | undefined): string {
  if (availability === undefined) return "Available";
  return /^Milestone \d+$/.test(availability) ? availability : "On the roadmap";
}
