# Milestone 8 gap analysis (commercial hardening)

Baseline: `a796694` (post-M7 pass accepted). This audit maps the original M8
roadmap (`github-milestones-and-issues.md` M8-01..M8-12) and the M8 brief's
thirteen priorities onto what the code does today, and decides what M8
builds. M8 is reliability, security, recoverability and operations: no
feature expansion, no visual redesign.

Method: five read-only audits (contrast/caching, deployment/performance/
payments, observability/jobs, lifecycle/billing/support, security), each
checked against the code rather than the docs. Where the docs and the code
disagree, the code wins and the doc is listed as a gap.

## Roadmap items → brief priorities

| Roadmap | Item                                                | Brief priority | State at baseline                                                                                     |
| ------- | --------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| M8-01   | Audit coverage + audit log viewers                  | 7, 10          | Audit rows written by every mutating service; no viewer in dashboard or platform-admin                |
| M8-02   | Rate-limit review                                   | 7              | Postgres fixed-window limiter on auth, checkout, cart, messages, domains, invites, contact; no review |
| M8-03   | Monitoring, alerting, dashboards, status page       | 4              | JSON logger + metrics-as-log-lines; no exporter, no error tracking, no alerts                         |
| M8-04   | Security review + external pen test                 | 7              | Threat model exists; no pen-test checklist, no targeted attack suite across areas                     |
| M8-05   | Performance review against budgets                  | 11             | JS/page-speed budgets and query-count tests in CI; no load test of any kind                           |
| M8-06   | Backup/restore drill + DR runbook                   | 6              | Targets in docs (RPO 5 min / RTO 4 h); no scripts, no runbook, no drill                               |
| M8-07   | Data export                                         | 8              | Product CSV only                                                                                      |
| M8-08   | Account + organisation deletion                     | 8              | Statuses `PENDING_DELETION`/`DELETED` in schema; nothing sets them; no self-delete                    |
| M8-09   | Billing recovery: dunning, grace UX                 | 9              | Manual plans, 14-day grace, expiry sweep; page misses expired/trial-ending; hard-coded allowance copy |
| M8-10   | Support tooling: suspend/restore store, abuse queue | 10             | Read-only org/domain/job pages; billing actions audited with step-up; no suspend/restore              |
| M8-11   | MFA for merchants; SSO + MFA for staff              | 7 (launch)     | None. The roadmap bars platform-admin from production until staff MFA exists                          |
| M8-12   | Customer erasure requests                           | 8              | Checkout contact purge after retention only; no request workflow                                      |
| —       | Storefront contrast (brief priority 1)              | 1              | Muted text fails 4.5:1 on surface and in brand-colour sections                                        |
| —       | Staging architecture, env validation (brief 2)      | 2              | No deploy config; env validated lazily; storefront has no schema                                      |
| —       | Multi-instance cache correctness (brief 3)          | 3              | Process-local caches; invalidation reaches one instance                                               |
| —       | Worker/job reliability (brief 5)                    | 5              | Leases + backoff exist; several gaps below                                                            |
| —       | Razorpay staging validation (brief 12)              | 12             | Mocked HTTP only                                                                                      |
| —       | Production launch checklist (brief 13)              | 13             | Pieces spread across two hosting docs                                                                 |

## 1. Accessibility: storefront contrast

**Cause.** `theme-core.ts` derives `color.muted`/`color.secondary` by mixing
text into background until the result reaches 4.5:1 **against the page
background only**. `color.surface` is background mixed 4% toward text, so
muted text on surface drops below 4.5:1.

| Preset (Storevia) | muted / surface |
| ----------------- | --------------- |
| Editorial         | 4.24            |
| Minimal           | 4.32            |
| Modern            | 4.33            |

Boutique presets pass by the engine's own maths (Atelier 5.55, Linen 4.97,
Gallery 4.54 — the last with no margin). The Boutique failures come from a
second, unreported defect: in sections with the "Brand colour" background,
`.sv-muted`, `.sv-empty`, the sold-out badge and Boutique card prices keep
the muted colour and render at 1.46–3.84:1 on the brand colour.

Muted-on-surface occurs in: hero subheading, "Subtle" sections, CTA blocks,
product cards in such sections, cart notices, store replies in order
messages, and the Boutique checkout summary. Status colours (success,
warning, danger) are fixed hex values chosen for white and are not derived
for dark or tinted backgrounds. The theme demo already hides the defect
with a hero override (`demo.ts`); the live storefront doesn't.

