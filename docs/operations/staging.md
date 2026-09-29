# Staging (and production) topology

> M8 deliverable. Staging is production's shape with sandbox providers and
> synthetic data. Everything here applies to production too, with live
> providers; differences are marked. The owner's one-time steps are in
> [launch-checklist.md](./launch-checklist.md); the provider-by-provider
> hosting notes are in
> [production-hosting.md](../deployment/production-hosting.md).

## 1. Shape

| Piece            | Where                                                          | Notes                                                                                                                                          |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `storefront`     | Vercel project `storevia-storefront` (`apps/storefront`)       | `*.storevia.site` wildcard plus merchant domains (ADR-0032). Staging: `*.staging.storevia.site`                                                |
| `dashboard`      | Vercel project `storevia-dashboard` (`apps/dashboard`)         | `app.storevia.com` (staging `app.staging.storevia.com`). Receives payment and billing webhooks                                                 |
| `marketing`      | Vercel project `storevia-marketing` (`apps/marketing`)         | `storevia.com`                                                                                                                                 |
| `platform-admin` | Vercel project `storevia-admin` (`apps/platform-admin`)        | `admin.storevia.com`, behind zero-trust access (Vercel Deployment Protection / Cloudflare Access) in addition to staff MFA                     |
| `worker`         | Container host (Fly.io, Render, ECS): `apps/worker/Dockerfile` | One long-running process (≥ 1 replica; several are safe, jobs are claimed with `SKIP LOCKED`). Not a Vercel function                           |
| PostgreSQL       | Neon project in the launch region                              | One role per surface (below), pooled endpoint for apps, direct endpoint for migrations. PITR on (see [backup-restore.md](./backup-restore.md)) |
| Media            | S3-compatible bucket + CDN at `media.storeviausercontent.com`  | `uploads/` never served and expired by a lifecycle rule; processed objects public-read through the CDN only                                    |
| Email            | SMTP provider (Postmark, SES)                                  | `EMAIL_TRANSPORT=smtp`; `file` is refused in production                                                                                        |
| Payments         | Razorpay **test mode** in staging                              | Per-merchant keys, sealed with `PAYMENT_CREDENTIALS_KEYS`. The Test Payment Provider is refused outside development and test                   |

Each Vercel project's `vercel.json` sets the install command
(`pnpm install --frozen-lockfile`) and builds the app with turbo from the
repository root. In the Vercel project settings set Root Directory to the
app folder, Node.js 24, and enable Skew Protection (server actions and
client bundles from one deployment keep talking to that deployment).

## 2. Database roles and connection strings

Every running app connects with its own role (RLS and grants are the
security boundary, docs/architecture/03-tenancy.md §5.3). In Neon, create
the roles once as the project owner with the statements
`pnpm db:setup` prints, each with its own generated password, then give
each app only its own URLs:

