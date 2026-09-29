// How plan features are grouped and whether each is live yet. Plan values
// come from the database (ADR-0025); whether each feature exists comes from
// the platform's one source of truth (@storevia/entitlements/availability),
// which the dashboard's billing page reads too. This file only adds
// presentation, and the Record types force an entry for every feature key.
import { FEATURE_AVAILABILITY } from "@storevia/entitlements/availability";
import { FEATURE_KEYS, type FeatureKey } from "@storevia/entitlements/features";
import { statusOf, type Status } from "./capabilities";

/** Each plan feature's status on the site, derived from the platform's availability. */
export const FEATURE_STATUS: Readonly<Record<FeatureKey, Status>> = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, statusOf(FEATURE_AVAILABILITY[key])]),
) as Record<FeatureKey, Status>;

/**
 * What each feature means to a customer, in the comparison table. Names and
 * limits come from the catalogue; its descriptions are written for staff
 * ("Products that are not archived."), so the site words them here. Words
 * for a feature that isn't built describe the plan, never a working product.
 */
export const FEATURE_COPY: Readonly<Record<FeatureKey, string>> = {
  store_count: "Stores in your organisation. Archived stores don't count.",
  staff_accounts: "Everyone in your organisation, including you.",
  product_limit: "Products in your catalogue. Archived products don't count.",
  media_storage: "Space for the images and files in your media library.",
  custom_domain: "Serve your stores on your own domain, with automatic HTTPS.",
  visual_builder: "Design your pages visually.",
  advanced_builder: "Advanced layout and interaction components for the builder.",
  premium_themes: "Install premium themes.",
  custom_code: "Add your own code to storefront pages.",
  discounts: "Discount codes: a percentage or a fixed amount off, with dates and usage limits.",
  abandoned_cart: "Remind shoppers about checkouts they didn't finish.",
  analytics: "Storefront traffic and sales reports, and how much history you keep.",
  advanced_permissions: "Give a team member access to selected stores only.",
  api_access: "Work with your store from your own tools, with API keys.",
  webhooks: "Tell your own systems when something changes.",
  export: "Download your organisation's data, and export products as CSV.",
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
