# ADR-0022: Provider-neutral subscriptions, manual assignment and mock billing

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0009 (does not supersede it)

## Context

Milestone 2 was revised before implementation. Payment-gateway registration
is still pending, so **no real payment gateway (Stripe, Razorpay, …) is
integrated in Milestone 2**. The full subscription, plan and entitlement
architecture must still be built and proven. Plans reach organisations in two
ways for now:

1. **Manual assignment** by Storevia staff in the platform-admin app. This is a
   real production feature (enterprise contracts, pilots, comped accounts).
2. **Mock billing**: a `MockBillingProvider` that behaves like a payment
   provider (signed webhooks, duplicates, retries, out-of-order delivery). It
   is enabled only outside production.

Real providers come later as adapters. The primary rule of the revision is
that every source feeds the same path:

```text
source (manual admin action | mock provider event | real provider event)
      └─► Subscription Service ─► Entitlement Engine ─► Usage Enforcement
```

Features never care where a subscription came from, and there are no
test-only entitlement bypasses.

The approved design (ADR-0009, [05-billing-entitlements.md](../architecture/05-billing-entitlements.md),
draft schema §3) assumed Stripe was the first source of truth. Several
details do not fit the revision:

| #   | Baseline                                                                                                      | Problem                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Subscription.provider String?` is the only hint of origin                                                    | No first-class **source**. A manual subscription and a provider one can't be told apart reliably, and nothing stops a provider webhook from editing a manually assigned contract                          |
| 2   | `PlanPrice.provider/providerPriceId` are required                                                             | Prices can't exist without a provider. They should be provider-neutral catalogue metadata                                                                                                                 |
| 3   | `Subscription.planPriceId` carries the billing interval                                                       | A manual contract has an interval but not necessarily a list price                                                                                                                                        |
| 4   | `FeatureType` = `BOOLEAN`/`LIMIT`/`CONFIG`; `PlanFeature.limit NULL` = unlimited                              | "Unlimited" is implicit, so a forgotten limit silently means unlimited. The revision requires explicit `BOOLEAN`/`LIMIT`/`UNLIMITED`/`CONFIGURATION` entitlements                                         |
| 5   | Resolution: override → plan → **deny**                                                                        | The revision requires override → plan → **system default**. It is also needed in practice: every organisation must be able to create its first store (with an owner) before anyone has assigned it a plan |
| 6   | Override: nullable `enabled`, `limit`, `unlimited` flag; partial-merge semantics undefined                    | Ambiguous. An override must be a complete, auditable value                                                                                                                                                |
| 7   | Downgrades of hard resources (stores, staff) are **blocked** until usage fits                                 | The revision: never delete data, **mark over-limit and block new creation**. A provider-side downgrade can't be blocked by us anyway                                                                      |
| 8   | Webhook processing always re-fetches provider state                                                           | The mock provider has no remote state to fetch, and a provider may push full snapshots (Razorpay)                                                                                                         |
| 9   | Entitlement follows `status` only, and time-based transitions (trial end, grace end, period end) rely on jobs | If a job is late, entitlements outlive their subscription                                                                                                                                                 |
| 10  | Webhook processing is enqueued to the worker (M2-04)                                                          | Without a real provider there is no production webhook traffic in M2. The worker is not needed yet                                                                                                        |

## Decision

### 1. Subscription source and provider references

- New enum `SubscriptionSource { MANUAL, MOCK, PAYMENT_PROVIDER }` and
  `BillingProviderKey { MOCK, RAZORPAY, STRIPE }` (provider-reference layer
  only; no domain logic branches on it).
- `Subscription.source` is required. SQL `CHECK`s tie it to the provider
  columns:
  - `MANUAL` ⇒ `provider IS NULL AND providerSubscriptionId IS NULL`
  - `MOCK` ⇒ `provider = 'MOCK'` and a provider subscription ID
  - `PAYMENT_PROVIDER` ⇒ `provider IN ('RAZORPAY','STRIPE')` and a provider subscription ID
- **Source never changes the meaning of a status.** One function decides
  whether a subscription grants entitlements, and it does not read `source`.
- **Ownership of changes.** Staff change `MANUAL` subscriptions directly.
  Provider-managed subscriptions (`MOCK`, `PAYMENT_PROVIDER`) change only
  through provider events. Staff act on them through the provider adapter,
  and the result comes back as a webhook event. A provider event never edits a
  `MANUAL` subscription. A provider-created subscription for an organisation
  that has another live subscription **supersedes** it: the old one becomes
  `EXPIRED` (event `superseded`) in the same transaction. This is how "manual
  trial → paid via provider" works later.
