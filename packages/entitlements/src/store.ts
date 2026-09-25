import "server-only";
import type { TenantTx } from "@storevia/database";
import { DomainError } from "@storevia/types";
import {
  fitsLimit,
  isEntitling,
  isGranted,
  isOverLimit,
  limitOf,
  resolveFeature,
  type EntitlementValue,
  type FeatureRow,
  type OverrideRow,
  type ResolvedEntitlement,
  type SubscriptionStatus,
  type ValueColumns,
} from "./engine";
import { GAUGE_FEATURES, isFeatureKey, type FeatureKey, type GaugeFeature } from "./features";

/**
 * A transaction or client. Merchant paths pass their `withTenant` transaction
 * (RLS-scoped to the organisation); staff and webhook paths pass the platform
 * or system client. Every query below also filters by organisationId, so the
 * result is the same under either.
 */
export type Db = TenantTx;

export interface UsageOptions {
  readonly amount?: bigint;
  /** "" for organisation-wide usage, or a storeId for per-store usage. */
  readonly scopeKey?: string;
  /** "all" for gauges; a period key such as "2026-09" for metered usage. */
  readonly period?: string;
}

export interface SubscriptionView {
  readonly id: string;
  readonly status: SubscriptionStatus;
  readonly source: "MANUAL" | "MOCK" | "PAYMENT_PROVIDER";
  readonly planId: string;
  readonly planName: string;
  readonly billingInterval: "MONTH" | "YEAR" | null;
  readonly startedAt: Date;
  readonly trialStartsAt: Date | null;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly expiresAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly pastDueSince: Date | null;
  readonly graceEndsAt: Date | null;
  /** Grants its plan's entitlements right now (the time-aware rule). */
  readonly entitling: boolean;
}

export interface EntitlementSet {
  readonly organisationId: string;
  readonly resolvedAt: Date;
  /** The live (non-expired) subscription, entitling or not. */
  readonly subscription: SubscriptionView | null;
  /** Every feature, in display order. */
  readonly entitlements: readonly ResolvedEntitlement[];
  get(key: FeatureKey): ResolvedEntitlement;
}

export interface UsageLine {
  readonly key: GaugeFeature;
  readonly name: string;
  readonly usage: bigint;
  readonly limit: bigint | "unlimited";
  readonly overLimit: boolean;
}

// --- loading -----------------------------------------------------------------

const featureSelect = {
  id: true,
  key: true,
  name: true,
  type: true,
  sortOrder: true,
  defaultEnabled: true,
  defaultLimit: true,
  defaultUnlimited: true,
  defaultConfig: true,
} as const;

interface FeatureRecord {
  id: string;
  key: string;
  name: string;
  type: FeatureRow["type"];
  sortOrder: number;
  defaultEnabled: boolean;
  defaultLimit: bigint | null;
  defaultUnlimited: boolean;
  defaultConfig: unknown;
}

function toFeatureRow(row: FeatureRecord): FeatureRow | null {
  if (!isFeatureKey(row.key)) return null; // not part of this code version
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    sortOrder: row.sortOrder,
    defaults: {
      enabled: row.defaultEnabled,
      limit: row.defaultLimit,
      unlimited: row.defaultUnlimited,
      config: row.defaultConfig,
    },
  };
}

// The app role may read only these override columns (not reason or author).
const overrideSelect = {
  featureId: true,
  enabled: true,
  limit: true,
  unlimited: true,
  config: true,
  expiresAt: true,
} as const;

const subscriptionSelect = {
  id: true,
  status: true,
  source: true,
  planId: true,
  billingInterval: true,
  startedAt: true,
  trialStartsAt: true,
  trialEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  expiresAt: true,
  cancelledAt: true,
  pastDueSince: true,
  graceEndsAt: true,
  plan: { select: { name: true } },
} as const;

/** The organisation's live subscription (at most one exists). */
export async function loadLiveSubscription(
  db: Db,
  organisationId: string,
  now: Date = new Date(),
): Promise<SubscriptionView | null> {
  const row = await db.subscription.findFirst({
    where: { organisationId, status: { not: "EXPIRED" } },
    select: subscriptionSelect,
  });
  if (!row) return null;
  const { plan, ...rest } = row;
  return { ...rest, planName: plan.name, entitling: isEntitling(rest, now) };
}

