import "server-only";
import { withTenant } from "@storevia/database";
import {
  getUsageSummary,
  isGranted,
  loadEntitlements,
  type EntitlementSet,
  type FeatureKey,
  type GaugeFeature,
  type ResolvedEntitlement,
  type SubscriptionView,
  type UsageLine,
} from "@storevia/entitlements";
import { requirePermission, scopeOf, type TenantContext } from "./context";
import type { Permission } from "./rbac";

/**
 * What a merchant may see about their plan (docs 05 §7). Read-only: merchants
 * have no path to change a plan (ADR-0022). Source is reduced to a label so
 * provider details never reach the dashboard.
 */
export interface OrganisationBilling {
  readonly subscription:
    | (Omit<SubscriptionView, "source"> & {
        readonly managedBy: "STOREVIA" | "TEST_BILLING" | "PROVIDER";
      })
    | null;
  readonly entitlements: readonly ResolvedEntitlement[];
  readonly usage: readonly UsageLine[];
}

const MANAGED_BY = {
  MANUAL: "STOREVIA",
  MOCK: "TEST_BILLING",
  PAYMENT_PROVIDER: "PROVIDER",
} as const;

async function load(ctx: TenantContext): Promise<{ set: EntitlementSet; usage: UsageLine[] }> {
  // Organisation-wide scope even from a store context (usage spans stores).
  return withTenant({ ...scopeOf(ctx), storeId: null }, async (tx) => {
    const set = await loadEntitlements(tx, ctx.organisationId);
    return { set, usage: await getUsageSummary(tx, ctx.organisationId, set) };
  });
}

export async function getOrganisationBilling(ctx: TenantContext): Promise<OrganisationBilling> {
  requirePermission(ctx, "billing.read");
  const { set, usage } = await load(ctx);
  const sub = set.subscription;
  return {
    subscription: sub
      ? (({ source, ...rest }) => ({ ...rest, managedBy: MANAGED_BY[source] }))(sub)
      : null,
    entitlements: set.entitlements,
    usage,
  };
}

/**
 * Usage of one gauge for UI hints (e.g. "2 of 3 stores"). Not enforcement:
 * the create paths consume usage atomically. Requires the permission that
 * creating the resource needs, so it reveals nothing new to the caller.
 */
/** Who may see an allowance: the people whose action it limits. */
const ALLOWANCE_PERMISSION: Record<GaugeFeature, Permission> = {
  store_count: "store.create",
  staff_accounts: "member.manage",
  product_limit: "product.create",
  media_storage: "media.manage",
};

export async function getAllowance(ctx: TenantContext, key: GaugeFeature): Promise<UsageLine> {
  requirePermission(ctx, ALLOWANCE_PERMISSION[key]);
  const { usage } = await load(ctx);
  const line = usage.find((l) => l.key === key);
  if (!line) throw new Error(`no usage line for ${key}`);
  return line;
}

/**
 * The features the organisation's plan currently grants, for presentation
 * only (locked navigation areas, plan hints). Any member may know this: it
 * reveals no subscription, provider or usage detail. It decides nothing:
 * every server path still enforces with assertFeature / consumeUsage.
 */
export async function grantedFeatures(ctx: TenantContext): Promise<ReadonlySet<FeatureKey>> {
  const set = await withTenant({ ...scopeOf(ctx), storeId: null }, (tx) =>
    loadEntitlements(tx, ctx.organisationId),
  );
  return new Set(set.entitlements.filter((e) => isGranted(e.value)).map((e) => e.key));
}