| Variable                  | Role                  | Used by                                                      |
| ------------------------- | --------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`            | `storevia_app`        | dashboard                                                    |
| `DATABASE_SYSTEM_URL`     | `storevia_system`     | dashboard, platform-admin                                    |
| `DATABASE_CHECKOUT_URL`   | `storevia_checkout`   | dashboard (payment webhooks), storefront                     |
| `DATABASE_BILLING_URL`    | `storevia_billing`    | dashboard (billing webhooks), worker                         |
| `DATABASE_STOREFRONT_URL` | `storevia_storefront` | storefront                                                   |
| `DATABASE_PLATFORM_URL`   | `storevia_platform`   | platform-admin                                               |
| `DATABASE_MARKETING_URL`  | `storevia_marketing`  | marketing                                                    |
| `DATABASE_WORKER_URL`     | `storevia_worker`     | worker                                                       |
| `DATABASE_MIGRATOR_URL`   | `storevia_migrator`   | the **Migrate database** workflow only (never a running app) |

- **Pooled endpoint** (`…-pooler.<region>.aws.neon.tech`) for every app
  URL: PgBouncer in transaction mode. Storevia sets RLS context with
  transaction-local settings and uses no session state (no session
  advisory locks, `LISTEN` or `SET SESSION`), so transaction pooling is
  safe.
- **Direct endpoint** for `DATABASE_MIGRATOR_URL` (migrations take locks
  and must not go through the pooler).
- Every URL ends in `?sslmode=require` (or `verify-full`). The apps refuse
  to boot in staging and production otherwise.
- Pool per instance: `DATABASE_POOL_MAX` (default 10; on Vercel keep it
  small, 3–5, because every function instance opens its own pool),
  `DATABASE_CONNECT_TIMEOUT_MS` (10 s), `DATABASE_IDLE_TIMEOUT_MS` (30 s).
  Connections show as `storevia-<role>` in `pg_stat_activity`.

## 3. Configuration is validated at boot

Each app checks its whole configuration before it takes a request
(`instrumentation.ts` `register()` in the Next.js apps, `src/env.ts` in the
worker). A missing or malformed setting stops the instance with one log
line, `{"level":"fatal","msg":"configuration invalid","error":"…"}`, which
names each variable and rule and never a value. A deploy with a bad
setting therefore fails its first health check instead of failing
shoppers. Rules by stage:

| Rule                                                                             | development | test | preview | staging | production |
| -------------------------------------------------------------------------------- | :---------: | :--: | :-----: | :-----: | :--------: |
| Required variables present and well-formed                                       |      ✓      |  ✓   |    ✓    |    ✓    |     ✓      |
| Package checks (payment key ring, media, email, domains, mock billing secret)    |             |  ✓   |    ✓    |    ✓    |     ✓      |
| `ORDER_ACCESS_SECRET`, `STAFF_MFA_KEYS` set; no `replace-me` placeholder secrets |             |      |    ✓    |    ✓    |     ✓      |
| `TRUSTED_CLIENT_IP_HEADER` set; database URLs require TLS                        |             |      |         |    ✓    |     ✓      |
| `STOREFRONT_PROTOCOL=https`; `DOMAIN_HOSTING_PROVIDER=vercel`; no file email     |             |      |         |         |     ✓      |

`TRUSTED_CLIENT_IP_HEADER` on Vercel is `x-real-ip` (behind Cloudflare,
`cf-connecting-ip`). Without it every client shares one IP and per-IP rate
limits stop meaning anything.

## 4. Variables by app

Secrets live in each Vercel project's environment (per environment:
Preview, Staging, Production) and in the worker host's secret store. None
is shared across apps unless the table says so. `.env.example` documents
each variable.

| Variable                                                                             | dashboard | storefront | marketing | platform-admin | worker |
| ------------------------------------------------------------------------------------ | :-------: | :--------: | :-------: | :------------: | :----: |
| `STOREVIA_ENV`                                                                       |     ✓     |     ✓      |     ✓     |       ✓        |   ✓    |
| `TRUSTED_CLIENT_IP_HEADER`                                                           |     ✓     |     ✓      |     ✓     |       ✓        |        |
| `DASHBOARD_URL`                                                                      |     ✓     |            |     ✓     |                |   ✓    |
| `MARKETING_URL`                                                                      |     ✓     |            |     ✓     |                |        |
| `CONTACT_INBOX`                                                                      |           |            |     ✓     |                |        |
| `SUPPORT_URL` (optional)                                                             |     ✓     |            |           |                |        |
| `PLATFORM_ADMIN_URL`, `AUTH_PLATFORM_SECRET`, `STAFF_MFA_KEYS`                       |           |            |           |       ✓        |        |
| `AUTH_SECRET`                                                                        |     ✓     |            |           |                |        |
| `STOREFRONT_ROOT_DOMAIN`, `STOREFRONT_PROTOCOL`                                      |     ✓     |     ✓      |           |                |        |
| `STOREFRONT_PREVIEW_SECRET` (shared)                                                 |     ✓     |     ✓      |           |                |        |
| `STOREFRONT_REVALIDATE_SECRET` (shared)                                              |           |     ✓      |           |                |   ✓    |
| `STOREFRONT_INTERNAL_URL`                                                            |           |            |           |                |   ✓    |
| `ORDER_ACCESS_SECRET` (shared), `ORDER_ACCESS_SECRET_PREVIOUS`                       |           |     ✓      |           |                |   ✓    |
| `PAYMENT_CREDENTIALS_KEYS` (shared)                                                  |     ✓     |     ✓      |           |                |        |
| `MEDIA_*`, `S3_*`                                                                    |     ✓     |            |           |                |   ✓    |
| `DOMAIN_HOSTING_PROVIDER`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` |     ✓     |            |           |                |   ✓    |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `EMAIL_FROM`                                          |     ✓     |            |     ✓     |       ✓        |   ✓    |
| `BILLING_MOCK_ENABLED`, `MOCK_BILLING_WEBHOOK_SECRET` (staging only)                 |     ✓     |            |           |       ✓        |   ✓    |
| `DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS`       |     ✓     |     ✓      |     ✓     |       ✓        |   ✓    |
| `WORKER_POLL_INTERVAL_MS`, `WORKER_HEALTH_PORT`, `WORKER_HEALTH_HOST`                |           |            |           |                |   ✓    |
| `LOG_LEVEL`                                                                          |     ✓     |     ✓      |     ✓     |       ✓        |   ✓    |

