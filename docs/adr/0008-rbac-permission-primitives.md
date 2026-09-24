# ADR-0008: RBAC based on permission primitives

- Status: Proposed
- Date: 2026-09-24

## Context

Organisations need staff roles. Hard-coding role names in checks makes custom
roles, API scopes and app scopes impossible to add later.

## Decision

- Code checks **permissions** (`product.update`), never role names.
- System roles (OWNER, ADMIN, STORE_MANAGER, DESIGNER, CATALOGUE_MANAGER,
  ORDER_MANAGER, MARKETING, SUPPORT, VIEWER) are typed permission sets defined
  in one map in `packages/tenancy`. The UI, server enforcement and the
  generated test matrix all come from that map.
- API scopes and future app scopes map onto the same permissions.
- Store access (all stores or specific stores) is a separate dimension on
  the membership.
- Invariants: exactly one OWNER; OWNER-only billing management, ownership
  transfer and organisation deletion; members can only grant subsets of their
  own permissions.

## Consequences

- Custom roles (enterprise) become a data change, not an enforcement change.
- The role matrix is reviewable in one place, and snapshot-tested.