Tests check muted only against background; nothing tests anything against
surface or brand.

**M8 builds:** derive muted/secondary so they reach 4.5:1 against both
background and surface; derive status colours per theme to 4.5:1 on both;
require outline-button primary ≥ 4.5 on surface in `contrastRules`; inherit
colour for every muted element inside brand-colour sections; remove the demo
workaround; a regression suite over every preset × every text/background
token pair, plus a generated grid of merchant colour combinations the
validator accepts.

## 2. Staging architecture and env validation

- No `vercel.json`, Dockerfile, or deploy workflow. Two hosting plans
  coexist: `deployment-architecture.md` (AWS containers + Cloudflare) and
  `production-hosting.md` (four Vercel projects + Neon + S3-compatible
  bucket + worker container). The second is the one being executed.
- Env schemas in dashboard/marketing/platform-admin are parsed on first
  use, not at boot. The storefront has no schema;
  `TRUSTED_CLIENT_IP_HEADER` isn't enforced there although the docs require
  it. The worker checks two database URLs at boot.
- The worker has no build step (runs through `tsx`) and binds its health
  server to `127.0.0.1`, which a container platform's probe can't reach.
- `.env.example` misses `EMAIL_TRANSPORT`, `EMAIL_FILE_DIR`,
  `AUTH_BREACHED_PASSWORD_CHECK`, `DATABASE_POOL_MAX`, worker settings and
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; it lists unused Google sign-in keys.
- Database pools: 10 connections per role per process, no connect/idle/
  statement timeouts, no TLS settings. On Vercel this multiplies across
  instances; Neon's pooled endpoint is mandatory. Code is safe under
  transaction pooling. Nothing forces migrations onto the direct URL.

**M8 builds:** a shared env contract per deployable app validated at boot
(Next `instrumentation.ts` `register()`, worker `main`), with production-
only requirements and CI-safe defaults; pool timeouts and TLS options;
worker bundle + `0.0.0.0`-configurable health bind + container file;
per-app `vercel.json`/project settings documented; a staging topology doc
with the exact role-separated Neon connection strings; `.env.example`
completed.

## 3. Multi-instance cache correctness

- Host cache: in-memory map, 30 s TTL (`domains/src/resolver.ts`).
- Page-data cache: in-memory tag cache, 5 min TTL (`site-engine/src/cache.ts`).
- Invalidation: database triggers → `OutboxEvent` → worker every 15 s →
  signed POST to **one** storefront URL → clears that instance only. Every
  other instance serves stale host routing (≤ 30 s) and page data (≤ 5 min),
  including after store suspension, domain primary changes, page publish,
  product edits and stock changes.
- Next's cache (`'use cache'`, `cacheHandlers`) isn't used; adopting it
  would require `cacheComponents` and passing the signed store header as an
  argument — too large a change for a hardening milestone.

**M8 builds:** a database-backed invalidation log. The worker (and any
in-request invalidation) appends tags to a `StorefrontInvalidation` table;
every storefront instance tails it (`id > lastSeen`, single-flight,
throttled to ~1 s) before serving from cache and applies the tags locally.
The HTTP POST stays as a fast path. Tail failures fail safe: when the log
can't be read the instance bypasses its caches rather than serving
possibly-stale data. Old rows are purged by the worker. Integration tests
run two independent cache instances against one database.

## 4. Observability

- `recordMetric` writes an info log line; `LOG_LEVEL=warn` would drop
  every metric. No exporter, no error tracking, no `instrumentation.ts`,
  no `onRequestError`, no alert definitions.
- Redaction is by key name only: `email`, `recipient`, `phone`, address
  fields and `body` pass through; values are never scanned.
- Request IDs: every proxy generates a fresh UUID and ignores the incoming
  one. The id reaches audit rows and dashboard/platform-admin/billing/
  marketing logs; it doesn't reach storefront logs, commerce payment-webhook
  logs, or the worker. Jobs and outbox dispatch carry no correlation id.
- Unmetered: media processing, auth, notification retries, payment-expiry
  deferrals, queue depth, backlog age, cache invalidation lag.
- Leaks: `media/src/service.ts` logs `error.message`; the domain job logs
  the provisioner's error message; `billing/src/events.ts` uses
  `console.error`.

