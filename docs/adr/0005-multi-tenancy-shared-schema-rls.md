# ADR-0005: Multi-tenancy with a shared schema, tenant columns and RLS

- Status: Proposed
- Date: 2026-09-24

## Context

Storevia must host thousands of organisations with strict isolation.
Cross-tenant access is a critical defect.

## Decision

- Shared database and schema. Every tenant-owned row carries `organisationId`;
  store-owned rows also carry `storeId`. Both are required and immutable.
- Four layers of defence: server-built `TenantContext`; `authorize()` +
  entitlements; tenant predicates on every query through `withTenant`;
  PostgreSQL **RLS** (enabled and forced) plus **composite foreign keys**
  `(storeId, organisationId)` and `(parentId, storeId)`.
- RLS context is set with transaction-local `set_config` so it is safe with
  transaction-mode pooling. Unset context shows no rows.
- Foreign resources return 404 (non-disclosure).
- The tenant-isolation suite (T1–T16) is a Milestone 1 exit criterion.

Details: `docs/architecture/03-tenancy.md`.

## Consequences

- One migration path, simple operations, efficient pooling.
- Every tenant query runs in a transaction and every table needs a policy.
  CI checks policy coverage automatically.
- Very large tenants can later be moved to dedicated databases because all
  data is keyed by `organisationId` and uses globally unique IDs.

## Alternatives considered

Database-per-tenant and schema-per-tenant (operational cost, migration fan-out,
poor pooling). Rejected for the default tier.