async function resolveAll(
  db: Db,
  organisationId: string,
  planId: string | null,
  now: Date,
): Promise<ResolvedEntitlement[]> {
  const features = (
    await db.feature.findMany({ select: featureSelect, orderBy: { sortOrder: "asc" } })
  )
    .map(toFeatureRow)
    .filter((f): f is FeatureRow => f !== null);
  const planValues = new Map<string, ValueColumns>();
  if (planId) {
    const rows = await db.planFeature.findMany({
      where: { planId },
      select: { featureId: true, enabled: true, limit: true, unlimited: true, config: true },
    });
    for (const row of rows) planValues.set(row.featureId, row);
  }
  const overrides = new Map<string, OverrideRow>(
    (
      await db.organisationFeatureOverride.findMany({
        where: { organisationId },
        select: overrideSelect,
      })
    ).map((row) => [row.featureId, row]),
  );
  return features.map((f) => resolveFeature(f, planValues.get(f.id), overrides.get(f.id), now));
}

function toSet(
  organisationId: string,
  now: Date,
  subscription: SubscriptionView | null,
  entitlements: ResolvedEntitlement[],
): EntitlementSet {
  const byKey = new Map(entitlements.map((e) => [e.key, e]));
  return {
    organisationId,
    resolvedAt: now,
    subscription,
    entitlements,
    get(key) {
      const found = byKey.get(key);
      if (!found) throw new Error(`feature ${key} is missing from the database`);
      return found;
    },
  };
}

/** Resolves every feature for an organisation (a few indexed queries). */
export async function loadEntitlements(
  db: Db,
  organisationId: string,
  now: Date = new Date(),
): Promise<EntitlementSet> {
  const subscription = await loadLiveSubscription(db, organisationId, now);
  const planId = subscription?.entitling ? subscription.planId : null;
  return toSet(
    organisationId,
    now,
    subscription,
    await resolveAll(db, organisationId, planId, now),
  );
}

/**
 * What the organisation's gauges would look like on another plan (null = no
 * entitling subscription), keeping its overrides. Used for the over-limit
 * pre-check before a plan change or expiry; never blocks by itself.
 */
export async function previewUsageForPlan(
  db: Db,
  organisationId: string,
  planId: string | null,
  now: Date = new Date(),
): Promise<UsageLine[]> {
  const set = toSet(organisationId, now, null, await resolveAll(db, organisationId, planId, now));
  return getUsageSummary(db, organisationId, set);
}

/** Resolves one feature (hot paths: consumption and gating). */
export async function resolveEntitlement(
  db: Db,
  organisationId: string,
  key: FeatureKey,
  now: Date = new Date(),
): Promise<ResolvedEntitlement & { readonly featureId: string }> {
  const record = await db.feature.findUnique({ where: { key }, select: featureSelect });
  const feature = record ? toFeatureRow(record) : null;
  if (!feature) throw new Error(`feature ${key} is missing from the database`);
  // Sequential: a transaction runs on one connection.
  const subscription = await loadLiveSubscription(db, organisationId, now);
  const override = await db.organisationFeatureOverride.findUnique({
    where: { organisationId_featureId: { organisationId, featureId: feature.id } },
    select: overrideSelect,
  });
  const planValue = subscription?.entitling
    ? await db.planFeature.findUnique({
        where: { planId_featureId: { planId: subscription.planId, featureId: feature.id } },
        select: { enabled: true, limit: true, unlimited: true, config: true },
      })
    : null;
  return {
    ...resolveFeature(feature, planValue ?? undefined, override ?? undefined, now),
    featureId: feature.id,
  };
}

// --- questions ---------------------------------------------------------------

export function entitlementRequired(name: string): DomainError {
  return new DomainError(
    "ENTITLEMENT_REQUIRED",
    `Your plan doesn't include ${name.toLowerCase()}.`,
  );
}

export function limitReached(name: string, limit: bigint): DomainError {
  return new DomainError(
    "LIMIT_REACHED",
    `Your plan's limit for ${name.toLowerCase()} (${limit.toString()}) has been reached.`,
  );
}

export async function hasFeature(
  db: Db,
  organisationId: string,
  key: FeatureKey,
): Promise<boolean> {
  return isGranted((await resolveEntitlement(db, organisationId, key)).value);
}

