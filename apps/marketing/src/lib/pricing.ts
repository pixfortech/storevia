// The pricing page's view of the public plan catalogue (ADR-0025). Every
// name, price and limit comes from the database; this module only formats
// and arranges them. Pure (no server imports), and unit-tested.
//
// - A Free column from the free allowance, then the public plans in
//   catalogue order.
// - Monthly and yearly prices, when the catalogue has them. No plan is
//   singled out as recommended: the catalogue has no such flag.
// - No checkout exists, so paid plans lead to a conversation.
import type { EntitlementValue } from "@storevia/entitlements";
import type { PublicCatalogue } from "@storevia/entitlements/catalogue";
import { formatEntitlement } from "@storevia/entitlements/format";
import type { FeatureKey } from "@storevia/entitlements/features";
import type { Status } from "@/content/capabilities";
import {
  FEATURE_COPY,
  FEATURE_GROUPS,
  FEATURE_STATUS,
  HEADLINE_FEATURES,
} from "@/content/plan-features";
import { formatPrice } from "./money";

export type Interval = "month" | "year";

export interface PriceView {
  /** "$29", "Custom". */
  readonly amount: string;
  /** "per month", "Priced by agreement". */
  readonly note: string;
  /** Both in one phrase for compact places: "$29 per month", "Priced by agreement". */
  readonly summary: string;
  /** "Saves $58 a year compared with monthly". */
  readonly saving?: string | undefined;
}

export interface PlanFeatureValue {
  readonly key: FeatureKey;
  readonly name: string;
  /** Formatted ("Up to 3", "5 GB", "Included"), null when not included. */
  readonly value: string | null;
  /** Present unless the feature is live today. */
  readonly status?: Status | undefined;
}

export interface PricingColumn {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly paid: boolean;
  readonly price: Readonly<Record<Interval, PriceView>>;
  /** Trial length the plan offers (arranged with our team); 0 for none. */
  readonly trialDays: number;
  readonly cta: { readonly label: string; readonly href: string; readonly external: boolean };
  /** The headline limits every card leads with. */
  readonly limits: readonly PlanFeatureValue[];
  /** What this column adds over the one before it (for Free: what it includes). */
  readonly highlights: readonly PlanFeatureValue[];
  /** The column the highlights build on ("Everything in Starter, plus"). */
  readonly buildsOn?: string | undefined;
}

export interface Pricing {
  readonly columns: readonly PricingColumn[];
  /** Whether any plan has a yearly price (the interval switch shows only then). */
  readonly hasYearly: boolean;
  /** The best yearly saving as a whole percentage, when yearly prices save anything. */
  readonly bestYearlySaving: number | null;
  /** The currency paid plans are priced in ("USD"), when there are prices. */
  readonly currency: string | null;
}

function priceOf(plan: PublicCatalogue["plans"][number], interval: "MONTH" | "YEAR") {
  return plan.prices.find((p) => p.interval === interval);
}

function view(amount: string, note: string): PriceView {
  return { amount, note, summary: `${amount} ${note}` };
}

function freePrices(currency: string | null): Record<Interval, PriceView> {
  const free = view(formatPrice(0n, currency ?? "USD"), "to start");
  return { month: free, year: free };
}

function paidPrices(plan: PublicCatalogue["plans"][number]): Record<Interval, PriceView> {
  const monthly = priceOf(plan, "MONTH");
  const yearly = priceOf(plan, "YEAR");
  if (!monthly) {
    // No list price at all, or a yearly one only: both views show the same
    // thing rather than inventing a monthly price.
    const only: PriceView = yearly
      ? view(formatPrice(yearly.amount, yearly.currency), "per year, billed yearly only")
      : { amount: "Custom", note: "Priced by agreement", summary: "Priced by agreement" };
    return { month: only, year: only };
  }
  const month = view(formatPrice(monthly.amount, monthly.currency), "per month");
  if (!yearly) return { month, year: view(month.amount, "per month, billed monthly only") };
  const saving =
    monthly.currency === yearly.currency && yearly.amount < monthly.amount * 12n
      ? monthly.amount * 12n - yearly.amount
      : null;
  return {
    month,
    year: {
      ...view(formatPrice(yearly.amount, yearly.currency), "per year"),
      saving:
        saving === null
          ? undefined
          : `Saves ${formatPrice(saving, yearly.currency)} a year compared with monthly`,
    },
  };
}

/** A column's value for every catalogue feature, formatted, in catalogue order. */
function formatted(
  catalogue: PublicCatalogue,
  values: Readonly<Record<FeatureKey, EntitlementValue>>,
): PlanFeatureValue[] {
  return catalogue.features.map((feature) => {
    const status = FEATURE_STATUS[feature.key];
    return {
      key: feature.key,
      name: feature.name,
      value: formatEntitlement(feature.key, values[feature.key]),
      ...(status === "available" ? {} : { status }),
    };
  });
}

