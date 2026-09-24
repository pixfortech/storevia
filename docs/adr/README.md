# Architecture Decision Records

Format and process: [ADR-0001](./0001-record-architecture-decisions.md).
Copy [`template.md`](./template.md) for new decisions. Status values: Proposed,
Accepted, Superseded by ADR-XXXX, Deprecated.

| ADR                                                     | Title                                                | Status   |
| ------------------------------------------------------- | ---------------------------------------------------- | -------- |
| [0001](./0001-record-architecture-decisions.md)         | Record architecture decisions                        | Accepted |
| [0002](./0002-monorepo-pnpm-turborepo.md)               | Monorepo with pnpm workspaces and Turborepo          | Proposed |
| [0003](./0003-nextjs-app-per-surface.md)                | Next.js App Router, one app per product surface      | Proposed |
| [0004](./0004-postgresql-and-prisma.md)                 | PostgreSQL with Prisma ORM 7                         | Proposed |
| [0005](./0005-multi-tenancy-shared-schema-rls.md)       | Multi-tenancy: shared schema, tenant columns, RLS    | Proposed |
| [0006](./0006-identifiers-uuidv7-typeid.md)             | UUIDv7 primary keys, TypeID public identifiers       | Proposed |
| [0007](./0007-authentication-better-auth.md)            | Authentication with Better Auth, wrapped             | Proposed |
| [0008](./0008-rbac-permission-primitives.md)            | RBAC based on permission primitives                  | Proposed |
| [0009](./0009-entitlements-and-billing-abstraction.md)  | Entitlement service and billing-provider abstraction | Proposed |
| [0010](./0010-money-integer-minor-units.md)             | Money as integer minor units with explicit currency  | Proposed |
| [0011](./0011-page-document-structured-json.md)         | Page builder canonical format: versioned JSON tree   | Proposed |
| [0012](./0012-pages-store-level-themes-declarative.md)  | Pages belong to the store; themes are declarative    | Proposed |
| [0013](./0013-single-multitenant-storefront.md)         | One multi-tenant storefront engine                   | Proposed |
| [0014](./0014-background-jobs-postgres-queue-outbox.md) | Postgres-backed job queue and transactional outbox   | Proposed |
| [0015](./0015-media-storage-user-content-domain.md)     | Media storage and user-content domain                | Proposed |
| [0016](./0016-hosting-edge-custom-domain-tls.md)        | Portable containers, managed data, edge-managed TLS  | Proposed |
| [0017](./0017-validation-zod.md)                        | Centralised validation with zod                      | Proposed |
| [0018](./0018-search-behind-interface.md)               | Search behind an interface, PostgreSQL first         | Proposed |
| [0019](./0019-dependency-and-toolchain-policy.md)       | Dependency and toolchain policy                      | Proposed |

Proposed ADRs become Accepted when the Milestone 0 review is approved.