Merchant support (DB-3): every "Help and support" link in the dashboard
(the account menu, the billing page, store settings and the error page)
goes to the dashboard's `/support` route, which redirects to `SUPPORT_URL`
or, when that is unset, to `MARKETING_URL` + `/contact` (the marketing
contact form, delivered to `CONTACT_INBOX`). The dashboard refuses to boot in
staging and production without one of the two. Set `SUPPORT_URL` only when
support moves to its own help desk; changing it needs no rebuild.

Plus each app's database URLs from §2. Never set `TEST_PAYMENTS_ENABLED`,
`DEMO_ORDER_DELETION_ENABLED`, `AUTH_BREACHED_PASSWORD_CHECK=off`,
`EMAIL_TRANSPORT=file`, `RAZORPAY_API_URL` or `VERCEL_API_URL` outside
development and CI.

## 5. The worker host

```sh
docker build -f apps/worker/Dockerfile -t storevia-worker:$(git rev-parse --short HEAD) .
```

- The image contains no secrets (`.dockerignore` excludes `.env*` and keys);
  configuration comes from the host's environment.
- Runs as the unprivileged `node` user. `WORKER_HEALTH_HOST=0.0.0.0` and
  port 3004 are the image defaults.
- Probes: liveness `GET /health` (503 when the scheduler loop has stalled
  or is stopping), readiness `GET /ready` (database reachable within 2 s).
  The image also declares a Docker `HEALTHCHECK` on `/health`.
- Stop with SIGTERM and a grace period of at least 60 s: the worker
  finishes the running job, releases its claim and closes its pools
  (verified: exit code 0).
- Behind a TLS-intercepting proxy, pass the proxy CA as a build secret
  (`--secret id=extra_ca,src=…`); it never lands in a layer.

## 6. Deploy order

1. CI green on the commit (Verify, Integration, E2E, Windows, Secret scan).
2. **Migrate database** workflow (Actions → _Migrate database_ → staging).
   Migrations are expand-only, so the running version keeps working.
3. Deploy the worker image, then the four Vercel projects (promote the
   same commit in each).
4. Smoke test: each app's `/api/health`, the worker's `/ready`, sign in,
   open a store on `{slug}.staging.storevia.site`, place a Razorpay
   test-mode order (see [razorpay-staging.md](./razorpay-staging.md)).

Production follows the same order from a release tag, with the
`production` GitHub environment's required reviewers approving the
migration.
