// Read-only presentation of the organisation's plan (billing page). It only
// rewords what getOrganisationBilling() returned: no prices, no invented
// dates, and nothing that suggests a merchant can change or pay for a plan
// here (ADR-0022).
import {
  AVAILABILITY_LABELS,
  FEATURE_AVAILABILITY,
  type Availability,
} from "@storevia/entitlements/availability";
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
 * Whether each plan feature exists today: the platform's one source of truth
 * (@storevia/entitlements/availability), shared with the marketing site. A
 * plan can include a feature before it's built, so the billing page shows a
 * planned feature as "Planned", never as included or as something to upgrade
 * for (AN-6).
 */
export { FEATURE_AVAILABILITY };

export interface EntitlementRow {
  readonly key: FeatureKey;
  readonly name: string;
  /** "Up to 3", "50 GB", "Included"… "Not included", or "Planned". */
  readonly label: string;
  /** The plan grants it and it exists: the merchant can use it. */
  readonly included: boolean;
  readonly availability: Availability;
}

/**
 * What the plan grants, as three lists: limits (counts and storage),
 * features that exist (included or not, so the page answers "can I…?"
 * either way), and planned features, which no plan can unlock yet.
 */
export function entitlementGroups(entitlements: readonly EntitlementInput[]): {
  limits: EntitlementRow[];
  features: EntitlementRow[];
  planned: EntitlementRow[];
} {
  const limits: EntitlementRow[] = [];
  const features: EntitlementRow[] = [];
  const planned: EntitlementRow[] = [];
  for (const e of entitlements) {
    const availability = FEATURE_AVAILABILITY[e.key];
    if (availability === "planned") {
      planned.push({
        key: e.key,
        name: e.name,
        label: AVAILABILITY_LABELS.planned,
        included: false,
        availability,
      });
      continue;
    }
    const label = formatEntitlement(e.key, e.value);
    const row: EntitlementRow = {
      key: e.key,
      name: e.name,
      label: label ?? "Not included",
      included: label !== null,
      availability,
    };
    (e.type === "LIMIT" ? limits : features).push(row);
  }
  return { limits, features, planned };
}
