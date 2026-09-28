# ADR-0032: Custom domains, hosting provider and brand delivery (Milestone 7)

- Status: Accepted
- Date: 2026-09-28

## Context

M4 built the storefront's host data plane: hostname normalisation,
`StoreDomain`, host resolution through `app_storefront_resolve()` (ACTIVE
rows only), canonical redirects from the database primary, platform
subdomains and invalidation by `host:`/`store:` tags. Nothing yet lets a
merchant connect `abc.com`. The M7 audit is
[m7-gap-analysis.md](../roadmap/m7-gap-analysis.md). This ADR records how
custom domains are added, proven, served and removed, and the boundary with
the hosting provider. Theme packaging decisions are in ADR-0030 and
[08-themes.md](../architecture/08-themes.md).

## Decisions

### 1. Control plane and data plane

- **Data plane** (every shopper request): `Host` → `normaliseHostname` →
  `StoreDomain` (database, via the process cache) → store → render. It never
  calls the hosting provider. A provider outage cannot take an ACTIVE
  storefront offline.
- **Control plane** (merchant and worker only): add, verify, make primary,
  remove, provider registration, TLS readiness. Provider calls live here.

One storefront deployment serves every store (`*.storevia.site` and every
custom domain). No per-merchant project, repository or build.

### 2. `DomainProvisioner` (packages/domains)

The first-party boundary the deployment guide already named:
`addDomain`, `removeDomain`, `getDomainStatus` (registration, provider
verification, DNS configuration, certificate, the routing records the
provider wants) and `verifyDomain`, plus `lookupTxt` for ownership proof.
All idempotent: adding a domain already on Storevia's project, removing one
that is gone, and repeated status checks succeed. Failures are typed
(`timeout`, `unavailable`, `conflict`, `invalid`, `not_found`); no raw
provider payload leaves the adapter.

- **Local provider** (development, CI, E2E): deterministic, no network. A
  JSON file (`DOMAIN_PROVIDER_LOCAL_STATE`, default in the OS temp directory)
  simulates DNS: TXT records, whether the domain points at Storevia, and
  certificate state. Hostnames whose first label is `provider-error`,
  `provider-timeout` or `provider-conflict` simulate those failures.
- **Vercel provider** (production): the Vercel REST API with a server-side
  token (`VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID`)
  from the environment or secret manager. Never stored per merchant, never
  sent to a browser, never logged. Merchants never need a Vercel account.
  Selected by `DOMAIN_HOSTING_PROVIDER=local|vercel`; `vercel` is refused
  without its credentials, `local` is refused when `STOREVIA_ENV=production`.

Polling is enough: the provider has no webhook we depend on, so there is no
provider webhook endpoint to authenticate.

### 3. Ownership proof

Typing a domain proves nothing. A custom domain becomes ACTIVE only when
**both** hold:

1. **Storevia ownership:** a TXT record at `_storevia-verification.{host}`
   with value `storevia-verification={token}`. The token is 32 random bytes
   (base64url) generated per `StoreDomain` row — never derived from an
   application secret, public by design, and useless to anyone else: a new
   claim gets a new token, so a record left behind by a previous owner can't
   hand the domain to the next tenant (dangling-DNS takeover).
2. **Provider readiness:** registered on Storevia's project, verified by the
   provider (its own TXT challenge when it asks for one), DNS pointing at the
   provider, certificate issued.

### 4. Lifecycle

| From                | Event                                    | To                                                                  |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| —                   | merchant adds `abc.com`                  | `PENDING`                                                           |
| `PENDING`           | provider registration succeeds           | `VERIFYING` (DNS instructions stored)                               |
| `PENDING`           | provider fails                           | `PENDING` (`provider_error`; the worker retries)                    |
| `VERIFYING`         | ownership + provider ready               | `ACTIVE` (`verifiedAt`)                                             |
| `VERIFYING`         | still waiting                            | `VERIFYING` (reason: TXT missing / routing missing / HTTPS pending) |
| `PENDING/VERIFYING` | backoff exhausted (~3½ days)             | `FAILED` (`verification_timeout`)                                   |
| `FAILED`            | merchant clicks **Check again**          | `VERIFYING` (attempts reset)                                        |
| `ACTIVE`            | monitoring finds DNS/provider lost       | `ACTIVE` with `dns_lost` (still served)                             |
| `ACTIVE` (lost)     | lost for 12 consecutive checks (~3 days) | `FAILED`; if primary, the platform host becomes primary             |
| any                 | merchant removes                         | row deleted (audit keeps the history)                               |

