# ADR-0003: Next.js App Router, one app per product surface

- Status: Proposed
- Date: 2026-09-24

## Context

Storevia has four web surfaces with different audiences, security postures,
caching needs and release cadences: marketing, merchant dashboard, storefront
and platform administration.

## Decision

- Use **Next.js 16 (App Router, React Server Components)**, pinned, for all
  four web surfaces.
- Each surface is a **separate Next.js app** with its own host, cookies, CSP
  and deployment: `apps/marketing`, `apps/dashboard`, `apps/storefront`,
  `apps/platform-admin`.
- The Admin REST API (`/api/v1`) is served by route handlers in the dashboard
  deployment at `api.storevia.com` initially. It can be split into its own app
  later without changing domain code.
- Background work runs in `apps/worker`, a plain Node.js service.

## Consequences

- Strong isolation: a bug in the storefront cannot expose dashboard sessions
  (different hosts, cookies, code bundles). Platform-admin can be deployed
  privately.
- Each app can be scaled and cached independently (the storefront is
  cache-heavy; the dashboard is dynamic).
- Some duplication of app shell setup, mitigated by shared `config` and `ui`
  packages.

## Alternatives considered

- **One Next.js app with host-based routing**: simpler to start with, but it
  mixes security contexts, bundles and failure domains. Rejected.
- **Separate SPA + API server**: loses server components and streaming, and
  means more hand-written API plumbing. Rejected.
