// Entitlement engine (ADR-0009, ADR-0022). Server-only: the only way to ask
// "may this organisation…?". Code never compares plan keys.
import "server-only";

export * from "./features";
export {
  fitsLimit,
  isEntitling,
  isGranted,
  isOverLimit,
  limitOf,
  resolveFeature,
  toValue,
} from "./engine";
export type {
  EntitlementOrigin,
  EntitlementValue,
  EntitlingFields,
  FeatureType,
  JsonObject,
  ResolvedEntitlement,
  SubscriptionStatus,
  ValueColumns,
} from "./engine";
export {
  assertFeature,
  canConsume,
  consumeUsage,
  entitlementRequired,
  getFeatureLimit,
  getFeatureValue,
  getUsage,
  getUsageSummary,
  hasFeature,
  limitReached,
  loadEntitlements,
  loadLiveSubscription,
  reconcileUsage,
  releaseUsage,
  resolveEntitlement,
} from "./store";
export type { Db, Drift, EntitlementSet, SubscriptionView, UsageLine, UsageOptions } from "./store";
