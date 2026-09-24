// How plan features are grouped and whether each is live yet. Plan values
// come from the database (ADR-0025); this file only adds presentation, and
// the Record type forces an entry for every feature key.
import type { FeatureKey } from "@storevia/entitlements/features";
import type { Status } from "./capabilities";

export const FEATURE_STATUS: Readonly<Record<FeatureKey, Status>> = {
  store_count: "available",
  staff_accounts: "available",
  product_limit: "in-development",
  media_storage: "in-development",
  api_access: "in-development",
  custom_domain: "roadmap",
  visual_builder: "roadmap",
  advanced_builder: "roadmap",
  premium_themes: "roadmap",
  custom_code: "roadmap",
  discounts: "roadmap",
  abandoned_cart: "roadmap",
  webhooks: "roadmap",
  analytics: "roadmap",
  advanced_permissions: "roadmap",
  export: "roadmap",
  priority_support: "roadmap",
};

export const FEATURE_GROUPS: readonly { title: string; keys: readonly FeatureKey[] }[] = [
  { title: "Scale", keys: ["store_count", "staff_accounts", "product_limit", "media_storage"] },
  {
    title: "Build",
    keys: ["visual_builder", "advanced_builder", "premium_themes", "custom_code", "custom_domain"],
  },
  { title: "Sell and grow", keys: ["discounts", "abandoned_cart", "analytics"] },
  {
    title: "Operate",
    keys: ["advanced_permissions", "api_access", "webhooks", "export", "priority_support"],
  },
];

/** The limits every plan card leads with. */
export const HEADLINE_FEATURES: readonly FeatureKey[] = [
  "store_count",
  "staff_accounts",
  "product_limit",
  "media_storage",
];
