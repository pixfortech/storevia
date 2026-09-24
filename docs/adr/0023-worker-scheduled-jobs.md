# ADR-0023: Worker and scheduled jobs (spike outcome for M2-04)

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0014 (does not supersede it)

## Context

ADR-0014 chose a PostgreSQL-backed queue (pg-boss or Graphile Worker, to be
decided by a spike) consumed by `apps/worker`. Milestone 2 deferred the
worker. The subscription expiry sweep and usage reconciliation currently
depend on someone running `pnpm billing:sweep`.

The work needed now is **periodic** (every few minutes, nightly), not a
high-volume queue. The spike compared the two libraries with a small
first-party scheduler:

| Option                | Fit now                                      | Problems                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pg-boss               | Queue, retries, cron                         | Creates and migrates its own schema at runtime, so the runtime role needs DDL, or its migrations must be copied out of the library. Its tables live outside Prisma and outside the ADR-0020 schema check. |
| Graphile Worker       | Fast queue, cron                             | Same schema-ownership issue. Its runtime functions are also installed by the library                                                                                                                      |
| First-party scheduler | Exactly the periodic jobs needed, ~300 lines | We own correctness (tested). It isn't a general queue                                                                                                                                                     |

## Decision

1. **`packages/jobs`: a first-party periodic scheduler** on two tables,
   `ScheduledJob` (one row per job) and `JobRun` (history). They are
   promoted through the draft schema and a migration like every other table.
   - **Claiming:** `SELECT … FOR UPDATE SKIP LOCKED` on due rows plus a
     **lease** (`lockedBy`, `lockedUntil`), renewed by a heartbeat while the
     job runs. Several workers can run safely, and each due job runs on one
     worker at a time.
   - **Slots:** each run covers a logical scheduled time (`slot`). A slot
     advances only when its run succeeds or exhausts its retries, in the same
     transaction that records the run. A crash (lease expiry) or retry reruns
     the same slot, so delivery is **at least once** and handlers must be
     idempotent. The subscription sweep and usage reconciliation are.
   - **Failures:** a failure retries with exponential backoff up to the job's
     `maxAttempts`, then moves on to the next slot. Each failure records a
     sanitised error, increments `consecutiveFailures`, logs through
     `@storevia/observability` and emits a `jobs.run` metric, so alerts can
     key on it.
2. **`apps/worker`** is the composition root. It registers the job
   definitions, runs the poll loop, serves `GET /health`, and shuts down
   gracefully on `SIGTERM`/`SIGINT` (it stops claiming and lets the current
   job finish).
3. Initial jobs:
   - `billing.subscription-expiry`: every 5 minutes, runs
     `sweepSubscriptionExpiry` (billing role).
   - `entitlements.usage-reconciliation`: nightly at 03:00 UTC, recomputes
     gauge counters for every organisation in batches, and records drift as a
     log line, a metric and a `SYSTEM` audit entry.
4. **Database role `storevia_worker`** (BYPASSRLS, narrow): the job tables,
   plus the columns reconciliation reads (organisations, stores, memberships)
   and the usage counters it writes. The expiry job uses the existing billing
   role. No other process gets `DATABASE_WORKER_URL`.
5. The **general-purpose queue and transactional outbox** from ADR-0014
   (webhook deliveries, emails, image processing) are still to come. They
   will be built or chosen when the first producer needs them (M3 media or M6
   orders). pg-boss stays a candidate, and that choice will be recorded in its
   own ADR.

## Consequences

- Expiry and reconciliation run without anyone running a command.
  `pnpm billing:sweep` stays available as an operator tool.
- Scheduling precision is the poll interval (5 s by default), which is fine
  for these jobs.
- We maintain the scheduler. Its guarantees (single claimant, lease expiry,
  retries, slot advance) are covered by integration tests against
  PostgreSQL.
