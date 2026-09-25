# 11 — Testing strategy and security test suites

> Implemented in Milestone 1, extended in Milestone 2 (billing and
> entitlements, ADR-0022). Every layer below runs in CI on every push and
> pull request. The jobs are required checks: a red job blocks merging once
> branch protection is enabled on `main` (roadmap issue M0-05).

## Layers

| Layer       | Tool                                                              | Where                               | Runs against                                                    | CI job                                   |
| ----------- | ----------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| Unit        | Vitest                                                            | `packages/*/src/**/*.test.ts`       | pure code                                                       | `Format, lint, typecheck, test, build`   |
| Integration | Vitest                                                            | `packages/*/tests/**/*.int.test.ts` | PostgreSQL `*_test` database, real roles, RLS and grants        | `Integration and tenant-isolation tests` |
| End-to-end  | Playwright                                                        | `apps/dashboard/e2e/*.spec.ts`      | production builds of the dashboard and platform-admin over HTTP | `End-to-end security tests (Playwright)` |
| Static      | ESLint, `tsc`, Prettier, `check:schema`, FK-index check, gitleaks | repository                          | —                                                               | `Format, lint, …` and `Secret scan`      |

## Tenant isolation: what is proven where

Two completely independent tenants (User A → Organisation A → Store A, and
User B → Organisation B → Store B) are created in every suite.

| Guarantee (docs 03 §8)           | Database (`packages/database/tests/rls.int.test.ts`)               | Services (`packages/tenancy/tests/isolation.int.test.ts`)                    | HTTP (`apps/dashboard/e2e`)                                         |
| -------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A cannot retrieve Store B        | RLS hides B's rows (T12)                                           | `requireStoreAccess` → 404 (T3)                                              | `/s/{storeB}` → 404                                                 |
| A cannot update/delete Store B   | UPDATE/DELETE affect 0 rows; INSERT claiming B fails               | no context can be obtained for B                                             | crafted action replays rejected, B unchanged                        |
| A cannot enumerate Tenant B      | no rows without context; member-only listings                      | `listMyOrganisations` / `listStores` (T4)                                    | switcher shows only A                                               |
| Route parameter tampering        | —                                                                  | malformed/foreign IDs → identical 404                                        | every B route and malformed ID → 404                                |
| API / crafted requests           | —                                                                  | tenant IDs smuggled in bodies ignored (T16)                                  | Server Action replays: B's session, A with B's ID (IDOR), anonymous |
| Nested records can't reference B | composite FKs (T14)                                                | store-access lists can't include B's stores                                  | invitation replay into B's organisation rejected                    |
| Access to Organisation B         | RLS                                                                | `requireOrganisationAccess` → 404 (T2)                                       | `/o/{orgB}/*` → 404                                                 |
| Privilege escalation             | one-OWNER index                                                    | subset rule, no OWNER assignment, owner protected, step-up for transfer (T7) | VIEWER replays owner's action → "permission" error                  |
| Bypassing permissions            | grants per role                                                    | role × permission matrix == documented matrix (T6)                           | VIEWER nav and read-only settings                                   |
| Unauthenticated requests         | —                                                                  | `UNAUTHENTICATED`                                                            | protected routes redirect; anonymous action replay redirected       |
| Expired / revoked sessions       | —                                                                  | auth suite: expiry, absolute lifetime, sign-out, revocation, disabled user   | revoke other sessions → next request signed out                     |
| Removed memberships              | —                                                                  | next request → 404 (T9)                                                      | removed member → 404                                                |
| Changed roles                    | —                                                                  | next request uses the new role (T9)                                          | promotion enables settings edit                                     |
| Unaccepted invitations           | —                                                                  | grant nothing; wrong email, revoked, expired, reused all fail                | invitee has no access before accepting                              |
| Malformed identifiers            | —                                                                  | wrong prefix, raw UUID, SQL-ish, overlong → 404                              | same over HTTP                                                      |
| Platform admin isolation (T11)   | platform role separate                                             | —                                                                            | auth suite: realm cookies, secrets and staff gate                   |
| RLS coverage (T13)               | every `organisationId` table has RLS enabled, forced, and a policy | —                                                                            | —                                                                   |

