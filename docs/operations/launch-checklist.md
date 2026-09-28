# Production launch checklist

> M8. Everything that must be true before real merchants and shoppers use
> Storevia, in order. **Manual** items can't be done from the repository;
> they need the owner's accounts. Tick each item in the launch ticket with
> who did it and when. Staging goes through the same list first (with
> sandbox providers), and the launch is a repeat of what worked there.

## 1. Accounts and ownership (manual)

- [ ] GitHub organisation: branch protection on `main` (required checks:
      Verify, Integration, E2E, Windows, Secret scan; one review; no force
      push), and the `staging` and `production` environments with their
      `DATABASE_MIGRATOR_URL` secrets. `production` requires reviewer
      approval.
- [ ] Vercel team (owner plus one backup owner), with spend alerts.
- [ ] Neon organisation (owner plus backup owner), project in the launch
      region (data-residency question Q-S2 answered first).
- [ ] Object storage + CDN account; a second provider or region for the
      backup bucket.
- [ ] Email provider (Postmark or SES), with the sending domain verified.
- [ ] Log/metrics platform and an uptime monitor.
- [ ] Domain registrar access for `storevia.com`, `storevia.site` and
      `storeviausercontent.com`, with registry lock and auto-renew on.
- [ ] Security contact: a `security@storevia.com` mailbox read by at least
      two people. Pen-test findings go here, never to a public tracker.

## 2. Domains and TLS (manual)

- [ ] `storevia.com` → `storevia-marketing`; `app.storevia.com` →
      `storevia-dashboard`; `admin.storevia.com` → `storevia-admin`.
- [ ] `storevia.site` and the wildcard `*.storevia.site` on
      `storevia-storefront`. The wildcard needs the `storevia.site` zone on
      Vercel's nameservers (DNS-challenge certificate).
- [ ] Custom domains: `DOMAIN_HOSTING_PROVIDER=vercel` with a
      `VERCEL_API_TOKEN` scoped to the team, in the dashboard and worker
      only ([production-hosting.md](../deployment/production-hosting.md)).
      Rehearse once with a domain you control: add it, publish the records,
      watch it become ACTIVE with HTTPS.
- [ ] CAA records allowing only the CAs Vercel uses; DNSSEC where the
      registrar supports it.
- [ ] HSTS is sent by the apps over HTTPS (two years, `includeSubDomains;
    preload`). Submitting `storevia.com` to the browsers' preload list is
      a separate, slow-to-undo step: do it only after a week without
      problems, once every subdomain is known to be HTTPS-only.

## 3. Applications (manual, then verified)

- [ ] Four Vercel projects from this repository (`apps/*/vercel.json`),
      Root Directory set to the app, Node 24, Skew Protection on.
- [ ] `storevia-admin` behind Vercel Deployment Protection or Cloudflare
      Access (SSO for staff), in addition to staff MFA.
