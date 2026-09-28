# Milestone 7 gap analysis (custom domains, hosting, brand delivery)

Baseline: `milestone-6-accepted` (commit `cf1470a`, CI run 92 green). This
audit decided what M7 builds and what it must leave alone.

## Already complete (do not rebuild)

| Area                      | Where                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StoreDomain` model       | hostname (globally unique), type `PLATFORM_SUBDOMAIN`/`CUSTOM`, status `PENDING/VERIFYING/ACTIVE/FAILED`, token, primary, timestamps, `providerRef` |
| Constraints               | one primary per store (partial unique index), lower-case hostname CHECK, composite tenant FK, immutable owner trigger, tenant RLS                   |
| Hostname normalisation    | `packages/domains/src/hostname.ts`: ports, IP literals, IDNA/punycode, RFC 1123 labels, ≤ 253 chars                                                 |
| Host → store resolution   | `app_storefront_resolve()` (ACTIVE rows only) + in-process cache with `host:`/`store:` invalidation                                                 |
| Canonical redirects       | Site Engine pipeline: 301 to the database primary, path and query kept; never from request input                                                    |
| Platform subdomains       | `{slug}.{root}`; slug changes keep the old host as a redirect; slug history prevents reuse                                                          |
| Internal-header stripping | pipeline removes `x-sv-*`; the store header is signed                                                                                               |
| Host-only cookies         | cart, checkout, flash, preview (`__Host-` on HTTPS)                                                                                                 |
| Preview                   | signed, store-bound, 15 minutes, noindex + no-store                                                                                                 |
| Invalidation              | `domain.changed` outbox events → `store:{id}` + `host:{hostname}` tags → worker dispatch → storefront revalidate endpoint                           |
| Entitlement + permission  | `custom_domain` feature (BOOLEAN), `domain.manage` permission                                                                                       |
| Theme engine              | `ThemeDefinition` + presets + validated settings → tokens; draft/publish; preview                                                                   |
| Checkout on any host      | origin checks by Next (same host), return URL from the request host, CSP `form-action` for provider pages                                           |
| Media                     | processed assets only, `Cross-Origin-Resource-Policy: cross-origin`, CSP `img-src` = media origin                                                   |

## Partial

| Area                    | Gap                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Domain status model     | statuses exist; no transitions, no service writes them for custom domains                                         |
| `domain.changed` events | fire on **every** row update — a verification worker touching `lastCheckedAt` would invalidate every minute       |
| Primary invariants      | one primary is enforced; "primary must be ACTIVE" and "platform host always ACTIVE" are not                       |
| Hostname immutability   | owner is immutable; hostname/type can still be rewritten in place                                                 |
| Deployment guide        | recommends Cloudflare for SaaS; names a `DomainProvisioner` interface that doesn't exist; no Vercel project model |
| Cache architecture      | process-local host cache; multi-instance fan-out not documented as a deployment requirement                       |
| Theme packages          | `ThemeDefinition` has no version/compatibility/capabilities; one theme; no install/switch between themes          |

## Missing (M7 builds these)

- `DomainProvisioner` boundary with a deterministic local provider and a
  Vercel adapter (server-side token, idempotent add/remove/status).
- Custom-domain lifecycle services: add (validation, entitlement, RBAC, rate
  limit, global uniqueness), DNS instructions, check again, make primary,
  remove, with audit and metrics.
- Storevia-generated ownership proof (DNS TXT) in addition to provider
  readiness, so a dangling DNS record can't hand a released domain to
  another tenant.
- `domains.verify` worker job with bounded backoff, monitoring of ACTIVE
  domains, and degradation to FAILED after persistent failure.
- Dashboard Settings → Domains; platform-admin domain diagnostics.
- A second first-party theme and the install → customise → preview →
  publish → switch lifecycle, with a versioned theme contract.
- Deterministic E2E: domain lifecycle, tenant isolation, commerce and
  themes on a custom domain.

## Not to touch

The resolver's data path (it stays database/cache only — no provider call on
a shopper request), hostname normalisation rules (tightened only),
slug-history semantics, M5 page documents, M6 commerce, cookie scoping, CSP
beyond what custom domains require.
