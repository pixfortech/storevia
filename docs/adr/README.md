# Architecture Decision Records

Format and process: [ADR-0001](./0001-record-architecture-decisions.md).
Copy [`template.md`](./template.md) for new decisions. Status values: Proposed,
Accepted, Superseded by ADR-XXXX, Deprecated.

| ADR                                                               | Title                                                              | Status   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| [0001](./0001-record-architecture-decisions.md)                   | Record architecture decisions                                      | Accepted |
| [0002](./0002-monorepo-pnpm-turborepo.md)                         | Monorepo with pnpm workspaces and Turborepo                        | Accepted |
| [0003](./0003-nextjs-app-per-surface.md)                          | Next.js App Router, one app per product surface                    | Accepted |
| [0004](./0004-postgresql-and-prisma.md)                           | PostgreSQL with Prisma ORM 7                                       | Accepted |
| [0005](./0005-multi-tenancy-shared-schema-rls.md)                 | Multi-tenancy: shared schema, tenant columns, RLS                  | Accepted |
| [0006](./0006-identifiers-uuidv7-typeid.md)                       | UUIDv7 primary keys, TypeID public identifiers                     | Accepted |
| [0007](./0007-authentication-better-auth.md)                      | Authentication with Better Auth, wrapped                           | Accepted |
| [0008](./0008-rbac-permission-primitives.md)                      | RBAC based on permission primitives                                | Accepted |
| [0009](./0009-entitlements-and-billing-abstraction.md)            | Entitlement service and billing-provider abstraction               | Accepted |
| [0010](./0010-money-integer-minor-units.md)                       | Money as integer minor units with explicit currency                | Accepted |
| [0011](./0011-page-document-structured-json.md)                   | Page builder canonical format: versioned JSON tree                 | Accepted |
| [0012](./0012-pages-store-level-themes-declarative.md)            | Pages belong to the store; themes are declarative                  | Accepted |
| [0013](./0013-single-multitenant-storefront.md)                   | One multi-tenant storefront engine                                 | Accepted |
| [0014](./0014-background-jobs-postgres-queue-outbox.md)           | Postgres-backed job queue and transactional outbox                 | Accepted |
| [0015](./0015-media-storage-user-content-domain.md)               | Media storage and user-content domain                              | Accepted |
| [0016](./0016-hosting-edge-custom-domain-tls.md)                  | Portable containers, managed data, edge-managed TLS                | Accepted |
| [0017](./0017-validation-zod.md)                                  | Centralised validation with zod                                    | Accepted |
| [0018](./0018-search-behind-interface.md)                         | Search behind an interface, PostgreSQL first                       | Accepted |
| [0019](./0019-dependency-and-toolchain-policy.md)                 | Dependency and toolchain policy                                    | Accepted |
| [0020](./0020-staged-schema-promotion.md)                         | Staged promotion of the draft schema                               | Accepted |
| [0021](./0021-better-auth-integration.md)                         | Better Auth integration details                                    | Accepted |
| [0022](./0022-provider-neutral-subscriptions-and-entitlements.md) | Provider-neutral subscriptions, manual assignment and mock billing | Accepted |
| [0023](./0023-worker-scheduled-jobs.md)                           | Worker and scheduled jobs (spike outcome for M2-04)                | Accepted |

ADRs 0002–0019 were accepted with the Milestone 0 review on 2026-09-24.
ADRs 0020–0021 were recorded during Milestone 1 and ADR-0022 for the Milestone 2
revision (no real payment gateway; manual and mock subscription sources).
