# Production hosting and custom domains

> Milestone 7 deliverable (ADR-0032). How Storevia's storefront runs in
> production on Vercel, how merchant domains attach to it, and what the
> platform owner must configure by hand. Nothing here is per merchant.

## 1. One storefront deployment for every store

Every store, on its platform address or its own domain, is served by **one
storefront deployment** (`apps/storefront`). A request's `Host` header picks
the store (`StoreDomain`, ACTIVE rows only); nothing else does: no
`?storeId=`, header or cookie can choose a store.

| Never                                            | Instead                                                  |
| ------------------------------------------------ | -------------------------------------------------------- |
| a Vercel project, repository or build per store  | one storefront project; stores are rows                  |
| a deploy when a merchant adds or changes domains | the dashboard adds the domain to the one project via API |
| merchants with Vercel accounts or tokens         | Storevia's own server-side token (§4)                    |

The other apps (dashboard, marketing, platform-admin) are separate Vercel
projects (or containers). The worker is a long-running process (§6).

## 2. Control plane and data plane

```text
Control plane (rare, may be slow, may fail)      Data plane (every shopper request)
───────────────────────────────────────────      ───────────────────────────────────
dashboard: add / check / primary / remove        storefront proxy: Host → StoreDomain
worker: domains.verify (every minute)            (process cache, 30 s) → store → page
  └─ DomainProvisioner → Vercel API, DNS          no provider call, no DNS lookup
  └─ writes StoreDomain (status, records)
  └─ outbox → cache invalidation ─────────────►  host:{hostname}, store:{id} evicted
```

- The provider is called **only** from the dashboard's domain actions and
  the worker. The storefront never imports `@storevia/domains/provisioner`
  (lint rule and import-graph test).
- A Vercel outage stops new domains from verifying. It never takes an
  ACTIVE domain offline: the storefront reads only its own database, and
  the worker never fails an ACTIVE domain because the provider errored
  (ADR-0032 §4).

## 3. Setting up production (owner checklist)

Done once, by the platform owner. Steps marked **manual** can't be done
from this repository.

1. **GitHub → Vercel (manual).** Import the repository into a Vercel team.
   Create the projects: `storevia-storefront` (root `apps/storefront`),
   `storevia-dashboard` (`apps/dashboard`), `storevia-marketing`
   (`apps/marketing`) and `storevia-admin` (`apps/platform-admin`, behind
   zero-trust access). Build command `pnpm turbo run build --filter=<app>`,
   install `pnpm install --frozen-lockfile`, Node 24.
2. **Storefront domains (manual).** On `storevia-storefront`, add
   `storevia.site` and the wildcard `*.storevia.site`. The wildcard needs
   the `storevia.site` zone on Vercel's nameservers (Vercel issues the
   wildcard certificate with a DNS challenge). A wildcard routes every
   subdomain to the storefront. It does **not** make every subdomain a
   store: an unknown host gets the neutral 404 page, and only ACTIVE
   `StoreDomain` rows are served.
3. **App domains (manual).** `app.storevia.com` → dashboard,
   `storevia.com` → marketing, `admin.storevia.com` → platform-admin.
4. **Database (manual).** A Neon (or any PostgreSQL 16+) project in the
   launch region, with a pooled connection string for each role
   (`storevia_app`, `storevia_storefront`, `storevia_checkout`,
   `storevia_worker`, `storevia_platform`, `storevia_system`,
   `storevia_billing`, `storevia_marketing`) and a direct one for the
   migrator. Create the roles once (`pnpm db:setup` shows the statements),
   then `pnpm db:migrate` with `DATABASE_MIGRATOR_URL` from CI before each
   deploy. Pooling must be transaction mode (RLS settings are
   transaction-local).