An independent security review of Milestone 1 found no cross-tenant IDOR. It
did produce regression tests for: normalised open-redirect bypasses; step-up
before granting ADMIN; store-scope escalation by store-limited admins;
invitations outliving the inviter; ownership races (the database owner
invariant); read policies scoped to the selected organisation; column-level
grants and the store-suspension guard; and sessions of soft-deleted users.

The suites were mutation-checked during development: disabling RLS on one
table, or removing the store-access guard, makes them fail.

## Entitlements and billing (Milestone 2): what is proven where

Plans reach tests only through the real Subscription Service
(`packages/billing`, platform-admin in E2E) or as real subscription rows
arranged as fixtures. The entitlement engine and enforcement under test are
always the production code; there is no test-only bypass (ADR-0022).

| Guarantee                                                    | Database (`packages/database/tests/billing.int.test.ts`)    | Services (`entitlements`, `tenancy`, `billing` integration suites)                                                                                                                                                   | HTTP (`apps/dashboard/e2e/billing.spec.ts`)                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Resolution: override → plan → system default                 | value trigger rejects malformed values                      | engine unit tests (every status, expiry edges); precedence, expiry and removal with real rows                                                                                                                        | override raises the merchant's visible limit                                                       |
| Source never changes meaning                                 | CHECK ties source to provider columns                       | manual and mock subscriptions on the same plan resolve identically                                                                                                                                                   | mock subscription shows the same limits                                                            |
| Plan assignment (manual) incl. trial, change, cancel, expire | one live subscription per organisation; status/date CHECKs  | each operation writes the change, a SubscriptionEvent and an AuditLog row; illegal transitions rejected                                                                                                              | staff assign; merchant sees the plan and uses the new limit                                        |
| Merchants can't change plans                                 | app role has no write on subscriptions, events or overrides | no merchant-facing plan API exists; `requirePlatformStaff` rejects owners; forged contexts rejected                                                                                                                  | owner can't sign in to platform-admin; staff action replayed with merchant cookies changes nothing |
| Platform permissions, step-up, reason, audit                 | platform role column grants (no source/owner changes)       | permission matrix per role; step-up and reason required; audit metadata (actor, org, reason, before/after, request ID)                                                                                               | missing step-up and missing reason rejected in the UI                                              |
| Usage limits: store_count, staff_accounts                    | counter `value >= 0`; RLS on counters                       | N concurrent creations/acceptances vs limit L → exactly L; forged `organisationId` ignored; pending invitations count; archive/removal free capacity                                                                 | crafted create-store replays (past the limit, and into another org) → `LIMIT_REACHED`              |
| Over-limit after downgrade/expiry                            | —                                                           | stores and members kept and usable; new creation blocked; staff must acknowledge                                                                                                                                     | downgrade keeps stores working, marks over-limit, blocks new stores                                |
| Webhook pipeline                                             | ledger unique per provider event                            | invalid/missing signature, stale timestamp (replay), invalid schema, duplicate (sequential and concurrent), out-of-order (reverse delivery converges), unknown subscription, illegal transition, failed-then-retried | simulator faults end-to-end; unsigned/forged POSTs → 400; disabled providers → 404                 |
| Environment safety                                           | —                                                           | mock enabled only in development/test or staging+flag; production → provider, route and simulator absent; manual assignment still works                                                                              | —                                                                                                  |
| Expiry sweep                                                 | —                                                           | due MANUAL subscriptions expire via the Subscription Service; provider-managed ones untouched                                                                                                                        | —                                                                                                  |

All Milestone 1 tenant-isolation and security suites still run unchanged in
intent. Fixtures that need more than the system-default floor (a second
store, invited members) are given a plan first.

An independent security review of Milestone 2 found no merchant-reachable
bypass or cross-tenant leak. It did produce regression tests (ADR-0022
amendments) for:

- out-of-order delivery when the first event is for an unknown provider
  subscription (expired or cancelled before created; an older subscription's
  delayed `created`);
- simulator privileges (step-up, reason, no replacing manual contracts
  without the manage permission, only available plans, archived plans
  refused by the pipeline);
- the dedicated billing database role, and the system role losing billing
  access;
- stuck provider subscriptions;
- reactivation after access ended;
- over-limit acknowledgement for overrides;
- attribution of a simulation before delivery;
- verification over raw bytes, and non-UTF-8 bodies;
- gauge counters initialised from real rows;
- stricter mock enablement for production builds.