- Provider price mapping moves to `PlanPriceProviderRef` (draft only; it is
  promoted with the first real adapter). `PlanPrice` becomes provider-neutral
  pricing metadata (`planId`, `interval`, `currency`, `amount` in minor units,
  `active`).
- `Subscription.planPriceId` is replaced by `billingInterval` (nullable: a
  complimentary manual contract has no interval).
- `BillingCustomer` is keyed by `(organisationId, provider)` so an
  organisation can hold a customer at more than one provider (migration
  between providers).

### 2. Subscription columns and the single entitlement rule

`Subscription` keeps `status` and gains `source`, `billingInterval`,
`startedAt`, `trialStartsAt`, `expiresAt`, `graceEndsAt`. `cancelAtPeriodEnd`
and `planPriceId` are removed. `expiresAt` is the scheduled end of
entitlement: a fixed manual term, or the access end of a cancelled
subscription. `NULL` means no scheduled end.

A subscription **grants entitlements at time _t_** if and only if:

| Status      | Grants when                          | SQL `CHECK`                       |
| ----------- | ------------------------------------ | --------------------------------- |
| `TRIAL`     | `t < trialEndsAt`                    | `trialEndsAt IS NOT NULL`         |
| `ACTIVE`    | `expiresAt IS NULL OR t < expiresAt` | none                              |
| `PAST_DUE`  | `t < graceEndsAt`                    | `graceEndsAt`, `pastDueSince` set |
| `CANCELLED` | `t < expiresAt`                      | `expiresAt`, `cancelledAt` set    |
| `EXPIRED`   | never                                | `endedAt IS NOT NULL`             |

Because the rule is time-aware, a late expiry sweep can never extend access.
The sweep (`sweepSubscriptionExpiry`) still moves due subscriptions to
`EXPIRED` through the Subscription Service, so history and audit are
complete. It runs as `pnpm billing:sweep` (cron) until the worker exists.

### 3. State machine (source-independent)

```text
(none)    → TRIAL | ACTIVE
TRIAL     → ACTIVE | PAST_DUE | CANCELLED | EXPIRED | TRIAL*
ACTIVE    → PAST_DUE | CANCELLED | EXPIRED | ACTIVE*
PAST_DUE  → ACTIVE | CANCELLED | EXPIRED | PAST_DUE*
CANCELLED → ACTIVE (reactivated before access ends) | EXPIRED | CANCELLED*
EXPIRED   → (terminal; a new subscription is a new row)
* same-status updates: renewal, plan change, date changes
```

Compared with doc 05, `ACTIVE → EXPIRED` (immediate termination),
`TRIAL → PAST_DUE` (first charge after a trial fails) and
`PAST_DUE → CANCELLED` are added. Every other transition is rejected by the
service, whatever its source. Each applied change appends a
`SubscriptionEvent` and an `AuditLog` row in the same transaction.

### 4. Entitlement values and resolution

- `FeatureType { BOOLEAN, LIMIT, CONFIGURATION }` (`CONFIG` renamed).
- `PlanFeature`, `OrganisationFeatureOverride` and the feature's system
  default all store a **complete value**: `enabled`, `limit`, `unlimited`,
  `config`. A trigger validates the value against the feature type:
  - `BOOLEAN`: no limit and no config.
  - `LIMIT`: exactly one of `limit ≥ 0` or `unlimited` when enabled.
  - `CONFIGURATION`: `config` is a JSON object when enabled.
- The engine exposes four value kinds: `BOOLEAN`, `LIMIT`, `UNLIMITED`,
  `CONFIGURATION`. A disabled `LIMIT` feature resolves to limit 0.
- **Resolution precedence, per feature:**
  1. an unexpired `OrganisationFeatureOverride` (a complete replacement);
  2. the `PlanFeature` of the organisation's _entitling_ subscription;
  3. the feature's **system default** (`Feature.default*`).

  The system default is the floor for organisations without an entitling
  subscription (new, expired). The seeded defaults are one store, one team
  member (the owner) and no optional features, so a new merchant can create
  a store and nothing more until a plan is assigned.

- Overrides need no new `Plan`. Ad-hoc per-organisation plans are not allowed.
  Overrides require a reason, record `createdById`, may expire, and every
  create, update and delete is audited with its before/after values.
- Feature rows are part of the code contract (the closed `FeatureKey` union),
  so they are inserted **by the migration**. Plans, prices and plan features
  are business data, so the idempotent reference seed (`pnpm db:seed`) loads
  them. Code never reads plan keys (lint rule).

### 5. Over-limit policy (replaces "block the downgrade")

