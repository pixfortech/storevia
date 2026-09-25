// Read-only presentation of the organisation's plan (billing page). It only
// rewords what getOrganisationBilling() returned: no prices, no invented
// dates, and nothing that suggests a merchant can change or pay for a plan
// here (ADR-0022).
import { formatEntitlement } from "@storevia/entitlements/format";
import type { EntitlementValue } from "@storevia/entitlements";
import type { FeatureKey } from "@storevia/entitlements/features";
import { formatLongDate } from "./dates";

export const MANAGED_BY_LABEL = {
  STOREVIA: "Managed by Storevia",
  TEST_BILLING: "Test billing (simulated)",
  PROVIDER: "Billed online",
} as const;

export function intervalLabel(interval: "MONTH" | "YEAR" | null): string {
  if (interval === "YEAR") return "Annual";
  if (interval === "MONTH") return "Monthly";
  return "By agreement";
}

export interface PlanFactsInput {
  readonly status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  readonly billingInterval: "MONTH" | "YEAR" | null;
  readonly startedAt: Date;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly expiresAt: Date | null;
  readonly entitling: boolean;
}

export interface Fact {
  readonly term: string;
  readonly detail: string;
}

/** The plan's dates and terms, in reading order. Only dates that exist are listed. */
export function planFacts(sub: PlanFactsInput): Fact[] {
  const facts: Fact[] = [{ term: "Billing", detail: intervalLabel(sub.billingInterval) }];
  facts.push({ term: "Started", detail: formatLongDate(sub.startedAt) });
  if (sub.status === "TRIAL" && sub.trialEndsAt) {
    facts.push({ term: "Trial ends", detail: formatLongDate(sub.trialEndsAt) });
  }
  if (sub.status !== "CANCELLED" && sub.currentPeriodEnd) {
    facts.push({ term: "Renews", detail: formatLongDate(sub.currentPeriodEnd) });
  }
  if (sub.expiresAt) {
    facts.push({
      term: sub.status === "CANCELLED" ? "Access ends" : "Expires",
      detail: formatLongDate(sub.expiresAt),
    });
  }
  if (!sub.entitling)
    facts.push({ term: "Plan features", detail: "Ended. Free allowance applies" });
  return facts;
}

export interface EntitlementInput {
  readonly key: FeatureKey;
  readonly name: string;
  readonly type: "BOOLEAN" | "LIMIT" | "CONFIGURATION";
  readonly value: EntitlementValue;
}

/**
 * When each plan feature can actually be used: null once it works in the
 * dashboard today, otherwise its scheduled milestone or "On the roadmap"
 * (docs/roadmap/implementation-roadmap.md). A plan can include a feature
 * before it's built, so the billing page shows both: "Included" is the
 * entitlement, this is whether it exists yet. The Record type forces an
 * entry for every feature key.
 */
export const FEATURE_AVAILABILITY: Readonly<Record<FeatureKey, string | null>> = {
  store_count: null,
  staff_accounts: null,
  product_limit: null,
  media_storage: null,
  // The Admin API was planned with the catalogue; it follows in a later release.
  api_access: "On the roadmap",
  visual_builder: "Coming in Milestone 5",
  discounts: "Coming in Milestone 6",
  custom_domain: "Coming in Milestone 7",
  export: "Coming in Milestone 8",
  advanced_builder: "On the roadmap",
  premium_themes: "On the roadmap",
  custom_code: "On the roadmap",
  abandoned_cart: "On the roadmap",
  webhooks: "On the roadmap",
  analytics: "On the roadmap",
  // Enforced by @storevia/tenancy, but no dashboard screen sets it yet.
  advanced_permissions: "On the roadmap",
  priority_support: "On the roadmap",
};

export interface EntitlementRow {
  readonly key: FeatureKey;
  readonly name: string;
  /** "Up to 3", "50 GB", "Included"… or "Not included". */
  readonly label: string;
  readonly included: boolean;
  /** Null when the feature works today; otherwise when it's planned. */
  readonly availability: string | null;
}

/**
 * What the plan grants, as two lists: limits (counts and storage) and
 * features. Features the plan doesn't include stay listed, marked "Not
 * included", so the page answers "can I…?" either way.
 */
export function entitlementGroups(entitlements: readonly EntitlementInput[]): {
  limits: EntitlementRow[];
  features: EntitlementRow[];
} {
  const limits: EntitlementRow[] = [];
  const features: EntitlementRow[] = [];
  for (const e of entitlements) {
    const label = formatEntitlement(e.key, e.value);
    const row: EntitlementRow = {
      key: e.key,
      name: e.name,
      label: label ?? "Not included",
      included: label !== null,
      availability: FEATURE_AVAILABILITY[e.key],
    };
    (e.type === "LIMIT" ? limits : features).push(row);
  }
  return { limits, features };
}
