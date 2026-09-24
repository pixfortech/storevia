// SaaS billing (ADR-0009, ADR-0022). Server-only. One path for every source:
// manual staff actions, mock provider events and future real providers all
// go through the Subscription Service; entitlements come from
// @storevia/entitlements.
import "server-only";

export * from "./state-machine";
export {
  applySubscriptionChange,
  assertStateInvariants,
  IllegalTransitionError,
  lockLiveSubscription,
  lockSubscription,
  stateOf,
} from "./subscriptions";
export type {
  AppliedChange,
  BillingInterval,
  BillingProviderKey,
  ChangeActor,
  StoredSubscription,
  SubscriptionChange,
  SubscriptionSource,
  SubscriptionState,
} from "./subscriptions";
export { notifyEntitlementsChanged, onEntitlementsChanged } from "./events";
export {
  activateSubscription,
  assignPlan,
  cancelSubscription,
  changeSubscription,
  expireSubscription,
  reconcileOrganisationUsage,
  removeEntitlementOverride,
  setEntitlementOverride,
} from "./manual";
export type { ManualResult } from "./manual";
export * from "./provider";
export { MOCK_SIGNATURE_HEADER, MockBillingProvider, toWire } from "./mock-provider";
export {
  enabledProviderKeys,
  getBillingProvider,
  getMockProvider,
  isMockBillingEnabled,
} from "./registry";
export { ingestBillingWebhook } from "./webhooks";
export type { IngestOutcome, IngestResult } from "./webhooks";
export {
  FAULT_SIMULATIONS,
  LIFECYCLE_SIMULATIONS,
  nextSnapshot,
  simulateMockBillingEvent,
} from "./simulate";
export type { Simulation, SimulationResult } from "./simulate";
export { sweepSubscriptionExpiry } from "./sweep";
export { getOrganisationBillingDetail, listOrganisationsForAdmin } from "./admin";
export { getJobsOverview } from "./operations";
export type { JobHealth, JobRunSummary, JobsOverview } from "./operations";
export type {
  AdminFeature,
  AdminOverride,
  AdminPlan,
  AdminSubscription,
  AdminSubscriptionEvent,
  AdminWebhookEvent,
  OrganisationBillingDetail,
  OrganisationListItem,
} from "./admin";