Downgrades and expiries are **never blocked by usage and never delete data**.
Over-limit is **computed** (usage > limit), not stored, so it cannot drift.
While over the limit, new consumption fails with `LIMIT_REACHED` and existing
resources keep working. Staff see an over-limit pre-check before a manual
downgrade and must acknowledge it. The per-resource policy is in
[05-billing-entitlements.md §1.3](../architecture/05-billing-entitlements.md).

### 6. Provider abstraction and webhook pipeline

- `BillingProvider` (provider-neutral): `createCustomer`, `createCheckout`,
  `createSubscription`, `changeSubscription`, `cancelSubscription`,
  `reactivateSubscription`, `getSubscription`, `verifyWebhook`,
  `parseWebhookEvent`.
- A parsed event carries a normalised **snapshot** of the provider's
  subscription and a monotonic **snapshot version** (the event time for
  pushed snapshots; the fetch time when an adapter re-fetches, as doc 05
  planned for Stripe). The pipeline applies a snapshot only when its version
  is newer than `Subscription.providerSyncedAt`. Older snapshots are recorded
  as `IGNORED (stale)`, so out-of-order delivery converges.
- **Pipeline** (`ingestBillingWebhook`), identical for every provider:
  verify the signature (raw body, timestamp tolerance 5 min) → parse and
  validate the schema → record in the `BillingWebhookEvent` ledger (unique per
  provider event ID) → apply under a per-subscription advisory lock through
  the Subscription Service → mark the ledger row `PROCESSED` / `IGNORED` /
  `FAILED`. Duplicates, replays (stale signature timestamps), invalid
  signatures, invalid payloads, unknown customers and illegal transitions
  never change entitlement state.
- In Milestone 2, processing runs inline. The queue and worker (M2-04) move
  to Milestone 3. The ingestion function becomes the job handler then, and its
  contract doesn't change.

### 7. Mock billing and environment safety

- `MockBillingProvider` is a real `BillingProvider`. The simulation UI asks it
  for events, and it **signs** them (HMAC-SHA256,
  `MOCK_BILLING_WEBHOOK_SECRET`) and delivers them to `ingestBillingWebhook`.
  The simulator never writes subscriptions or entitlements.
- The provider registry enables the mock only when `STOREVIA_ENV` is
  `development` or `test`, or `staging` with `BILLING_MOCK_ENABLED=true`. In
  `production` and `preview` it cannot be enabled. The simulation pages,
  actions and the mock webhook route all check the registry on the server and
  return 404 when it is disabled.
- Manual assignment is a production feature. It lives only in the
  platform-admin app (separate realm, `PlatformStaff` gate), requires a
  platform permission, recent step-up authentication and a reason, and writes
  `SubscriptionEvent` + `AuditLog` (`actorType = PLATFORM_STAFF`) in the same
  transaction. Merchant roles, including `OWNER`, have no path to assign or
  change plans. The dashboard billing page is informational.

### 8. Database roles

- `storevia_app`: `SELECT` on the catalogue (`Plan`, `PlanPrice`, `Feature`,
  `PlanFeature`) and on the organisation's own `Subscription` and overrides
  (RLS). `SELECT/INSERT/UPDATE(value)` on its own `UsageCounter`. **No
  write** on subscriptions, events or overrides.
- `storevia_platform`: the specific writes that audited staff actions need:
  subscriptions, events, overrides, audit.
- `storevia_system`: the webhook ledger, billing customers, subscriptions and
  events for the pipeline, and the expiry sweep. Allow-listed importer:
  `packages/billing`.

### 9. Entitlement caching

Entitlements are resolved from PostgreSQL on each request (one query,
memoised per request). No cross-request cache exists, so a change is visible
on the next request. Every subscription or override change calls
`onEntitlementsChanged(organisationId)` after commit. Today it revalidates
the affected pages. It is the single place a future cache must be
invalidated.

## Consequences

- A Stripe or Razorpay adapter is an implementation of `BillingProvider` plus
  an enum value and a `PlanPriceProviderRef` promotion. The Subscription
  Service, entitlement engine and enforcement don't change.
- Organisations created before a plan is assigned run on the system-default
  floor. Existing integration and E2E fixtures that need more (two stores,
  invited staff) get a plan through the real Subscription Service or real
  subscription rows, never through a bypass.
- Draft schema, ERD and doc 05 are updated in the same change.
- Deferred: the worker and queue (M3), the pricing page and marketing
  skeleton (M3), and real checkout, billing portal, invoices and production
  webhooks (commercialisation phase). `Invoice` stays in the draft only.

## Alternatives considered

