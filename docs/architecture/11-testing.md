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

## Running locally

```sh
pnpm db:setup && pnpm db:test:prepare   # once
pnpm test                               # unit
pnpm test:integration                   # integration + isolation (uses *_test)
pnpm db:seed                            # plans, for the dev database used by E2E
pnpm --filter @storevia/dashboard --filter @storevia/platform-admin build
EMAIL_TRANSPORT=file EMAIL_FILE_DIR=/tmp/storevia-mail pnpm test:e2e
```

The E2E suite starts the dashboard (port 3001) and platform-admin (port 3003)
with `next start`, or reuses running ones. It needs `DATABASE_MIGRATOR_URL`
to grant the test staff member's `PlatformStaff` row, as operations would. Outside CI, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a local Chromium
if Playwright's bundled browser isn't installed.
