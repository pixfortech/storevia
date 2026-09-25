// How plan features are grouped and whether each is live yet. Plan values
// come from the database (ADR-0025); this file only adds presentation, and
// the Record type forces an entry for every feature key.
import type { FeatureKey } from "@storevia/entitlements/features";
import type { Status } from "./capabilities";

export const FEATURE_STATUS: Readonly<Record<FeatureKey, Status>> = {
  store_count: "available",
  staff_accounts: "available",
  product_limit: "available",
  media_storage: "available",
  // Moved from the catalogue milestone to Milestone 6, with webhooks (ADR-0027 §1).
  api_access: "roadmap",
  custom_domain: "roadmap",
  visual_builder: "roadmap",
  advanced_builder: "roadmap",
  premium_themes: "roadmap",
  custom_code: "roadmap",
  discounts: "roadmap",
  abandoned_cart: "roadmap",
  webhooks: "roadmap",
  analytics: "roadmap",
  // Store-limited staff access: @storevia/tenancy enforces it
  // (setMemberStoreAccess), but no dashboard screen sets it and none is
  // scheduled yet, so it isn't usable.
  advanced_permissions: "roadmap",
  export: "roadmap",
  priority_support: "roadmap",
};

/**
 * What each feature means to a customer, in the comparison table. Names and
 * limits come from the catalogue; its descriptions are written for staff
 * ("Products that are not archived."), so the site words them here.
 */
export const FEATURE_COPY: Readonly<Record<FeatureKey, string>> = {
  store_count: "Stores and sites in your organisation. Archived stores don't count.",
  staff_accounts: "Everyone in your organisation, including you.",
  product_limit: "Products in your catalogue. Archived products don't count.",
  media_storage: "Space for the images and files in your media library.",
  custom_domain: "Serve your stores on your own domain.",
  visual_builder: "Design your pages visually.",
  advanced_builder: "Advanced layout and interaction components for the builder.",
  premium_themes: "Install premium themes.",
  custom_code: "Add your own code to storefront pages.",
  discounts: "Discount codes and automatic discounts.",
  abandoned_cart: "Remind shoppers about checkouts they didn't finish.",
  analytics: "Reports on your stores, and how much history you keep.",
  advanced_permissions: "Give a team member access to selected stores only.",
  api_access: "Work with your store from your own tools, with API keys.",
  webhooks: "Tell your own systems when something changes.",
  export: "Download your data whenever you need it.",
  priority_support: "Faster replies from our team.",
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
