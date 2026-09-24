// The public plan catalogue (ADR-0025): what the pricing page shows. Read
// straight from the Plan / Feature tables, so pricing changes are data, not
// code. Public and ACTIVE plans only; values are resolved by the same engine
// that enforces them, so the page can't promise something the product won't
// grant.
import "server-only";
import type { PrismaClient } from "@storevia/database";
import { toValue, type EntitlementValue, type FeatureType } from "./engine";
import { isFeatureKey, type FeatureKey } from "./features";

export interface CatalogueFeature {
  readonly key: FeatureKey;
  readonly name: string;
  readonly description: string | null;
  readonly type: FeatureType;
}

export interface CataloguePrice {
  readonly interval: "MONTH" | "YEAR";
  readonly currency: string;
  /** Minor units (e.g. cents). */
  readonly amount: bigint;
}

export interface CataloguePlan {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly trialDays: number;
  /** Active list prices; empty means priced by agreement. */
  readonly prices: readonly CataloguePrice[];
  readonly values: Readonly<Record<FeatureKey, EntitlementValue>>;
}

export interface PublicCatalogue {
  /** Features in display order. */
  readonly features: readonly CatalogueFeature[];
  /** What an organisation gets with no plan (the system defaults). */
  readonly freeAllowance: Readonly<Record<FeatureKey, EntitlementValue>>;
  readonly plans: readonly CataloguePlan[];
}

export async function loadPublicCatalogue(
  db: Pick<PrismaClient, "plan" | "feature">,
): Promise<PublicCatalogue> {
  const [featureRows, planRows] = await Promise.all([
    db.feature.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }),
    db.plan.findMany({
      where: { isPublic: true, status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
      include: {
        prices: { where: { active: true }, orderBy: [{ interval: "asc" }, { currency: "asc" }] },
        features: true,
      },
    }),
  ]);
  const features = featureRows.filter((row): row is typeof row & { key: FeatureKey } =>
    isFeatureKey(row.key),
  );
  const freeAllowance = Object.fromEntries(
    features.map((f) => [
      f.key,
      toValue(f.type, {
        enabled: f.defaultEnabled,
        limit: f.defaultLimit,
        unlimited: f.defaultUnlimited,
        config: f.defaultConfig,
      }),
    ]),
  ) as Record<FeatureKey, EntitlementValue>;
  const plans = planRows.map((plan) => {
    const byFeature = new Map(plan.features.map((pf) => [pf.featureId, pf]));
    const values = Object.fromEntries(
      features.map((f) => {
        const row = byFeature.get(f.id);
        // A plan without a row falls back to the default, as resolution does.
        return [f.key, row ? toValue(f.type, row) : freeAllowance[f.key]];
      }),
    ) as Record<FeatureKey, EntitlementValue>;
    return {
      key: plan.key,
      name: plan.name,
      description: plan.description,
      trialDays: plan.trialDays,
      prices: plan.prices.map((p) => ({
        interval: p.interval,
        currency: p.currency,
        amount: p.amount,
      })),
      values,
    };
  });
  return {
    features: features.map((f) => ({
      key: f.key,
      name: f.name,
      description: f.description,
      type: f.type,
    })),
    freeAllowance,
    plans,
  };
}