5. **Media (manual).** An S3-compatible bucket behind a CDN at
   `media.storeviausercontent.com`, configured as in
   [deployment-architecture.md §4](./deployment-architecture.md#4-domains-and-tls)
   (never serve `uploads/`; `Cross-Origin-Resource-Policy: cross-origin` on
   assets only). Custom domains need no media change: images are absolute
   URLs on the media host, allowed by the storefront CSP's `img-src`.
6. **Vercel API token for domains (manual).** Create a token scoped to the
   team that owns `storevia-storefront`. Put it, the project id and the team
   id in the secret manager of the **dashboard** and **worker** only (§4).
7. **Environment variables** for each app, from `.env.example` (§4 and
   [deployment-architecture.md](./deployment-architecture.md)).
8. **Public Suffix List (manual, slow).** Submit `storevia.site` to the
   PSL ([public-suffix-list.md](./public-suffix-list.md)). Until it is
   accepted, don't describe store subdomains as isolated sites; custom
   domains are unaffected.
9. **Smoke test:** create a store, open `{slug}.storevia.site`, add a test
   domain you control, add its records, and watch it become ACTIVE in
   Settings → Domains and in platform-admin → Domains.

## 4. Custom-domain configuration

| Variable                      | Apps                        | Value                                                                            |
| ----------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `DOMAIN_HOSTING_PROVIDER`     | dashboard, worker           | `vercel` in production (`local` is refused when `STOREVIA_ENV=production`)       |
| `VERCEL_API_TOKEN`            | dashboard, worker           | secret manager only. Never per merchant, never in a browser bundle, never logged |
| `VERCEL_PROJECT_ID`           | dashboard, worker           | the `storevia-storefront` project id                                             |
| `VERCEL_TEAM_ID`              | dashboard, worker           | the team id (omit for a personal account)                                        |
| `VERCEL_API_URL`              | dashboard, worker           | unset (tests point it at a fake)                                                 |
| `DOMAIN_PROVIDER_LOCAL_STATE` | dashboard, worker (dev, CI) | the local simulator's state file; unset in production                            |
| `STOREFRONT_ROOT_DOMAIN`      | all                         | `storevia.site`; Storevia's own names can never be added as custom domains       |

The storefront needs **none** of these: it never talks to the provider.
The Vercel adapter sends the token only in the `Authorization` header;
its errors carry an HTTP status or a kind (`timeout`, `unavailable`,
`conflict`, `invalid`), never a response body, and the dashboard shows
merchants fixed copy, never provider text.

## 5. The merchant's side

1. **Settings → Domains → Connect a domain** (`domain.manage`; plan feature
   `custom_domain`). The domain is normalised (lower case, punycode, no
   trailing dot) and refused if it has a scheme, path, port, credentials,
   is an IP address, a special-use name (`localhost`, `.local`,
   `.internal`, …) or one of Storevia's own.
2. Storevia registers it on the storefront project and shows the records to
   add at the merchant's DNS host:
   - **TXT** `_storevia-verification.{domain}` = `storevia-verification={token}`
     (proves this store owns it; a new token for every claim);
   - **A** `{domain}` → the provider's address for a root domain, or
     **CNAME** `{domain}` → the provider's target for a subdomain;
   - any **TXT** the provider itself asks for (e.g. when the domain was used
     on another Vercel account).
3. The worker checks every minute at first, backing off to every two hours,
   for about 3½ days; "Check again" checks at once. ACTIVE needs the
   ownership record **and** the provider's verification, routing and
   certificate. Then the domain serves the store (redirecting to the
   primary until it is made primary).
4. **Make primary**: every other host 301-redirects to it with path and
   query; canonical links, sitemap, robots and structured data use it.
   The platform address stays and redirects.
5. **Remove**: the platform address becomes primary again if needed, the
   domain leaves the provider project, and the row is deleted. It can be
   added again (by any store) only with a new ownership record.

TLS is the provider's: Vercel issues and renews certificates. Storevia runs
no ACME client; it shows "HTTPS on", "HTTPS pending" or "HTTPS after
verification".

## 6. Worker and caches

- `domains.verify` runs every minute in the worker (a long-running process:
  Vercel functions don't host it). Run the worker as a container
  (Fly.io, Render, ECS) with `DATABASE_WORKER_URL` and the domain
  variables above. Several workers are safe: each domain is claimed with
  `FOR UPDATE SKIP LOCKED`.
- **Caches are per instance, invalidation reaches all of them (M8,
  ADR-0034).** The storefront's host cache (30 s) and page-data cache
  (5 min) live in each process. The worker (`storefront.outbox-dispatch`,
  every 5 s) appends the tags of each change to the `StorefrontInvalidation`
  log; every instance reads the log at most once a second, before serving
  from cache, and drops what the tags name. A primary switch, removed
  domain, page publish, product or stock change, or store suspension is
  seen by every instance within about 6 s of the change committing. The
  signed post to `STOREFRONT_INTERNAL_URL` is now an optional fast path.
  If the log can't be read, an instance clears its caches rather than
  serve possibly stale data.

## 7. Metrics and alerts

`domain.added`, `domain.verification_started`, `domain.verified`,
`domain.verification_failed` (tag `reason`), `domain.primary_changed` (tag
`cause`), `domain.removed`, `domain.provider_error` (tags `provider`,
`kind`). Tags never include hostnames, tokens or provider responses. Alert
on a sustained `domain.provider_error` rate and on growth in FAILED domains
(platform-admin → Domains shows counts and reasons, read-only).