`checkAttempts` drives backoff (every minute for 10 minutes, then 5
minutes, 30 minutes, 2 hours) and the monitoring streak; ACTIVE domains are
re-checked every 6 hours. `failureReason` holds a short code the dashboard
maps to copy (`dns_txt_missing`, `dns_routing_missing`,
`certificate_pending`, `provider_error`, `provider_conflict`,
`verification_timeout`, `dns_lost`). `dnsRecords` stores the provider's
routing instructions so the dashboard never waits on the provider.

### 5. Verification runs in the worker

`domains.verify` (every minute) takes due rows with `FOR UPDATE SKIP LOCKED`,
at most 25 per run, each in its own short transaction with bounded provider
timeouts (8 s). **Check again** runs the same evaluation for one row, rate
limited per store. Every transition is a conditional update on the locked
row, so a removal and an activation can't interleave.

### 6. Primary domain

Exactly one primary per store (existing partial unique index) and it must be
ACTIVE (new CHECK). Switching locks the store's domain rows and moves the
flag in one transaction; the platform host is the fallback primary when a
primary custom domain is removed or fails. Redirect targets always come from
the database primary; the `domain.changed` event invalidates `store:{id}`
(every host of the store) and the hostnames involved.

### 7. Platform subdomain

Every store keeps `{slug}.storevia.site` (always ACTIVE, not removable). With
a custom primary it redirects there — a stable Storevia identity and a
recovery route.

### 8. Removal and reuse

Removal unregisters from the provider first (idempotent; a provider failure
refuses the removal and changes nothing) and deletes the row, releasing the
hostname immediately; the audit log keeps the history. **Custom domains can
change owner** (a merchant sells a brand); **Storevia slugs never can**
(slug history, anti-phishing). A later claim must prove ownership again with
its own fresh token.

### 9. Policy

Adding requires `domain.manage` and the `custom_domain` feature
(`assertFeature`, never plan names); it is rate limited per store (10 adds
and 30 checks per hour; worker retries aren't). Hostnames are refused with
schemes, paths, ports, userinfo, IP literals, `localhost`/`.local`/
`.internal`/`.invalid`/`.test`/`.example` (the last two allowed only with the
local provider), Storevia's own domains (the storefront root and the
dashboard, marketing and admin hosts and their parent domains) and anything
already claimed. Audit: `domain.added`, `domain.verification_requested`,
`domain.verified`, `domain.verification_failed`, `domain.primary_changed`,
`domain.removed`. Metrics with the same names plus `domain.provider_error`.

### 10. TLS

The hosting provider issues, renews and terminates certificates. Storevia
stores only a simplified readiness (`Setting up HTTPS` / `Active` /
`Problem`) and never implements ACME.

### 11. Caches across instances

The host cache is per process. One storefront instance is correct today;
with several, every invalidation must reach each instance (the worker's
dispatch to one internal URL is not enough). Serverless hosting (Vercel)
bounds staleness by the 30-second TTL. Shared cache or fan-out is M8 work
and is recorded in the deployment guide.

## Consequences

- One migration (`20270101010000_custom_domains`): `checkAttempts`,
  `dnsRecords`, CHECKs (primary ⇒ ACTIVE, platform host ⇒ ACTIVE, token
  format), immutable hostname/type, domain outbox events only on routing
  changes, worker grants.
- Owner actions still required before production: Vercel project and token,
  wildcard `*.storevia.site`, PSL submission for `storevia.site`.