- [ ] Environment variables per app from
      [staging.md §4](./staging.md#4-variables-by-app). Every secret newly
      generated for production; none copied from staging.
- [ ] Deploy. Each app validates its configuration at boot: a deployment
      that doesn't come up means a missing or malformed setting; its log
      names it.
- [ ] Never set in production: `TEST_PAYMENTS_ENABLED`,
      `BILLING_MOCK_ENABLED`, `DEMO_ORDER_DELETION_ENABLED`,
      `AUTH_BREACHED_PASSWORD_CHECK=off`, `EMAIL_TRANSPORT=file`,
      `RAZORPAY_API_URL`, `VERCEL_API_URL`. (The code refuses the first,
      second and fifth in production regardless.)

## 4. Database (manual, then verified)

- [ ] Roles created from `pnpm db:setup`'s statements, each with its own
      generated password.
- [ ] Apps on the **pooled** endpoint, migrations on the **direct** one,
      every URL with `sslmode=require` ([staging.md §2](./staging.md#2-database-roles-and-connection-strings)).
- [ ] `Migrate database` workflow run against production; `db:check`
      reports up to date.
- [ ] Reference data (plans) seeded: `pnpm db:seed` with the production
      migrator URL, once.
- [ ] History retention (PITR) set to the plan's maximum, at least 7 days.

## 5. Media (manual)

- [ ] Bucket with versioning; `uploads/` never public and expired by a
      lifecycle rule (1 day); processed objects public-read through the CDN
      at `media.storeviausercontent.com` only.
- [ ] Assets served with `Cross-Origin-Resource-Policy: cross-origin` and
      `X-Content-Type-Options: nosniff`; CORS on the bucket allows the
      dashboard origin to upload.
- [ ] `MEDIA_STORAGE=s3` and the `S3_*` / `MEDIA_PUBLIC_BASE_URL` variables
      on the dashboard and worker.

## 6. Worker (manual)

- [ ] Image built from `apps/worker/Dockerfile` for the release commit and
      run on the container host: at least one replica, liveness `/health`,
      readiness `/ready`, SIGTERM with a grace period of at least 60 s,
      restart on failure.
- [ ] Its environment per [staging.md §4](./staging.md#4-variables-by-app);
      `WORKER_HEALTH_HOST=0.0.0.0` (the image default).
- [ ] platform-admin → Jobs shows every job running on schedule.

## 7. Email (manual, then verified)

- [ ] SPF, DKIM and DMARC (`p=quarantine` at least) on the sending domain;
      `EMAIL_FROM` on that domain.
- [ ] Send each template once from staging to a real inbox: sign-up
      verification, password reset, invitation, order confirmation,
      shipped, cancelled, order message, staff notification, billing
      notices (trial ending, payment overdue, plan ended), account
      deletion.
- [ ] Bounces and complaints go to a monitored address.

## 8. Payments

- [ ] The Razorpay rehearsal in [razorpay-staging.md §3](./razorpay-staging.md#3-in-staging-end-to-end-the-launch-rehearsal)
      passed in staging with test keys.
- [ ] The sandbox script passed against Razorpay's test mode
      ([razorpay-staging.md §2](./razorpay-staging.md#2-against-razorpays-test-mode-by-hand-before-launch-after-provider-changes)).
- [ ] Merchant help text for connecting Razorpay (keys, webhook URL and
      secret, the three events) published.
- [ ] Storevia's own subscription billing: no real provider is integrated
      (mock only, refused in production). Plans are assigned by staff in
      platform-admin until one is (a known limitation of M8).

## 9. Backups and recovery

- [ ] Nightly logical dump job on the worker host, uploading to the backup
      bucket ([backup-restore.md §1](./backup-restore.md#1-what-is-backed-up-and-how)).
- [ ] One restore drill of staging into a scratch project, and one PITR
      branch restore, both timed and recorded
      ([backup-restore.md §4](./backup-restore.md#4-the-drill)).
- [ ] RPO/RTO targets agreed ([backup-restore.md §2](./backup-restore.md#2-targets)).

## 10. Monitoring and on-call

- [ ] Log drains from the four Vercel projects and the worker to the log
      platform; structured JSON, no secrets or tokens (verified by the
      observability tests).
- [ ] Alerts A1–A16 from [alerts.md](./alerts.md) configured, each with an
      owner and a runbook link.
- [ ] Uptime checks every minute on each app's `/api/health`, the worker's
      `/health`, and one live store.
- [ ] On-call rota and an incident log; a status page for merchants.

## 11. Security

- [ ] Every platform staff account enrolled in MFA; `SUPER_ADMIN` held by
      at most two people.
- [ ] The pen test in [pen-test-checklist.md](../security/pen-test-checklist.md)
      done against staging, critical and high findings fixed and retested.
- [ ] `gitleaks` over the full history clean (CI's Secret scan).
- [ ] Secrets rotation calendar set ([secrets-rotation.md](./secrets-rotation.md)).
- [ ] Staff SSO: decide before staff grow beyond a few people (ADR-0035).

### Staff MFA reset

When a staff member has lost their authenticator and their recovery codes:

1. Verify the person out of band: a video call with someone who knows
   them, plus a message to the contact details on record (not the channel
   the request came from).
2. A second staff member (not the requester) approves in the incident log.
3. As the schema owner, in one transaction:
   `DELETE FROM "StaffMfa" WHERE "userId" = '<uuid>';`
   `DELETE FROM "Session" WHERE "userId" = '<uuid>' AND realm = 'PLATFORM';`
4. The person signs in and enrols a new authenticator at once; the
   enrolment is audited (`auth.platform.mfa_enrolled`).
5. Record who verified, who approved, and when.

## 12. Legal and data (manual)

- [ ] Terms of service and privacy policy written and reviewed by counsel;
      the marketing site's `/legal/terms` and `/legal/privacy` pages are
      placeholders until then and **must be replaced before launch**.
- [ ] Counsel reviews the retention periods in
      [data-lifecycle.md](../database/data-lifecycle.md) (8 years for
      financial records, 2 years for the audit log, message and log
      windows) for the launch jurisdictions.
- [ ] Decision on the audit-log cold archive before the first 2-year
      deletions (2028).
- [ ] The 8-year hard purge of financial records is built before it's first
      due (2034); a reminder is on the roadmap.
- [ ] A data-processing agreement with each sub-processor (hosting,
      database, storage, email) and a public sub-processor list.

## 13. Public Suffix List (manual, slow)

- [ ] Submit `storevia.site` ([public-suffix-list.md](../deployment/public-suffix-list.md)).
      Acceptance takes weeks; until then, don't describe store subdomains
      as isolated sites. The storefront's host-only cookies protect stores
      from each other meanwhile.

## 14. Go-live

- [ ] Freeze: the release commit is green on every CI job.
- [ ] Migrate production, deploy the worker, then the four apps (the
      order in [staging.md §6](./staging.md#6-deploy-order)).
- [ ] Smoke test: each health endpoint; sign up; create a store; open it on
      `{slug}.storevia.site`; connect Razorpay in test mode on an internal
      store and place a test order; staff sign in with MFA.
- [ ] Rollback plan: Vercel "promote previous deployment" for each app and
      the previous worker image tag; migrations are expand-only, so the
      previous code runs on the new schema.
- [ ] Watch the dashboards for the first 24 hours.
