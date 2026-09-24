# ADR-0004: PostgreSQL with Prisma ORM 7

- Status: Accepted
- Date: 2026-09-24

## Context

Commerce needs strong transactional guarantees, relational integrity, and
row-level security for tenant isolation. The spec prefers a type-safe ORM and
forbids preview dependencies for foundations.

## Decision

- **PostgreSQL 17+** is the system of record (and the job queue, ADR-0014).
- **Prisma ORM 7.10.x** (latest stable; the npm `latest` tag currently points
  to an 8.0 release candidate, which we do not use) with the PostgreSQL driver
  adapter.
- Prisma migrations are the only way the schema changes. Constraints Prisma
  cannot express (RLS, partial unique indexes, CHECKs, triggers, grants) are
  written as SQL inside the same migrations.
- Only `packages/database` imports the generated client. Domain code uses
  `withTenant(ctx, fn)`.
- Complex reporting queries may use typed raw SQL (`$queryRaw` tagged
  templates or Prisma TypedSQL). `$queryRawUnsafe` is banned.

## Consequences

- Type-safe queries and a single schema source.
- Prisma's schema language cannot express some constraints, so reviewers must
  check the SQL parts of migrations (`docs/database/erd.md` §6 lists them, and
  tests verify them).
- RLS needs transaction-scoped settings. Every tenant query runs in an
  interactive transaction, which is a small overhead that has been accepted.

## Alternatives considered

- **Drizzle ORM**: excellent SQL-first alternative with less runtime. A strong
  option, but it is still pre-1.0 (0.45). Prisma's migration workflow and
  maturity win for now. Revisit if Prisma's RLS/transaction ergonomics become
  a bottleneck.
- **Kysely + hand-written migrations**: more control, more work. Rejected for
  now.
