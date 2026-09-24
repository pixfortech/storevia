import "server-only";
import { withTenant } from "@storevia/database";
import {
  getUsageSummary,
  loadEntitlements,
  type EntitlementSet,
  type GaugeFeature,
  type ResolvedEntitlement,
  type SubscriptionView,
  type UsageLine,
} from "@storevia/entitlements";
import { requirePermission, scopeOf, type TenantContext } from "./context";

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
export async function getAllowance(ctx: TenantContext, key: GaugeFeature): Promise<UsageLine> {
  requirePermission(ctx, key === "store_count" ? "store.create" : "member.manage");
  const { usage } = await load(ctx);
  const line = usage.find((l) => l.key === key);
  if (!line) throw new Error(`no usage line for ${key}`);
  return line;
}
