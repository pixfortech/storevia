## Problem

<!-- What problem does this change solve? Link the issue. -->

## Acceptance criteria

- [ ]

## Changes

<!-- Summary of the change and any architectural decisions (link ADRs). -->

## Checklist

- [ ] Tenant isolation considered (server-side context, `authorize`, tenant predicates, RLS, tests)
- [ ] Entitlement checks server-side where the feature is plan-gated
- [ ] Input validated with shared schemas
- [ ] Loading, empty and error states; responsive; accessible
- [ ] Tests added or updated (unit / integration / isolation / E2E as applicable)
- [ ] Migrations are backwards-compatible (expand → migrate → contract)
- [ ] No secrets, credentials or `.env` files committed
- [ ] Documentation / ADR updated
- [ ] `pnpm verify` passes locally
