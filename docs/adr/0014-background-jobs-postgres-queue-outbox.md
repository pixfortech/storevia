# ADR-0014: Postgres-backed job queue and transactional outbox

- Status: Accepted
- Date: 2026-09-24

## Context

Webhooks (in and out), email, image processing, domain verification and
reconciliation need background execution. The spec asks for Redis/queues
"only when required".

## Decision

- Use a **PostgreSQL-backed queue** (pg-boss or Graphile Worker, chosen in
  M2 with a spike) consumed by `apps/worker`. Jobs are claimed with
  `FOR UPDATE SKIP LOCKED`, are idempotent, and retry with backoff.
- Domain events are written to `OutboxEvent` **in the same transaction** as
  the state change. A dispatcher turns them into jobs (webhook deliveries,
  cache invalidation, emails).
- Job payload schemas live in `packages/jobs` (zod), shared by producers and
  the worker.
- Introduce Redis (or a managed queue) only when measurements show Postgres
  is the bottleneck.

## Consequences

- One stateful dependency to operate; enqueue is transactional with business
  data (no lost or phantom jobs).
- Queue throughput is bounded by Postgres. That is fine for the foreseeable
  scale and monitored via queue-lag metrics.
