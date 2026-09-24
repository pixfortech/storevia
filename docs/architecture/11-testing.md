# 11 — Testing strategy and security test suites

> Implemented in Milestone 1. Every layer below runs in CI on every push and
> pull request. The jobs are required checks: a red job blocks merging once
> branch protection is enabled on `main` (roadmap issue M0-05).

## Layers

| Layer       | Tool                                                              | Where                               | Runs against                                             | CI job                                   |
| ----------- | ----------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| Unit        | Vitest                                                            | `packages/*/src/**/*.test.ts`       | pure code                                                | `Format, lint, typecheck, test, build`   |
| Integration | Vitest                                                            | `packages/*/tests/**/*.int.test.ts` | PostgreSQL `*_test` database, real roles, RLS and grants | `Integration and tenant-isolation tests` |
| End-to-end  | Playwright                                                        | `apps/dashboard/e2e/*.spec.ts`      | production build of the dashboard over HTTP              | `End-to-end security tests (Playwright)` |
| Static      | ESLint, `tsc`, Prettier, `check:schema`, FK-index check, gitleaks | repository                          | —                                                        | `Format, lint, …` and `Secret scan`      |

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

## Running locally

```sh
pnpm db:setup && pnpm db:test:prepare   # once
pnpm test                               # unit
pnpm test:integration                   # integration + isolation (uses *_test)
pnpm --filter @storevia/dashboard build
EMAIL_TRANSPORT=file EMAIL_FILE_DIR=/tmp/storevia-mail pnpm test:e2e
```

The E2E suite starts the dashboard with `next start` (or reuses one on port
3001). Outside CI, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a local Chromium
if Playwright's bundled browser isn't installed.