**M8 builds:** metrics as a separate always-on stream (not subject to
`LOG_LEVEL`) with a pluggable sink; value-scanning redaction (emails, bearer
tokens, card-like numbers, order-access tokens, Razorpay ids and signatures)
plus a widened key list; correlation ids honoured from a trusted header,
propagated into storefront, payment webhooks and worker job runs;
`instrumentation.ts` with `onRequestError` in every Next app; metrics for
checkout/payment/order failures, worker failures, domain verification,
media processing, notification delivery and cache invalidation; an alert
catalogue (`docs/operations/alerts.md`) with thresholds tied to those
metric names; tests that assert secrets and PII never appear in log output.

## 5. Worker and job reliability

| Job / queue                        | Retries/backoff  | Stuck recovery                                    | Dead-letter / visible        | Idempotent   |
| ---------------------------------- | ---------------- | ------------------------------------------------- | ---------------------------- | ------------ |
| Scheduler (`JobRun`)               | yes              | lease expiry re-runs; row stays `RUNNING` forever | `/jobs` read-only            | yes (lease)  |
| Order emails (`OrderNotification`) | 5 attempts       | yes                                               | terminal `FAILED`, no screen | yes          |
| Outbox → storefront invalidation   | none             | head-of-line blocking                             | none                         | yes          |
| Customer-message staff fan-out     | none             | head-of-line blocking                             | none                         | yes (unique) |
| Payment webhooks                   | provider retries | n/a                                               | failed ones leave no record  | yes (ledger) |
| Billing webhooks                   | provider retries | n/a                                               | hidden (no org assigned)     | yes          |
| Media processing                   | inline, none     | asset stuck in `PROCESSING`                       | none                         | —            |
| Domain verification                | bounded backoff  | yes                                               | `/domains`                   | yes          |

Also: `/health` returns 503 when the last poll is > 60 s old, so a long job
(the nightly usage reconcile can run 30 min) makes the worker look dead and
can get it killed mid-run; timeouts only abort a signal that five of eight
jobs ignore while the heartbeat keeps renewing the lease; `JobRun` is never
purged.

**M8 builds:** health = event loop alive + DB reachable + scheduler
progressing (not "last poll < 60 s"); crashed runs recovered to `FAILED`
(`lease expired`) and counted; hard job timeouts that release the slot;
attempt limits + backoff + dead state for outbox dispatch and message
fan-out so one poisoned row can't block the queue; a recorded failure for
payment webhooks outside the rolled-back transaction; a media sweeper for
stuck `PROCESSING` assets; `JobRun` retention; a platform-admin
operations page (queue depths, oldest backlog, dead items, worker
heartbeat) with an audited, confirmed, reasoned "retry" for dead items.

## 6. Backup and restore

`deployment-architecture.md` §7 promises 35-day PITR, cross-region
snapshots, RPO 5 min, RTO 4 h and quarterly drills. `production-hosting.md`
(the plan in use) says nothing about backups. No dump/restore scripts, no
runbook, no verification script.

**M8 builds:** `scripts/db/backup.sh` / `restore.sh` (logical, role- and
RLS-aware), `scripts/db/verify-restore.ts` that checks row counts and
referential integrity for organisations, stores, products, orders,
payments, customers, themes, domains and messages plus RLS/role/trigger
presence; an actual drill into a clean database with timings recorded;
`docs/operations/backup-restore.md` with Neon PITR configuration, RPO/RTO
derived from the drill and the provider's guarantees.

## 7. Security

**Sound (verified, keep):**

- Tenant isolation: RLS on every tenant table and about 270 isolation
  tests across the database, tenancy, commerce and E2E suites.
  - All 38 SECURITY DEFINER functions pin `search_path`, and each callable
    one guards on the current store or org.
  - The BYPASSRLS `workerDb` is imported only by worker-path code.
  - No action trusts an unverified client id.
  - Storefront store identity comes only from the signed `x-sv-` header,
    and client `x-sv-*` headers are stripped.
- Sessions:
  - Better Auth cookies are `__Host-`, HttpOnly, Secure and Lax
    (platform: Strict).
  - Idle/absolute lifetimes: 7 days/30 days for merchants, 30 minutes/12
    hours for staff.
  - Sessions are revoked on password reset or change, and a new session is
    created on sign-in.
- Storefront cookies are host-only with the `__Host-` prefix. CSP uses a
  nonce with `strict-dynamic`; HSTS applies (without `includeSubDomains` on
  merchant hosts).
- Payment webhooks:
  - Raw-byte HMAC, 64 KB cap.
  - `ON CONFLICT DO NOTHING` ledger in the same transaction as the apply.
  - Idempotent, lock-ordered payment state machine.
  - Only a normalised summary is stored.