/** Throws ENTITLEMENT_REQUIRED unless the feature is granted. */
export async function assertFeature(
  db: Db,
  organisationId: string,
  key: FeatureKey,
): Promise<void> {
  const resolved = await resolveEntitlement(db, organisationId, key);
  if (!isGranted(resolved.value)) throw entitlementRequired(resolved.name);
}

export async function getFeatureLimit(
  db: Db,
  organisationId: string,
  key: FeatureKey,
): Promise<bigint | "unlimited"> {
  return limitOf((await resolveEntitlement(db, organisationId, key)).value);
}

export async function getFeatureValue(
  db: Db,
  organisationId: string,
  key: FeatureKey,
): Promise<EntitlementValue> {
  return (await resolveEntitlement(db, organisationId, key)).value;
}

async function featureId(db: Db, key: FeatureKey): Promise<string> {
  const row = await db.feature.findUnique({ where: { key }, select: { id: true } });
  if (!row) throw new Error(`feature ${key} is missing from the database`);
  return row.id;
}

export async function getUsage(
  db: Db,
  organisationId: string,
  key: FeatureKey,
  options: UsageOptions = {},
): Promise<bigint> {
  const row = await db.usageCounter.findUnique({
    where: {
      organisationId_featureId_scopeKey_period: {
        organisationId,
        featureId: await featureId(db, key),
        scopeKey: options.scopeKey ?? "",
        period: options.period ?? "all",
      },
    },
    select: { value: true },
  });
  return row?.value ?? 0n;
}

/** Non-locking check, for UI hints and pre-checks. Enforcement is consumeUsage. */
export async function canConsume(
  db: Db,
  organisationId: string,
  key: FeatureKey,
  options: UsageOptions = {},
): Promise<boolean> {
  const resolved = await resolveEntitlement(db, organisationId, key);
  const usage = await getUsage(db, organisationId, key, options);
  return fitsLimit(limitOf(resolved.value), usage, options.amount ?? 1n);
}

// --- enforcement -------------------------------------------------------------

