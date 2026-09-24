# ADR-0009: Entitlement service and billing-provider abstraction

- Status: Proposed
- Date: 2026-09-24

## Context

Plan-based access must be enforceable server-side, flexible (enterprise
overrides, new plans without code changes) and independent of the payment
provider's availability.

## Decision

- Model `Plan`, `Feature`, `PlanFeature` (enabled / limit / config),
  `OrganisationFeatureOverride`, `Subscription`, `SubscriptionEvent`,
  `UsageCounter`.
- All access questions go through `packages/entitlements`
  (`hasFeature`, `getFeatureLimit`, `assertFeature`, `getUsage`,
  `canConsume`, `consumeUsage`). Code never compares plan codes.
- Limits are enforced atomically with row-locked usage counters in the same
  transaction as the resource change.
- Storevia's database is authoritative for entitlements. The provider is
  consulted only by webhook processing and reconciliation jobs.
- `BillingProvider` interface. Stripe is the first implementation; a second
  provider (e.g. Razorpay for India) can be added without changing
  entitlements.
- Webhooks: signature verified, recorded in a unique ledger (idempotency),
  processed asynchronously by re-fetching provider state, with retries.

Details: `docs/architecture/05-billing-entitlements.md`.

## Consequences

- New plans and enterprise deals are data changes.
- An extra reconciliation job is needed to heal missed webhooks.
