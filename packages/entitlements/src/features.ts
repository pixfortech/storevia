// Feature keys (ADR-0022). The Feature rows are inserted by migrations; a test
// asserts this list and the database agree exactly. Client-safe: no server
// imports, so the dashboard may use the keys and labels for display.

export const FEATURE_KEYS = [
  "store_count",
  "staff_accounts",
  "product_limit",
  "media_storage",
  "custom_domain",
  "visual_builder",
  "advanced_builder",
  "premium_themes",
  "analytics",
  "discounts",
  "abandoned_cart",
  "api_access",
  "webhooks",
  "custom_code",
  "advanced_permissions",
  "export",
  "priority_support",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

/**
 * Gauge features: usage is a count of live rows, kept in UsageCounter by the
 * code that creates and removes those rows, and recomputable from them
 * (reconcileUsage). Stores and staff from Milestone 2; products and media
 * storage (bytes) from Milestone 3 (ADR-0027).
 */
export const GAUGE_FEATURES = [
  "store_count",
  "staff_accounts",
  "product_limit",
  "media_storage",
] as const satisfies readonly FeatureKey[];

export type GaugeFeature = (typeof GAUGE_FEATURES)[number];
