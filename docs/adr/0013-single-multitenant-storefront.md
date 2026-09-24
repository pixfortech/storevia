# ADR-0013: One multi-tenant storefront engine

- Status: Proposed
- Date: 2026-09-24

## Decision

- A single `apps/storefront` deployment serves every store. The request is
  resolved as hostname → StoreDomain → Store → live theme → route → page →
  document → render tree.
- Rendering uses React Server Components with batched data-binding
  resolution and tag-based caching invalidated by outbox events.
- Storefront code imports only read models and shopper actions. There are
  no admin APIs on storefront hosts.
- Storefronts are served from `storevia.site` (on the Public Suffix List) and
  custom domains, never from `storevia.com`.

Details: `docs/architecture/06-storefront.md`.

## Consequences

- One codebase to secure and optimise; new stores cost nothing to deploy.
- Cache invalidation correctness becomes critical, so it is tested per event
  type.
