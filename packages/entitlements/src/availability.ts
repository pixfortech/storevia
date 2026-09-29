// Whether each plan feature exists in the product today: the one source of
// truth for feature status (MK-5). The dashboard's billing page and store
// home, and every status on the marketing site, derive from this record, and
// tests in both apps fail if they disagree with it. Store areas carry the
// same vocabulary in @storevia/tenancy/business-types (STORE_AREAS).
//
// A plan can include a feature before it is built: "included" is the
// entitlement (the database catalogue), this is whether merchants can use it.
// Change an entry in the same change that ships (or withdraws) the feature.
// Client-safe: no server imports.
import type { FeatureKey } from "./features";

/** "available": merchants can use it today. "planned": not built yet (no dates). */
export type Availability = "available" | "planned";

export const AVAILABILITIES: readonly Availability[] = ["available", "planned"];

/** The neutral words for each status, wherever the product shows one. */
export const AVAILABILITY_LABELS: Readonly<Record<Availability, string>> = {
  available: "Available",
  planned: "Planned",
};

export const FEATURE_AVAILABILITY: Readonly<Record<FeatureKey, Availability>> = {
  store_count: "available",
  staff_accounts: "available",
  product_limit: "available",
  media_storage: "available",
  // Custom domains with automatic HTTPS: dashboard Domains settings.
  custom_domain: "available",
  // The page builder, themes and menus.
  visual_builder: "available",
  advanced_builder: "planned",
  premium_themes: "planned",
  custom_code: "planned",
  // Discount codes (percentage and fixed amount). Automatic discounts are
  // not built, so no copy may promise them.
  discounts: "available",
  abandoned_cart: "planned",
  // No storefront traffic is recorded and there is no reports area; the
  // store home's business figures come from orders and need no plan feature.
  analytics: "planned",
  // @storevia/tenancy enforces store-limited access (setMemberStoreAccess),
  // but no dashboard screen sets it, so merchants can't use it yet.
  advanced_permissions: "planned",
  // The Admin API ships with outbound webhooks, deferred as a whole (ADR-0031 §13).
  api_access: "planned",
  webhooks: "planned",
  // Organisation data export and product CSV export, on every plan.
  export: "available",
  priority_support: "planned",
};

export function isFeatureAvailable(key: FeatureKey): boolean {
  return FEATURE_AVAILABILITY[key] === "available";
}
