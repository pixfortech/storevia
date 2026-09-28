# Monitoring, alerts and runbook

Storevia writes JSON lines to stdout and stderr. The log pipeline (Vercel
log drains for the four web apps, and the worker container's log driver)
forwards them to the monitoring backend. Two kinds of lines matter here:

- **Logs**: `level`, `msg` and fields. `LOG_LEVEL` filters them (default
  `info`).
- **Metrics**: `type: "metric"`, `metric`, `value` and `tags`.
  - `LOG_LEVEL` never filters them.
  - A line carries `requestId` when it is emitted inside a request.
  - An exporter can take them over through `setMetricSink` in
    `@storevia/observability`.

Alerts are rules in the backend over these metrics. This file is the
source of truth for the rules: whoever configures them copies the table
below.

## What never appears in logs or metrics

Redaction happens in `@storevia/observability` and has tests.

- **Keys:**
  - Values under secret keys (password, secret, token, signature,
    authorisation, cookie, api key, private key, card, CVV, IBAN,
    credential) become `[REDACTED]`.
  - So do values under personal keys (email, recipient, phone, mobile,
    address, line1/line2, postal code, PIN code, zip, body, customer, first,
    last and full name).
- **Values:** every string value is scanned.
  - Emails become `[email]`.
  - `Bearer …` credentials are redacted.
  - Provider key ids (`rzp_test_…`, `rzp_live_…`, `sk_…`, `whsec_…`)
    become `[key]`.
  - 13–19-digit card-like numbers become `[number]`.
  - Opaque tokens of 40 or more characters (order links, HMACs, session
    ids) become `[token]`.
- **Errors:** error messages are never logged, only name, code, SQLSTATE,
  constraint and stack frames.
- **Request errors:** these log the route and path without the query
  string, and never headers.
- **Metric tags:** tag values are scrubbed the same way. Code never puts
  customer data, hostnames or tokens in tags.

## Correlation

- **Request ids.** Every web app's proxy assigns `x-request-id`, or keeps a
  well-formed one from upstream (for example Vercel's edge or a load
  balancer). It returns the id on the response and forwards it to the
  app.
- **Where the id is bound.** It is bound to everything logged in:
  - dashboard and platform-admin server actions (`runAction`);
  - the payment webhook route;
  - every storefront page and action (`requestStore`).
- **What carries it.** Logs from `@storevia/commerce`, `payments`,
  `tenancy` and the rest carry the id without changes to their code
  (`withLogContext`, `bindLogContext`). Audit rows store it too.
- **Worker.** Every line a job run logs carries `job` and `jobRunId`, the
  id of the `JobRun` row that platform-admin shows.
- **Unhandled server errors.** These are reported by each app's
  `instrumentation.ts` (`onRequestError`) as `request failed` with
  `requestId`, `routePath`, `routeType` and `digest`. The digest is what
  Next.js shows the user on an error page.

A support reference such as "(Reference: 4f0c…)" in a dashboard error is
that request id. Search the logs for it.

## Metrics

| Area             | Metric                                                                                                                                                                                                                                                                                                                 | Tags                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Web apps         | `app.request_error`                                                                                                                                                                                                                                                                                                    | `app`, `routeType`        |
| Checkout         | `checkout.started`, `checkout.payment_started`, `checkout.payment_start_failed`, `checkout.order_created`, `checkout.payment_captured`, `checkout.payment_amount_mismatch`, `checkout.capture_without_order`, `checkout.late_capture`, `checkout.payment_expired`, `checkout.expired`                                  | `provider` where relevant |
| Payment webhooks | `payments.webhook_failed`, `payments.webhook_rejected` (`reason`), `payments.webhook_malformed`, `payments.webhook_throttled`, `payments.webhook_duplicate`                                                                                                                                                            | `provider`                |
| Orders           | `orders.refund`, `orders.completed`, `orders.notification_sent`, `orders.notification_failed`, `orders.staff_notifications`, `orders.staff_notification_failed`, `orders.customer_message`                                                                                                                             |                           |
| Worker           | `jobs.run` (`status`), `jobs.failed` (`reason`), `jobs.timeout`, `jobs.lease_expired`, `jobs.slot_abandoned`, `jobs.duration_ms`                                                                                                                                                                                       | `job`                     |
| Domains          | `domain.verified`, `domain.verification_failed` (`reason`), `domain.provider_error`, `domain.primary_changed`                                                                                                                                                                                                          |                           |
| Media            | `media.processed` (`outcome`: ready, rejected or failed), `media.processing_ms`, `media.stuck_processing_recovered`, `media.abandoned_uploads`, `media.object_delete_failed`                                                                                                                                           |                           |
| Cache            | `storefront.cache_invalidated` (`via`: log or post), `storefront.invalidations_applied`, `storefront.invalidation_lag_ms`, `storefront.invalidation_feed_failed`, `storefront.invalidation_post_failed`, `storefront.outbox_dispatched`                                                                                |                           |
| Lifecycle        | `retention.removed` (`item`), `organisations.deleted`, `organisations.delete_failed`, `media.objects_purged`, `billing.notices_sent`, `billing.notices_failed`                                                                                                                                                         | `item` where relevant     |
| Queues (gauges)  | `ops.outbox_backlog`, `ops.outbox_oldest_seconds`, `ops.notifications_pending`, `ops.notifications_oldest_pending_seconds`, `ops.notifications_failed`, `ops.messages_unannounced_oldest_seconds`, `ops.payment_webhooks_failed`, `ops.jobs_failing`, `ops.jobs_overdue`, `ops.media_processing`, `ops.domains_failed` |                           |

The queue gauges come from the `ops.metrics` job every minute. They are
platform-wide aggregates from `app_operations_snapshot()`. Platform-admin →
Background jobs → Queues shows the same numbers, with the same thresholds
(`QUEUE_SIGNALS` in `packages/billing/src/operations.ts`).

## Alert rules

Severity:

- **Page:** someone acts now.
- **Ticket:** within a working day.

Each rule links to a runbook entry below.

| #   | Condition                                                                                                       | Severity                                                                     | Runbook                                  |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| A1  | Worker `/health` returns non-200 for 3 minutes, or no `ops.*` metric arrives for 5 minutes                      | Page                                                                         | [R1](#r1-worker-down-or-degraded)        |
| A2  | `ops.jobs_overdue` ≥ 1 for 5 minutes                                                                            | Page                                                                         | [R1](#r1-worker-down-or-degraded)        |
| A3  | `ops.jobs_failing` ≥ 1 for 15 minutes                                                                           | Ticket; Page if the job is `checkout.expiry` or `storefront.outbox-dispatch` | [R2](#r2-a-job-keeps-failing)            |
| A4  | `payments.webhook_failed` > 0 in 5 minutes, or `ops.payment_webhooks_failed` rising                             | Page                                                                         | [R3](#r3-payment-webhooks-failing)       |
| A5  | `checkout.payment_start_failed` / `checkout.payment_started` > 20 % over 15 minutes (with at least 10 attempts) | Page                                                                         | [R4](#r4-payments-cant-start)            |
| A6  | `checkout.capture_without_order` or `checkout.payment_amount_mismatch` > 0                                      | Page                                                                         | [R5](#r5-money-without-an-order)         |
| A7  | `ops.outbox_oldest_seconds` > 120 for 5 minutes                                                                 | Ticket; Page above 900                                                       | [R6](#r6-storefront-updates-not-applied) |
| A8  | `storefront.invalidation_feed_failed` > 10 in 5 minutes                                                         | Page                                                                         | [R6](#r6-storefront-updates-not-applied) |
| A9  | `ops.notifications_oldest_pending_seconds` > 900, or `orders.notification_failed` > 5 in 15 minutes             | Ticket                                                                       | [R7](#r7-order-emails-not-sent)          |
| A10 | `ops.messages_unannounced_oldest_seconds` > 300                                                                 | Ticket                                                                       | [R2](#r2-a-job-keeps-failing)            |
| A11 | `app.request_error` > 20 in 5 minutes for any `app`                                                             | Page                                                                         | [R8](#r8-web-app-errors)                 |
| A12 | `domain.provider_error` > 10 in 15 minutes                                                                      | Ticket                                                                       | [R9](#r9-hosting-provider-errors)        |
| A13 | `media.processed{outcome=failed}` > 5 in 15 minutes, or `media.stuck_processing_recovered` > 0                  | Ticket                                                                       | [R10](#r10-media-failures)               |
| A14 | `jobs.timeout` > 0                                                                                              | Ticket                                                                       | [R2](#r2-a-job-keeps-failing)            |
| A15 | `organisations.delete_failed` > 0 on 3 consecutive hourly runs                                                  | Ticket                                                                       | [R11](#r11-lifecycle-jobs)               |
| A16 | `billing.notices_failed` > 0 on 3 consecutive hourly runs                                                       | Ticket                                                                       | [R11](#r11-lifecycle-jobs)               |

A status page (M8-03) is an owner decision. Until it exists, A1, A4, A5
and A11 are the signals a status page would show.

## Runbook

### R1 Worker down or degraded

1. Check the worker's `/health`, which returns `status`, `running`,
   `abandoned` and `lastError`, and `/ready`, which pings the database.
   - `degraded` with `abandoned ≥ 3`: jobs ignored their timeout. Restart
     the worker. The runs are already recorded FAILED, and slots retry.
   - `/ready` returns 503: the database is unreachable. Check Neon status
     and `DATABASE_WORKER_URL`.
2. Platform-admin → Background jobs lists each job's last run. A slot a
   dead worker held is taken over after its lease (5 minutes), and its
   run is recorded `lease_expired`.
3. While no worker runs, these are delayed, not lost:
   - checkouts don't expire and reserved stock isn't released;
   - storefront invalidations wait;
   - emails wait.

### R2 A job keeps failing

1. Platform-admin → Background jobs → Recent runs shows the error name or
   code. `timeout` means the job ran past its limit.
2. Search the logs for `jobRunId` = the run's id. Every line the run
   logged has it.
3. Jobs are idempotent. Fix the cause and the next slot catches up. No
   manual replay is needed.

### R3 Payment webhooks failing

1. `payments.webhook_failed` means processing threw after the signature
   verified. The delivery is recorded FAILED in `PaymentWebhookEvent`, with
   `lastError` (error name and constraint only) and `attempts`.
2. The provider retries (Razorpay for 24 hours). Each retry takes the
   FAILED row again, so fixing the cause lets the next retry succeed.
3. If the provider has given up, re-send the event from the provider
   dashboard. The ledger accepts it because the row is FAILED, not
   PROCESSED.

### R4 Payments can't start

`checkout.payment_start_failed` has the provider tag. Check the provider's
status page, then the merchant's connection. A Razorpay key rotated by the
merchant shows as authentication errors on that store only.

### R5 Money without an order

- `checkout.capture_without_order`: a capture arrived for a checkout that
  couldn't become an order.
- `checkout.payment_amount_mismatch`: the captured amount differs from the
  quote.

Both are flagged on the checkout and payment. Refund or create the order
by hand after checking the provider dashboard. Never ignore these.

### R6 Storefront updates not applied

1. `ops.outbox_oldest_seconds` rising means the dispatch job isn't running
   or is failing. See R1 and R2.
2. `storefront.invalidation_feed_failed` means storefront instances can't
   read `StorefrontInvalidation`.
   - Such an instance clears its caches and keeps serving, with more
     database load. Nothing stale is served.
   - Check the storefront role's grant and `DATABASE_STOREFRONT_URL`.
3. `storefront.invalidation_lag_ms` is the time from a change being logged
   to an instance applying it. It is normally under 2 s.

### R7 Order emails not sent

`orders.notification_failed` carries the error class. After 5 attempts a
notification is FAILED and counted in `ops.notifications_failed`. Check the
email provider (SMTP credentials, sending limits).

### R8 Web app errors

Search `request failed` lines by `app` and `routePath`. The digest matches
what the user saw. A spike right after a deploy means roll back:
Vercel → Deployments → Promote the previous one.

### R9 Hosting provider errors

`domain.provider_error` has `provider` and `kind` tags. ACTIVE domains keep
serving through a provider outage, because the provider is not on the
request path.

### R10 Media failures

- `media.processed{outcome=failed}`: the storage bucket or processing
  failed. Check `MEDIA_*` settings and the bucket.
- `media.stuck_processing_recovered`: an instance died mid-upload. The
  merchant sees a failed upload and retries.
- `media.object_delete_failed`: an object outlived its asset. The media
  sweep retries it every 10 minutes until `objectsPurgedAt` is set (see
  `docs/database/data-lifecycle.md`).

### R11 Lifecycle jobs

- `organisations.delete_failed`: removing a custom domain from the hosting
  provider failed. The organisation stays `PENDING_DELETION` and is retried
  hourly. Check the provider token and `domain.provider_error`; the
  worker log names the organisation, never its data.
- `billing.notices_failed`: the email transport rejected a billing notice.
  The claim is released and the next hourly run retries. Check the email
  provider.
- Support repairs (platform-admin → organisation → Support) are audited:
  - `store.suspended` / `store.restored`;
  - `organisation.suspended` / `organisation.restored`;
  - `order.notifications_retried`.

  Review them in platform-admin → Audit log.
