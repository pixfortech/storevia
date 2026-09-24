// Plan catalogue (ADR-0022): business reference data loaded by `pnpm db:seed`.
// Feature rows are created by migrations (their keys are code); plans are data.
// Application code never reads plan keys. It asks the entitlement engine.

export type SeedValue =
  | { readonly enabled: boolean } // BOOLEAN
  | { readonly limit: number | bigint } // LIMIT
  | { readonly unlimited: true } // LIMIT, unlimited
  | { readonly config: Record<string, unknown> }; // CONFIGURATION (enabled)

export interface SeedPlan {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
  readonly trialDays: number;
  readonly isPublic: boolean;
  /** Provider-neutral list prices in minor units (pricing metadata only). */
  readonly prices: readonly {
    readonly interval: "MONTH" | "YEAR";
    readonly currency: string;
    readonly amount: bigint;
  }[];
  /** Every feature key must appear: plans never fall back to defaults silently. */
  readonly features: Readonly<Record<string, SeedValue>>;
}

const GiB = 1024n ** 3n;
const on = { enabled: true } as const;
const off = { enabled: false } as const;

export const PLANS: readonly SeedPlan[] = [
  {
    key: "starter",
    name: "Starter",
    description: "One store and a small team.",
    sortOrder: 10,
    trialDays: 14,
    isPublic: true,
    prices: [
      { interval: "MONTH", currency: "USD", amount: 2_900n },
      { interval: "YEAR", currency: "USD", amount: 29_000n },
    ],
    features: {
      store_count: { limit: 1 },
      staff_accounts: { limit: 2 },
      product_limit: { limit: 100 },
      media_storage: { limit: 5n * GiB },
      custom_domain: on,
      visual_builder: on,
      advanced_builder: off,
      premium_themes: off,
      analytics: { config: { retentionDays: 30 } },
      discounts: on,
      abandoned_cart: off,
      api_access: off,
      webhooks: off,
      custom_code: off,
      advanced_permissions: off,
      export: on,
      priority_support: off,
    },
  },
  {
    key: "business",
    name: "Business",
    description: "Several stores, a larger team and the full builder.",
    sortOrder: 20,
    trialDays: 14,
    isPublic: true,
    prices: [
      { interval: "MONTH", currency: "USD", amount: 7_900n },
      { interval: "YEAR", currency: "USD", amount: 79_000n },
    ],
    features: {
      store_count: { limit: 3 },
      staff_accounts: { limit: 10 },
      product_limit: { unlimited: true },
      media_storage: { limit: 50n * GiB },
      custom_domain: on,
      visual_builder: on,
      advanced_builder: on,
      premium_themes: on,
      analytics: { config: { retentionDays: 365 } },
      discounts: on,
      abandoned_cart: on,
      api_access: on,
      webhooks: on,
      custom_code: off,
      advanced_permissions: on,
      export: on,
      priority_support: off,
    },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    description: "Contracted plans. Limits beyond these are set with overrides.",
    sortOrder: 30,
    trialDays: 30,
    isPublic: true,
    prices: [],
    features: {
      store_count: { limit: 10 },
      staff_accounts: { limit: 50 },
      product_limit: { unlimited: true },
      media_storage: { limit: 500n * GiB },
      custom_domain: on,
      visual_builder: on,
      advanced_builder: on,
      premium_themes: on,
      analytics: { config: { retentionDays: 730 } },
      discounts: on,
      abandoned_cart: on,
      api_access: on,
      webhooks: on,
      custom_code: on,
      advanced_permissions: on,
      export: on,
      priority_support: on,
    },
  },
];