async function lockCounter(
  db: Db,
  organisationId: string,
  key: FeatureKey,
  id: string,
  scopeKey: string,
  period: string,
): Promise<bigint> {
  const existing = await db.usageCounter.findUnique({
    where: {
      organisationId_featureId_scopeKey_period: { organisationId, featureId: id, scopeKey, period },
    },
    select: { value: true },
  });
  if (!existing) {
    // A missing organisation-wide gauge starts from the real row count, so
    // resources created before the counter existed (e.g. during a rolling
    // deploy) are never forgotten. Callers hold an organisation-wide scope.
    const gauge = (GAUGE_FEATURES as readonly FeatureKey[]).includes(key);
    const initial =
      gauge && scopeKey === "" && period === "all"
        ? await countSource(db, organisationId, key as GaugeFeature)
        : 0n;
    await db.$executeRaw`
      INSERT INTO "UsageCounter" ("organisationId", "featureId", "scopeKey", period, value, "updatedAt")
      VALUES (${organisationId}::uuid, ${id}::uuid, ${scopeKey}, ${period}, ${initial}, now())
      ON CONFLICT DO NOTHING`;
  }
  const rows = await db.$queryRaw<{ value: bigint }[]>`
    SELECT value FROM "UsageCounter"
    WHERE "organisationId" = ${organisationId}::uuid AND "featureId" = ${id}::uuid
      AND "scopeKey" = ${scopeKey} AND period = ${period}
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error("usage counter row is not visible in this scope");
  return row.value;
}

/**
 * Atomically checks the limit and records consumption, in the caller's
 * transaction that creates the resource. The counter row lock serialises
 * concurrent creators, so N parallel requests against a limit L succeed
 * exactly L times. Throws LIMIT_REACHED; the caller's transaction rolls back.
 */
export async function consumeUsage(
  db: Db,
  organisationId: string,
  key: FeatureKey,
  options: UsageOptions = {},
): Promise<void> {
  const amount = options.amount ?? 1n;
  if (amount <= 0n) throw new Error("consumeUsage: amount must be positive");
  const scopeKey = options.scopeKey ?? "";
  const period = options.period ?? "all";
  const id = await featureId(db, key);
  // Lock first, then resolve, so the limit is read after concurrent creators.
  const usage = await lockCounter(db, organisationId, key, id, scopeKey, period);
  const resolved = await resolveEntitlement(db, organisationId, key);
  const limit = limitOf(resolved.value);
  if (!fitsLimit(limit, usage, amount)) {
    throw limitReached(resolved.name, limit === "unlimited" ? 0n : limit);
  }
  await db.$executeRaw`
    UPDATE "UsageCounter" SET value = value + ${amount}, "updatedAt" = now()
    WHERE "organisationId" = ${organisationId}::uuid AND "featureId" = ${id}::uuid
      AND "scopeKey" = ${scopeKey} AND period = ${period}`;
}

/** Records that a counted resource was removed (never below zero). */
export async function releaseUsage(
  db: Db,
  organisationId: string,
  key: FeatureKey,
  options: UsageOptions = {},
): Promise<void> {
  const amount = options.amount ?? 1n;
  const id = await featureId(db, key);
  await db.$executeRaw`
    UPDATE "UsageCounter" SET value = GREATEST(value - ${amount}, 0), "updatedAt" = now()
    WHERE "organisationId" = ${organisationId}::uuid AND "featureId" = ${id}::uuid
      AND "scopeKey" = ${options.scopeKey ?? ""} AND period = ${options.period ?? "all"}`;
}

// --- usage summary and reconciliation ----------------------------------------

/** Usage of every gauge feature against its resolved limit. */
export async function getUsageSummary(
  db: Db,
  organisationId: string,
  entitlements?: EntitlementSet,
): Promise<UsageLine[]> {
  const set = entitlements ?? (await loadEntitlements(db, organisationId));
  const lines: UsageLine[] = [];
  for (const key of GAUGE_FEATURES) {
    const resolved = set.get(key);
    const usage = await getUsage(db, organisationId, key);
    const limit = limitOf(resolved.value);
    lines.push({ key, name: resolved.name, usage, limit, overLimit: isOverLimit(limit, usage) });
  }
  return lines;
}

/** How each gauge is counted from its source table. */
async function countSource(db: Db, organisationId: string, key: GaugeFeature): Promise<bigint> {
  switch (key) {
    case "store_count":
      return BigInt(
        await db.store.count({ where: { organisationId, status: { not: "ARCHIVED" } } }),
      );
    case "staff_accounts":
      return BigInt(await db.membership.count({ where: { organisationId } }));
    // Products and media are store-scoped rows, and merchant requests run in
    // one store's RLS scope, so these count through SECURITY DEFINER
    // functions that sum across the organisation's stores (migration
    // 20260928000000). They refuse any organisation but the caller's.
    case "product_limit":
      return scalar(
        await db.$queryRaw<
          { n: bigint }[]
        >`SELECT app_usage_live_products(${organisationId}::uuid) AS n`,
      );
    case "media_storage":
      return scalar(
        await db.$queryRaw<
          { n: bigint }[]
        >`SELECT app_usage_media_bytes(${organisationId}::uuid) AS n`,
      );
  }
}

function scalar(rows: readonly { n: bigint }[]): bigint {
  return rows[0]?.n ?? 0n;
}

export interface Drift {
  readonly key: GaugeFeature;
  readonly recorded: bigint;
  readonly actual: bigint;
}

/**
 * Recomputes gauge counters from their source tables and corrects drift.
 * Must run with an organisation-wide scope (not a store scope). Returns the
 * counters that were wrong, so callers can log/alert.
 */
export async function reconcileUsage(db: Db, organisationId: string): Promise<Drift[]> {
  const drift: Drift[] = [];
  for (const key of GAUGE_FEATURES) {
    const id = await featureId(db, key);
    const recorded = await lockCounter(db, organisationId, key, id, "", "all");
    const actual = await countSource(db, organisationId, key);
    if (recorded !== actual) {
      drift.push({ key, recorded, actual });
      await db.$executeRaw`
        UPDATE "UsageCounter" SET value = ${actual}, "updatedAt" = now()
        WHERE "organisationId" = ${organisationId}::uuid AND "featureId" = ${id}::uuid
          AND "scopeKey" = '' AND period = 'all'`;
    }
  }
  return drift;
}