export function pricing(catalogue: PublicCatalogue, signUpHref: string): Pricing {
  const currency = catalogue.plans.flatMap((plan) => plan.prices.map((p) => p.currency))[0] ?? null;
  const headline = new Set<FeatureKey>(HEADLINE_FEATURES);
  const byKey = (list: readonly PlanFeatureValue[]) => new Map(list.map((v) => [v.key, v]));

  const sources = [
    { values: catalogue.freeAllowance, plan: null },
    ...catalogue.plans.map((plan) => ({ values: plan.values, plan })),
  ];
  const all = sources.map((source) => formatted(catalogue, source.values));

  const columns = sources.map(({ plan }, index): PricingColumn => {
    const values = all[index] ?? [];
    const previous = index > 0 ? byKey(all[index - 1] ?? []) : null;
    const limits = HEADLINE_FEATURES.map((key) => byKey(values).get(key)).filter(
      (v): v is PlanFeatureValue => v !== undefined,
    );
    // Free lists what it includes; each plan after it lists what it adds or improves.
    const highlights = values.filter(
      (v) =>
        !headline.has(v.key) &&
        v.value !== null &&
        (previous === null || previous.get(v.key)?.value !== v.value),
    );
    if (!plan) {
      return {
        id: "free",
        name: "Free",
        description: "Everything you need to start, on your own.",
        paid: false,
        price: freePrices(currency),
        trialDays: 0,
        cta: { label: "Start free", href: signUpHref, external: true },
        limits,
        highlights,
      };
    }
    return {
      id: plan.key,
      name: plan.name,
      description: plan.description ?? "",
      paid: true,
      price: paidPrices(plan),
      trialDays: plan.trialDays,
      cta: {
        label: "Talk to us",
        href: `/contact?topic=plans&plan=${encodeURIComponent(plan.name)}`,
        external: false,
      },
      limits,
      highlights,
      buildsOn: index > 0 ? (sources[index - 1]?.plan?.name ?? "Free") : undefined,
    };
  });

  let best: number | null = null;
  for (const plan of catalogue.plans) {
    const monthly = priceOf(plan, "MONTH");
    const yearly = priceOf(plan, "YEAR");
    if (!monthly || yearly?.currency !== monthly.currency) continue;
    const full = monthly.amount * 12n;
    if (full <= 0n || yearly.amount >= full) continue;
    const percent = Math.round((Number(full - yearly.amount) / Number(full)) * 100);
    best = Math.max(best ?? 0, percent);
  }

  return {
    columns,
    hasYearly: catalogue.plans.some((plan) => priceOf(plan, "YEAR") !== undefined),
    bestYearlySaving: best,
    currency,
  };
}

export interface ComparisonRow {
  readonly key: FeatureKey;
  readonly name: string;
  readonly description: string;
  readonly status?: Status | undefined;
  /** One value per column, in pricing() order; null when not included. */
  readonly values: readonly (string | null)[];
}

export interface ComparisonGroup {
  readonly title: string;
  readonly rows: readonly ComparisonRow[];
}

/** Every catalogue feature in its comparison group, with each column's value. */
export function comparison(catalogue: PublicCatalogue): ComparisonGroup[] {
  const features = new Map(catalogue.features.map((f) => [f.key, f]));
  const columns = [catalogue.freeAllowance, ...catalogue.plans.map((p) => p.values)];
  return FEATURE_GROUPS.map((group) => ({
    title: group.title,
    rows: group.keys.flatMap((key): ComparisonRow[] => {
      const feature = features.get(key);
      if (!feature) return [];
      const status = FEATURE_STATUS[key];
      return [
        {
          key,
          name: feature.name,
          description: FEATURE_COPY[key],
          ...(status === "available" ? {} : { status }),
          values: columns.map((values) => formatEntitlement(key, values[key])),
        },
      ];
    }),
  })).filter((group) => group.rows.length > 0);
}

/**
 * Which plans include a feature, in a few words: "All plans", "All plans,
 * limits vary", "Paid plans" or "Business and Enterprise". Null when the
 * catalogue doesn't have the feature.
 */
export function planAvailability(catalogue: PublicCatalogue, key: FeatureKey): string | null {
  if (!catalogue.features.some((f) => f.key === key)) return null;
  const columns = [
    { name: "Free", values: catalogue.freeAllowance },
    ...catalogue.plans.map((plan) => ({ name: plan.name, values: plan.values })),
  ];
  const labels = columns.map((c) => formatEntitlement(key, c.values[key]));
  const included = columns.filter((_, index) => labels[index] !== null);
  if (included.length === 0) return "Not in current plans";
  if (included.length === columns.length) {
    return new Set(labels).size === 1 ? "All plans" : "All plans, limits vary";
  }
  if (labels[0] === null && included.length === columns.length - 1) return "Paid plans";
  const names = included.map((c) => c.name);
  return names.length === 1
    ? `${names[0] ?? ""} only`
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}