- **Treat manual assignment as a fake provider.** Rejected. Manual contracts
  are a first-class production feature with their own rules (reason, step-up,
  no signature), and hiding them behind a provider would blur the audit trail.
- **Store an `overLimit` flag.** Rejected. It drifts from reality. Computing
  it from counters and limits is cheap.
- **Deny by default without a subscription.** Rejected. It contradicts the
  revision's precedence (system default) and would make onboarding depend on
  staff action before the first store.
- **Enforce gauges by counting source rows under an organisation lock**
  instead of `UsageCounter`. Simpler for stores and staff, but metered
  features (API calls, storage) need counters anyway. We keep one mechanism:
  counters under a row lock, backfilled by the migration and checked by
  reconciliation (`reconcileUsage`).

## Amendments after the Milestone 2 security review (2026-09-24)

An independent review of the implementation found no merchant-reachable
bypass or cross-tenant leak, but did find gaps in webhook ordering,
simulator privileges and role separation. These amendments refine the
decisions above; the original text is kept for the record.

- **A1 — First observation of a provider subscription** (refines §3 and §6).
  A provider subscription seen for the first time is recorded in whatever
  state the provider reports, including `CANCELLED`, `PAST_DUE` and
  `EXPIRED`. An `EXPIRED` first observation is a tombstone. The row's
  `providerSyncedAt` then orders later deliveries, so an older `created`
  that arrives afterwards is ignored as stale. This applies only to provider
  sources. Manual subscriptions still start as `TRIAL` or `ACTIVE`.
- **A2 — Superseding needs a newer snapshot** (refines §1). A new provider
  subscription replaces the live subscription only if its snapshot is newer
  than the live one's last change (`providerSyncedAt`, or `updatedAt` for
  manual subscriptions). A delayed event for an older provider subscription
  can't win.
- **A3 — Snapshot ordering rule** (clarifies §6). A snapshot is stale when
  its version is strictly older than the last applied one. Equal versions
  are applied in arrival order. Adapters for providers with coarse
  timestamps must supply a monotonic version (for example the fetch time,
  when they re-fetch).
- **A4 — Plans in provider events.** Provider events may reference `ACTIVE`
  or `LEGACY` plans. `ARCHIVED` plans are refused (`IGNORED archived_plan`).
- **A5 — Reactivation needs remaining access** (refines §3).
  `CANCELLED → ACTIVE` is allowed only while the cancelled subscription still
  grants entitlements, whatever the source.
- **A6 — Simulation has the same bar as manual changes** (refines §7). A
  simulated event needs the simulate permission, step-up and a reason, and
  is attributed in the audit log _before_ it is delivered. Simulating
  `created` while a live non-mock subscription exists also needs
  `platform.subscription.manage`. Simulated plan changes must use `ACTIVE`
  plans.
- **A7 — Mock enablement** (refines §7). Production builds
  (`NODE_ENV=production`) need `BILLING_MOCK_ENABLED=true` even in
  development or test, so a mis-set stage alone can't expose the mock. The
  mock logs a warning when it is enabled.
- **A8 — Dedicated billing database role** (replaces the system-role part of
  §8). The webhook pipeline, the mock provider and the expiry sweep use a new
  `storevia_billing` role (BYPASSRLS, billing tables and audit inserts only).
  `storevia_system` loses every billing privilege, because the merchant
  dashboard's auth path shares it. In production no real provider is
  enabled in Milestone 2, so the dashboard doesn't need the billing
  credential. Real providers get a dedicated webhook service at
  commercialisation.
- **A9 — Staff can close stuck provider subscriptions.** A provider-managed
  subscription that no longer grants anything (for example because its final
  provider event was lost) can be expired by staff, with the usual
  permission, step-up, reason and audit.
- **A10 — Overrides, reconciliation and entitlement hooks.**
  - An override change that newly puts the organisation over a limit needs
    the same acknowledgement as a downgrade.
  - Usage recalculation needs a reason.
  - Over-limit reporting uses the plan only while it grants entitlements.
  - A missing gauge counter starts from the real row count, which covers
    rolling deploys.
  - `onEntitlementsChanged` listeners are per-process: platform-admin and the
    webhook route register them (logging and page revalidation). Other
    processes see changes on their next request because nothing caches
    entitlements across requests.
- **Not changed (documented risk).** The app role keeps direct `UPDATE` on
  its own `UsageCounter` rows. SQL injection as the app role could reset a
  counter, but that role can already insert the counted rows (stores,
  memberships) directly. Database-enforced limits (for example triggers on
  the resource tables) would close both. That is a candidate for M8
  hardening. Parameterised queries and the lint ban on unsafe raw SQL are
  the current mitigation.
