// Pure entitlement resolution (ADR-0022 §2, §4). No I/O: the database layer
// (store.ts) loads rows and calls these functions, so the rules are unit
// tested exhaustively and are identical for every caller and every
// subscription source.
import type { FeatureKey } from "./features";

export type FeatureType = "BOOLEAN" | "LIMIT" | "CONFIGURATION";
export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
export type JsonObject = Readonly<Record<string, unknown>>;

/** The four entitlement kinds features can be granted as. */
export type EntitlementValue =
  | { readonly kind: "BOOLEAN"; readonly enabled: boolean }
  | { readonly kind: "LIMIT"; readonly limit: bigint }
  | { readonly kind: "UNLIMITED" }
  | { readonly kind: "CONFIGURATION"; readonly enabled: boolean; readonly config: JsonObject };

/** Where a resolved value came from (shown to staff; never used for decisions). */
export type EntitlementOrigin = "OVERRIDE" | "PLAN" | "DEFAULT";

/** A stored value row: Feature defaults, PlanFeature or an override. */
export interface ValueColumns {
  readonly enabled: boolean;
  readonly limit: bigint | null;
  readonly unlimited: boolean;
  readonly config: unknown;
}

export interface FeatureRow {
  readonly id: string;
  readonly key: FeatureKey;
  readonly name: string;
  readonly type: FeatureType;
  readonly sortOrder: number;
  readonly defaults: ValueColumns;
}

export interface OverrideRow extends ValueColumns {
  readonly featureId: string;
  readonly expiresAt: Date | null;
}

/** The subscription columns that decide whether it grants entitlements. */
export interface EntitlingFields {
  readonly status: SubscriptionStatus;
  readonly trialEndsAt: Date | null;
  readonly expiresAt: Date | null;
  readonly graceEndsAt: Date | null;
}

export interface ResolvedEntitlement {
  readonly key: FeatureKey;
  readonly name: string;
  readonly type: FeatureType;
  readonly value: EntitlementValue;
  readonly origin: EntitlementOrigin;
  /** Set when an override applies and has an expiry. */
  readonly overrideExpiresAt: Date | null;
}

/**
 * The single rule deciding whether a subscription grants its plan's
 * entitlements at `now`. It is time-aware (a late expiry sweep can never
 * extend access) and deliberately does not look at the subscription source.
 */
export function isEntitling(sub: EntitlingFields | null, now: Date): boolean {
  if (!sub) return false;
  const before = (end: Date | null) => end !== null && now.getTime() < end.getTime();
  switch (sub.status) {
    case "TRIAL":
      return before(sub.trialEndsAt);
    case "ACTIVE":
      return sub.expiresAt === null || before(sub.expiresAt);
    case "PAST_DUE":
      return before(sub.graceEndsAt);
    case "CANCELLED":
      return before(sub.expiresAt);
    case "EXPIRED":
      return false;
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Interprets stored columns for a feature type. Inconsistent rows fail closed. */
export function toValue(type: FeatureType, row: ValueColumns): EntitlementValue {
  switch (type) {
    case "BOOLEAN":
      return { kind: "BOOLEAN", enabled: row.enabled };
    case "LIMIT":
      if (!row.enabled) return { kind: "LIMIT", limit: 0n };
      if (row.unlimited) return { kind: "UNLIMITED" };
      return { kind: "LIMIT", limit: row.limit !== null && row.limit > 0n ? row.limit : 0n };
    case "CONFIGURATION":
      return isJsonObject(row.config)
        ? { kind: "CONFIGURATION", enabled: row.enabled, config: row.config }
        : { kind: "CONFIGURATION", enabled: false, config: {} };
  }
}

export function isOverrideActive(override: { expiresAt: Date | null }, now: Date): boolean {
  return override.expiresAt === null || now.getTime() < override.expiresAt.getTime();
}

/**
 * Resolution precedence per feature: unexpired override → plan of the
 * entitling subscription → system default.
 */
export function resolveFeature(
  feature: FeatureRow,
  planValue: ValueColumns | undefined,
  override: OverrideRow | undefined,
  now: Date,
): ResolvedEntitlement {
  const base = { key: feature.key, name: feature.name, type: feature.type };
  if (override && isOverrideActive(override, now)) {
    return {
      ...base,
      value: toValue(feature.type, override),
      origin: "OVERRIDE",
      overrideExpiresAt: override.expiresAt,
    };
  }
  if (planValue) {
    return {
      ...base,
      value: toValue(feature.type, planValue),
      origin: "PLAN",
      overrideExpiresAt: null,
    };
  }
  return {
    ...base,
    value: toValue(feature.type, feature.defaults),
    origin: "DEFAULT",
    overrideExpiresAt: null,
  };
}

/** Whether the value grants the feature at all. */
export function isGranted(value: EntitlementValue): boolean {
  switch (value.kind) {
    case "BOOLEAN":
    case "CONFIGURATION":
      return value.enabled;
    case "LIMIT":
      return value.limit > 0n;
    case "UNLIMITED":
      return true;
  }
}

/** Numeric limit of a value, "unlimited", or 0n for non-limit features that are off. */
export function limitOf(value: EntitlementValue): bigint | "unlimited" {
  switch (value.kind) {
    case "LIMIT":
      return value.limit;
    case "UNLIMITED":
      return "unlimited";
    case "BOOLEAN":
    case "CONFIGURATION":
      return isGranted(value) ? "unlimited" : 0n;
  }
}

/** Would consuming `amount` more keep usage within the limit? */
export function fitsLimit(limit: bigint | "unlimited", usage: bigint, amount: bigint): boolean {
  return limit === "unlimited" || usage + amount <= limit;
}

export function isOverLimit(limit: bigint | "unlimited", usage: bigint): boolean {
  return limit !== "unlimited" && usage > limit;
}
