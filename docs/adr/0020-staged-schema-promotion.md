# ADR-0020: Staged promotion of the draft schema into migrations

- Status: Accepted
- Date: 2026-09-24

## Context

`docs/database/schema.draft.prisma` (79 models) is the approved ERD. Milestone
1 creates the first real migration. There are two options: migrate all 79
models now, or migrate only the models the current milestone implements.

Migrating everything now would:

- create ~65 tables that no code reads or writes, each needing RLS policies,
  grants and tests before anything exercises them;
- turn every later refinement of a future model (inevitable once catalogue,
  checkout or the builder are actually built) into an ALTER migration against
  production tables, instead of an edit to the design draft;
- make the first migration very large and hard to review.

## Decision

1. The draft stays the **design source of truth** for all future models. It is
   not trimmed.
2. Each milestone **promotes** the models it implements from the draft into
   `packages/database/prisma/schema.prisma` and adds one reviewed migration
   (Prisma DDL + hand-written SQL for RLS, grants, triggers, partial indexes,
   CHECKs).
3. Milestone 1 promotes the **foundational** models: `User`, `Account`,
   `Session`, `Verification`, `RateLimit`, `PlatformStaff`, `Organisation`,
   `Membership`, `MembershipStoreAccess`, `Invitation`, `Store`, `StoreDomain`,
   `AuditLog`.
4. Back-relation fields that point at unpromoted models are omitted from the
   live schema. Column names, types and constraints must match the draft.
5. CI enforces agreement: `scripts/check-schema-agreement.mjs` fails if a live
   model is missing from the draft, or if any live scalar field is absent from
   the draft model or has a different type or attributes. When implementation
   changes a promoted model, the draft and ERD change in the same PR.

## Consequences

- Each migration is reviewable and fully covered by tests (RLS, grants,
  isolation) at the moment it ships.
- Future models can still be redesigned freely until promotion.
- The draft and live schema can drift only in the direction CI allows (live ⊆
  draft), so documentation keeps reflecting the implementation.