Mutation checks during development: removing the counter row lock lets 10
concurrent creators through a limit of 3; granting the app role INSERT on
`Subscription` fails the database suite; removing the "only a newer snapshot
supersedes" guard fails the out-of-order regression.

## Milestone 2.5: what is proven where

| Guarantee                                             | Where                                                                                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business type persists, changes and deletes nothing   | `packages/tenancy/tests/business-types.int.test.ts`; E2E `business-types.spec.ts` (create as a publication, switch to portfolio, content and name kept)                                                     |
| Business type never grants permissions or plan limits | integration: limits hold and authors gain nothing for every type; lint bans business-type literals in enforcement code; E2E: a publication still can't create a second free store                           |
| Navigation never exceeds RBAC or the plan             | unit `business-types.test.ts` (every type × permissions × entitlements); integration: locks follow the plan; E2E: viewer navigation, locked analytics                                                       |
| Role presets are existing roles                       | unit: every preset maps to a `MemberRole`; the role matrix test keeps doc 04 identical to code                                                                                                              |
| Pricing ↔ catalogue                                   | `packages/entitlements/tests/catalogue.int.test.ts` (reference data parity, archived/private plans hidden, renames without code); E2E `marketing.spec.ts` (names and prices on the page equal the database) |
| Marketing role isolation                              | `packages/database/tests/marketing-role.int.test.ts` (catalogue read-only, no tenant/identity tables, RLS-confined rate-limit buckets); `rate-limit.int.test.ts`                                            |
| Contact form                                          | email escaping and header safety (unit); E2E validation and delivery to the inbox                                                                                                                           |
| Worker scheduling                                     | `packages/jobs` unit and integration (single claimant, lease takeover, retries, slot advance, skipped slots); `apps/worker` jobs end to end, idempotent re-runs                                             |
| Job health view                                       | billing integration (stalled/failing detection, permission); E2E `admin-shell.spec.ts`                                                                                                                      |
| Desktop, tablet and phone layouts                     | E2E `business-types.spec.ts` (sidebar, rail + drawer, bottom bar + More sheet, ⌘K), `marketing.spec.ts` and `admin-shell.spec.ts` (no horizontal scroll on phones)                                          |
| High-risk staff actions acknowledged                  | E2E `admin-shell.spec.ts` and the shared `submitDialog` helper                                                                                                                                              |
| Design token contrast                                 | unit `packages/ui/src/theme.test.ts` (AA for every semantic text pair)                                                                                                                                      |

## Milestone 3 (catalogue, inventory, media): what is proven where

| Guarantee                                          | Database (`packages/database/tests/catalogue.int.test.ts`)                                        | Services (`packages/commerce/tests`, `packages/media/tests`, `packages/billing/tests`)                                                                                                           | HTTP (`apps/dashboard/e2e/catalogue.spec.ts`)                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| A can't read or change B's catalogue (ID swapping) | RLS forced on all 13 tables; INSERTs claiming another store fail                                  | `isolation.int.test.ts`: every service with B's product, variant, collection, location and media ids → not found; B untouched                                                                    | B opens A's product under either store → 404; B's replayed action rewritten to A's product and store → refused                   |
| Nested references stay in one store                | composite same-store FKs; triggers for optional media references and variant option values        | a collection only gains its own store's products; foreign media can't be attached or used as a variant image; bulk actions report foreign ids as not found                                       | —                                                                                                                                |
| Permissions                                        | app-role grants: no DELETE on products, collections, locations, media, levels; ledger append-only | `permissions.int.test.ts`: role × catalogue primitive matrix; business type never consulted                                                                                                      | —                                                                                                                                |
| Product limit                                      | usage functions refuse any organisation but the caller's                                          | `plan-limits.int.test.ts`: org-wide count, archive frees and restore takes a slot, parallel creates and restores can't pass the limit, over-limit keeps products editable, reconciliation        | staff override to 1: no "Add product", server refuses the form, archive frees the slot, restore over it refused                  |
| Inventory without read-modify-write                | ledger rows can't be updated or deleted; `resultingValue` CHECKs                                  | `inventory.int.test.ts`: 20 parallel −1 on 10 → exactly 10 succeed; mixed parallel deltas add up; opposite transfers don't deadlock and conserve stock; one level row from parallel first stock  | adjust with note → shown in the history                                                                                          |
| Variants and destructive edits                     | option-value-same-product trigger; signature uniqueness                                           | `variants.int.test.ts` and unit `variants.test.ts`: reconciliation keeps ids, SKUs, prices and stock; removals only after exact confirmation; history ⇒ soft delete                              | options → variants → prices and SKUs in the editor                                                                               |
| Handles and rich text                              | partial unique indexes                                                                            | unit `handles.test.ts`, `rich-text.test.ts` (reserved names, collisions, allow-list, XSS corpus)                                                                                                 | —                                                                                                                                |
| Media                                              | media bytes counted by a `SECURITY DEFINER` function                                              | unit: key grammar (no traversal), magic-byte sniffing, SVG/polyglot/bomb/oversize refusal, EXIF and GPS stripped, SigV4 vector, POST policy, HMAC tokens; integration: quota, cleanup, isolation | SVG named .png refused; renditions served with nosniff and sandbox CSP; raw upload, traversal → never a file; forged token → 403 |
| Staff diagnostics are counts only                  | platform role has column-level grants only                                                        | `catalogue-diagnostics.int.test.ts`: per-status counts, per-store counts, no other organisation's rows, malformed ids refused                                                                    | —                                                                                                                                |

