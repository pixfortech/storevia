# ADR-0034: Multi-instance cache invalidation

- Status: Accepted
- Date: 2026-09-28

## Context

The storefront keeps two process-local caches (ADR-0028 §9):

- host resolution, with a 30 s TTL;
- page data, with a 5 min TTL: route data, theme and menus, and the
  sitemap.

Database triggers write `OutboxEvent` rows. The worker turned them into
cache tags and posted them, signed, to one `STOREFRONT_INTERNAL_URL`. With
several instances (Vercel runs many), only the instance that received the
post was invalidated. Every other instance served stale host routing for
up to 30 s and stale pages for up to 5 min. That covered store
suspensions, primary-domain switches, page publishes, product edits and
stock changes. When the post failed, the whole outbox stalled behind it.

## Decision

1. **A durable invalidation log.** `StorefrontInvalidation` holds
   `id bigserial`, `tags text[]` (1–5,000 entries) and `createdAt`.
   - The worker appends the tags of each dispatched batch in the same
     transaction that marks the events dispatched.
   - The storefront role may only `SELECT`; only the worker writes and
     purges it. Rows are kept for one day.
   - Tags carry store ids and hostnames only, so the table is global and
     guarded by grants rather than RLS.
2. **Every instance tails the log** (`InvalidationFeed`,
   `packages/site-engine`). The request pipeline calls
   `syncPublicCaches()` before resolving the host, and every cached
   page-data read calls it too.
   - **Throttling.** A process reads at most once a second, and concurrent
     requests share one read.
   - **First read.** The feed clears the process's caches and starts at
     the log's head.
   - **Later reads.** Each read takes rows with `id > cursor`, plus every
     row created in the last 10 s. The overlap catches ids that commit out
     of order. Rows already applied are skipped.
   - **Log unreadable.** The feed clears the caches and retries on the next
     request. The cursor then catches up on anything written meanwhile.
   - **Far behind.** A full page (2,000 rows) clears the caches and skips
     ahead.
   - **Tag checks.** Only well-formed tags are applied.
3. **The signed post becomes a best-effort fast path.**
   - Its failure is counted (`storefront.invalidation_post_failed`) and no
     longer blocks dispatch.
   - `STOREFRONT_INTERNAL_URL` is optional; a URL without a secret is still
     refused outside development and test.
4. **Dispatch every 5 s**, down from 15 s. The worst case from commit to
   every instance is then about 5 s plus 1 s.

**Metrics:**

| Metric                                | Meaning                                       |
| ------------------------------------- | --------------------------------------------- |
| `storefront.cache_invalidated`        | Entries dropped; tag `via`: `log` or `post`   |
| `storefront.invalidations_applied`    | Log rows applied                              |
| `storefront.invalidation_lag_ms`      | Time from a row's creation to its application |
| `storefront.invalidation_feed_failed` | Reads of the log that failed                  |
| `storefront.invalidation_post_failed` | Fast-path posts that failed                   |

## Consequences

- Correctness no longer depends on process-local memory or on which
  instance a request reaches.
- Each instance makes at most one indexed read per second. That is
  negligible next to page queries and bounded by instance count, and it
  needs the pooled connection string.
- Caches still hold data between invalidations. The TTLs remain only a
  safety net.
- `robots.txt` and `sitemap.xml` send `Cache-Control: public, max-age=300`,
  so a CDN may serve them up to 5 min stale. That is acceptable for those
  files, and pages are never CDN-cached (`private, no-store`).

## Alternatives considered

- **Next.js `cacheHandlers` with a shared store.** It needs
  `cacheComponents` and a rewrite of the storefront's data layer around
  `'use cache'`, whose functions can't read the signed request header.
  That is too large for a hardening milestone, and it would add a Redis
  dependency.
- **Redis pub/sub fan-out.** It adds infrastructure and a delivery gap
  when an instance is cold or disconnected. The log gives catch-up for
  free.
- **Postgres `LISTEN/NOTIFY`.** It needs a long-lived connection per
  instance, which serverless functions and transaction poolers don't
  provide.
- **Shorter TTLs only.** They multiply database load and still leave a
  staleness window.