- Order-access tokens:
  - The MAC is checked before any query, then the hash is bound in SQL.
  - Tokens are never persisted in plain text.
  - The page is noindex and `force-dynamic`.
- Media:
  - Keys are chosen by the server; the POST policy pins key, size and type.
  - Types come from magic bytes, and SVG is rejected.
  - Uploads are re-encoded; raw uploads are never served.
  - Served with a sandbox CSP and `nosniff`.

**Findings:**

| #   | Severity   | Finding                                                                                                                                                                                                                                                       |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Medium     | Storefront has no env validation. When `TRUSTED_CLIENT_IP_HEADER` is unset, every checkout rate limit (IP-only subject) silently becomes a no-op, including discount-code attempts. Checkout limits are per-IP only, so rotating IPv6 addresses defeats them. |
| S2  | Medium     | Custom-domain squatting. A PENDING or FAILED row holds the globally unique hostname forever, and there is no reclaim by TXT proof. The provider registration also happens before the ownership proof. FAILED domains are never removed from the provider.     |
| S3  | Medium     | The sign-in per-email bucket has no realm, so failures on the public dashboard sign-in lock staff out of platform-admin. Per-email limits in general allow targeted lockout.                                                                                  |
| S4  | Low-Medium | Order links can't be revoked: nothing sets `revokedAt`. The only kill switch is rotating the secret, which has no key versioning.                                                                                                                             |
| S5  | Low-Medium | Changing payment credentials (where payouts go) needs only `settings.manage`, with no step-up.                                                                                                                                                                |
| S6  | Low        | The Razorpay event id header isn't signed and there's no timestamp, so a replay with a fresh id bypasses event-id deduplication and is contained only by business idempotency. `account_id` isn't required.                                                   |
| S7  | Low        | The webhook failure budget (20 bad signatures per 5 minutes per connection) lets anyone who knows the URL delay genuine deliveries.                                                                                                                           |
| S8  | Low        | Billing webhooks store the raw payload forever and have no rate limit or failure budget.                                                                                                                                                                      |
| S9  | Low        | `resendVerification` has a per-email limit only, so one client can mail many addresses. The marketing global bucket can be exhausted by one attacker. `clientIp` always takes the right-most hop.                                                             |
| S10 | Low        | No rate limit on storefront search, dashboard bulk/import/export/refund/media-completion actions, platform-admin org actions or the notifications poll.                                                                                                       |
| S11 | Low        | Deleted media stays reachable if the object delete fails; the failure is only logged.                                                                                                                                                                         |
| S12 | Launch     | No staff MFA. The roadmap bars platform-admin from production until it exists.                                                                                                                                                                                |
| S13 | Info       | No audit log viewer, no pen-test checklist, and no CORP/COEP outside media.                                                                                                                                                                                   |

**M8 builds:**

- **S1:** boot-time env validation in the storefront that requires the
  trusted IP header in production. Checkout limits gain per-checkout-token
  and per-store subjects, and a request with no IP falls back to a shared
  bucket rather than no limit.
- **S2:**
  - The provider registration moves after the TXT proof.
  - A FAILED or long-PENDING row releases its hostname after a bounded
    window.
  - A TXT-proven claim from another store takes over an unproven or
    released row.
  - FAILED domains are removed from the provider.
- **S3:** realm-scoped auth buckets.
- **S4:** revocation (staff action) plus versioned secrets.
- **S5:** step-up on payment connection changes, domain removal and
  refunds.
- **S6:** require `accountId`; deduplicate on payment id + event type.
- **S7:** budget failures per client IP as well as per connection.
- **S8:** store a normalised billing summary, and add limits.
- **S9, S10:** the missing limits.
- **S11:** retry object deletion from the sweeper.
- **S12:** TOTP MFA for platform staff, enforced at sign-in and at step-up.
  Merchant MFA stays deferred.
- **S13:** read-only audit log viewers (organisation and platform) and
  `docs/security/pen-test-checklist.md`.
- A targeted attack suite that proves each fix and would fail if the fix
  were reverted (mutation check).