Mutation checks (each change applied alone, the named suite run, then
reverted; every mutant made the suite fail):

| Mutant                                                                            | Caught by                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| RLS disabled on `Product`                                                         | `isolation.int.test.ts` (10 tests)                                         |
| `getProduct` without the store boundary (organisation-wide scope)                 | "getProduct (other store, same org)"                                       |
| `product_limit` not consumed on create; not consumed on restore                   | `plan-limits.int.test.ts` (7 tests each)                                   |
| Stock as read-modify-write without row locks                                      | all four concurrency tests in `inventory.int.test.ts`                      |
| `addProductsToCollection` without the store boundary and without the composite FK | "a collection only ever gains its own store's products"                    |
| `attachProductMedia` without the store boundary and without the composite FK      | "media from another tenant or store can't be attached or used as an image" |
| RLS disabled on `MediaAsset` and the composite FK removed                         | the same media test                                                        |

Layer checks: removing only the collection composite FK leaves the suite
green (RLS still hides the other store's product: defence in depth), while
removing only the row locks already fails "opposite transfers" (the ordered
locks are what prevents deadlocks).

Responsive and accessibility sweep: 18 dashboard and staff pages (seeded
catalogue, a store at its product limit) at 320, 375, 390, 430, 768, 1024,
1280, 1440 and 1920 px with no horizontal overflow and no console errors,
and axe (WCAG 2.2 AA and best practice) at 390 and 1440 px with no
violations.

## Runtime compatibility

CI runs every suite on the required Node LTS line (`.nvmrc`, PostgreSQL 17)
and again on the newest Node Current release with the newest PostgreSQL
major as a non-blocking canary. A Windows job runs install, lint, typecheck,
unit, database setup, integration and builds.
`.github/runtime-matrix.json` defines the matrix
([toolchain policy](../engineering/toolchain-policy.md)). `pnpm test:tooling`
covers the update-policy classifier and the toolchain checks.

## Running locally

```sh
pnpm db:setup && pnpm db:test:prepare   # once
pnpm test                               # unit
pnpm test:integration                   # integration + isolation (uses *_test)
pnpm db:seed                            # plans, for the dev database used by E2E
pnpm db:seed:dev                        # optional: demo tenants and a fictional catalogue
pnpm --filter @storevia/dashboard --filter @storevia/platform-admin --filter @storevia/marketing build
EMAIL_TRANSPORT=file EMAIL_FILE_DIR=/tmp/storevia-mail pnpm test:e2e
```

The E2E suite starts the dashboard (port 3001), platform-admin (port 3003) and
the marketing site (port 3000)
with `next start`, or reuses running ones. It needs `DATABASE_MIGRATOR_URL`
to grant the test staff member's `PlatformStaff` row, as operations would. Outside CI, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a local Chromium
if Playwright's bundled browser isn't installed.