**Status (M8-4):** S1–S10, S12 and S13 are fixed, each with the tests
listed in [threat-model §4.10](../security/threat-model.md#410-milestone-8-hardening-review).
Two items remain:

- S1's boot-time env validation lands with the other apps' validation
  (M8-7).
- S11 (retrying object deletion) lands with the retention sweeper (M8-5).

The audit log viewers are at `/o/{org}/audit` (dashboard, `audit.read`)
and `/audit` (platform-admin, `platform.audit.read`). The manual test plan
is [pen-test-checklist.md](../security/pen-test-checklist.md).

## 8. Data lifecycle and privacy

- Export: product CSV only.
- Deletion: no user self-delete, no organisation deletion, stores can be
  archived but not unarchived or deleted.
- Retention jobs: checkout contact purge and dispatched outbox purge only.
  Nothing purges audit logs, sessions, verifications, rate-limit rows, job
  runs, carts, orphan/soft-deleted media, soft-deleted catalogue items,
  payment/billing webhook payloads, staff notifications or notification
  recipients.
- Doc vs schema: `storevia_retention` role exists only in docs; customer
  `anonymisedAt` isn't in the schema; the audit log isn't partitioned.
- Insert-only/immutable: order snapshots (trigger), audit log, subscription
  history, inventory movements.

**M8 builds:** organisation/store data export (JSON bundle: stores,
products, customers, orders, payments metadata, themes, domains, messages),
permissioned and audited; customer erasure (anonymise identity fields on
checkouts/orders/messages, keep financial records); organisation deletion
workflow (request → `PENDING_DELETION` with cooling-off → worker
anonymises personal data, detaches domains, deletes media, keeps order and
payment financial records and audit) and user account deletion (blocked
while sole owner); a retention job with per-table windows; the soft vs
hard delete policy written into `data-lifecycle.md`.

## 9. Billing recovery

Manual plans with 14-day grace; expiry sweep every 5 min; no real billing
provider (mock off in production), so no dunning emails. Downgrade/expiry
blocks creation and keeps existing resources. The merchant page misses
expired and trial-ending states and hard-codes the free allowance copy.
Staff actions are step-up + reason + audit except usage reconciliation.

**M8 builds:** merchant-visible status for every state (trial ending,
past due with grace end, expired, cancelled) driven from the subscription
and entitlements, never plan names; allowance copy derived from the
entitlement registry; billing notifications (trial ending, past due,
expired) through the email outbox; step-up on usage reconciliation; a
"restore access" support action (extend grace) with step-up, reason and
audit.

## 10. Support tooling

Read-only organisation list/detail, domain diagnostics, jobs, account
step-up. Missing: store/organisation suspend and restore, audit viewer,
order/payment diagnostics, storefront availability check, abuse queue,
impersonation.

**M8 builds:** tenant diagnostics (stores, domains, storefront
availability, recent payments/webhook failures, jobs) read-only by default;
suspend/restore store and organisation as high-risk actions (permission,
step-up, typed confirmation, reason, audit) that invalidate every storefront
instance. Impersonation and the abuse queue stay deferred (not required for
launch correctness; support works from diagnostics).

## 11. Performance and load

CI enforces storefront JS size, page-speed budgets and query-count limits
(N+1 guard). No load testing.

**M8 builds:** a reproducible load harness (`scripts/load/`) against a
production build with many seeded stores: storefront reads, cart,
checkout, domain resolution, worker queue drain, order dashboard, database
connection pressure. Budgets set from the measurements; query-count tests
extended to the M8 read paths.

## 12. Razorpay staging validation

Payment Links with signed return and webhook, per-connection encrypted
credentials. Tested with mocked HTTP only. A pending refund waits for the
merchant to settle it by hand; there is no refund webhook handling.

**M8 builds:** a sandbox validation script driven only by test-mode keys
supplied at run time (never in CI), a local signed-webhook replay harness
that CI does run (duplicate, out-of-order, stale and tampered deliveries),
refund webhook handling so pending refunds settle automatically, and an
idempotency key on refund creation.

## 13. Launch checklist

Pieces are spread across `production-hosting.md`, `public-suffix-list.md`
and the architecture doc; no single checklist, no secrets-rotation
runbook, no email provider decision.

**M8 builds:** `docs/operations/launch-checklist.md` (Vercel projects,
wildcard `*.storevia.site`, custom domains, TLS, Neon, media/CDN, worker,
email, Razorpay, backups, monitoring, PSL, secret rotation) and
`docs/operations/secrets-rotation.md`.

## Not to touch

Visual design, page builder features, themes beyond contrast tokens,
commerce features, merchant MFA, SSO, impersonation, abuse queue, a real
subscription billing provider, carrier integrations, customer accounts.
