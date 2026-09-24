import "server-only";
import type { PrismaClient } from "@storevia/database";
import { workerDb } from "@storevia/database/worker";
import { createLogger, errorFields, recordMetric, type Logger } from "@storevia/observability";
import { nextSlot, retryDelayMs, slotAtOrAfter, type JobSchedule } from "./schedule";

// Periodic job scheduler (ADR-0023). Claims due jobs with
// FOR UPDATE SKIP LOCKED and a lease, runs them at least once per slot, and
// advances the slot only when a run succeeds or exhausts its retries.

export type JobResult = Readonly<Record<string, string | number | boolean | null>>;

export interface JobContext {
  /** The scheduled time this run covers. */
  readonly slot: Date;
  /** 1 for the first attempt at this slot. */
  readonly attempt: number;
  /** Aborted on timeout or worker shutdown. Long jobs should check it. */
  readonly signal: AbortSignal;
  readonly log: Logger;
}

export interface JobDefinition {
  /** Stable identifier, e.g. "billing.subscription-expiry". */
  readonly name: string;
  readonly schedule: JobSchedule;
  /** Attempts per slot before moving on (default 3). */
  readonly maxAttempts?: number;
  /** Hard timeout per attempt (default 10 min). */
  readonly timeoutMs?: number;
  /** Must be idempotent: a slot can run more than once (retries, lease expiry). */
  run(ctx: JobContext): Promise<JobResult | undefined>;
}

export interface SchedulerOptions {
  readonly workerId: string;
  /** Lease per claim; renewed every leaseMs / 3 while the job runs. */
  readonly leaseMs?: number;
  readonly db?: PrismaClient;
  readonly now?: () => Date;
}

interface Claim {
  readonly name: string;
  readonly slot: Date;
  readonly attempt: number;
  readonly runId: string;
}

const DEFAULT_LEASE_MS = 5 * 60_000;

export class Scheduler {
  private readonly jobs = new Map<string, JobDefinition>();
  private readonly db: PrismaClient;
  private readonly leaseMs: number;
  private readonly now: () => Date;
  private readonly log: Logger;
  private readonly abort = new AbortController();

  constructor(private readonly options: SchedulerOptions) {
    this.db = options.db ?? workerDb();
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.now = options.now ?? (() => new Date());
    this.log = createLogger({ component: "jobs", workerId: options.workerId });
  }

  /** Registers jobs and creates their schedule rows (existing slots are kept). */
  async register(jobs: readonly JobDefinition[]): Promise<void> {
    for (const job of jobs) {
      this.jobs.set(job.name, job);
      const first = slotAtOrAfter(job.schedule, this.now());
      await this.db.scheduledJob.upsert({
        where: { name: job.name },
        create: {
          name: job.name,
          intervalSeconds: job.schedule.everySeconds,
          slot: first,
          nextRunAt: first,
        },
        update: { intervalSeconds: job.schedule.everySeconds },
        select: { name: true },
      });
    }
  }

  /** Stops heartbeats and aborts running jobs (graceful shutdown). */
  shutdown(): void {
    this.abort.abort();
  }

  /** Runs every due job once (one at a time). Returns how many ran. */
  async runDue(): Promise<number> {
    let ran = 0;
    for (;;) {
      if (this.abort.signal.aborted) return ran;
      const claim = await this.claim();
      if (!claim) return ran;
      await this.execute(claim);
      ran += 1;
    }
  }

  private async claim(): Promise<Claim | null> {
    const names = [...this.jobs.keys()];
    if (names.length === 0) return null;
    const now = this.now();
    const leaseUntil = new Date(now.getTime() + this.leaseMs);
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ name: string; slot: Date; attempt: number }[]>`
        SELECT name, slot, attempt FROM "ScheduledJob"
        WHERE name = ANY(${names}::text[])
          AND "nextRunAt" <= ${now}
          AND ("lockedUntil" IS NULL OR "lockedUntil" < ${now})
        ORDER BY "nextRunAt"
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      const row = rows[0];
      if (!row) return null;
      const attempt = row.attempt + 1;
      await tx.scheduledJob.update({
        where: { name: row.name },
        data: {
          attempt,
          lockedBy: this.options.workerId,
          lockedUntil: leaseUntil,
          lastStartedAt: now,
        },
        select: { name: true },
      });
      const run = await tx.jobRun.create({
        data: {
          jobName: row.name,
          slot: row.slot,
          attempt,
          workerId: this.options.workerId,
          status: "RUNNING",
          startedAt: now,
        },
        select: { id: true },
      });
      return { name: row.name, slot: row.slot, attempt, runId: run.id };
    });
  }

  private async execute(claim: Claim): Promise<void> {
    const job = this.jobs.get(claim.name);
    if (!job) return;
    const log = this.log.child({
      job: claim.name,
      slot: claim.slot.toISOString(),
      attempt: claim.attempt,
    });
    const timeout = new AbortController();
    const onShutdown = () => {
      timeout.abort();
    };
    this.abort.signal.addEventListener("abort", onShutdown);
    const timer = setTimeout(
      () => {
        timeout.abort();
      },
      job.timeoutMs ?? 10 * 60_000,
    );
    const heartbeat = setInterval(
      () => {
        void this.renewLease(claim.name).catch((error: unknown) => {
          log.warn("lease renewal failed", { error });
        });
      },
      Math.max(1_000, Math.floor(this.leaseMs / 3)),
    );

    const started = Date.now();
    let result: JobResult | undefined;
    let failure: unknown;
    try {
      log.info("job started");
      result = await job.run({
        slot: claim.slot,
        attempt: claim.attempt,
        signal: timeout.signal,
        log,
      });
      if (timeout.signal.aborted) throw new Error("job aborted (timeout or shutdown)");
    } catch (error) {
      failure = error;
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timer);
      this.abort.signal.removeEventListener("abort", onShutdown);
    }
    const durationMs = Date.now() - started;
    const status = failure === undefined ? "SUCCEEDED" : "FAILED";
    recordMetric("jobs.run", 1, { job: claim.name, status });
    recordMetric("jobs.duration_ms", durationMs, { job: claim.name });
    if (failure === undefined) log.info("job succeeded", { durationMs, ...result });
    else log.error("job failed", { durationMs, error: failure });
    await this.finish(job, claim, failure, result);
  }

  private async renewLease(name: string): Promise<void> {
    await this.db.scheduledJob.updateMany({
      where: { name, lockedBy: this.options.workerId },
      data: { lockedUntil: new Date(this.now().getTime() + this.leaseMs) },
    });
  }

  private async finish(
    job: JobDefinition,
    claim: Claim,
    failure: unknown,
    result: JobResult | undefined,
  ): Promise<void> {
    const now = this.now();
    const maxAttempts = job.maxAttempts ?? 3;
    const succeeded = failure === undefined;
    const exhausted = !succeeded && claim.attempt >= maxAttempts;
    const advance = succeeded || exhausted;
    const following = nextSlot(job.schedule, claim.slot, now);
    const fields = succeeded ? null : errorFields(failure);
    const error = fields
      ? [fields["errorName"], fields["errorCode"]].filter(Boolean).join(":").slice(0, 500) ||
        "error"
      : null;

    await this.db.$transaction(async (tx) => {
      const { count } = await tx.scheduledJob.updateMany({
        where: { name: claim.name, lockedBy: this.options.workerId, slot: claim.slot },
        data: {
          lockedBy: null,
          lockedUntil: null,
          lastFinishedAt: now,
          lastStatus: succeeded ? "SUCCEEDED" : "FAILED",
          ...(advance
            ? { slot: following, nextRunAt: following, attempt: 0 }
            : { nextRunAt: new Date(now.getTime() + retryDelayMs(claim.attempt)) }),
          ...(succeeded ? { consecutiveFailures: 0 } : { consecutiveFailures: { increment: 1 } }),
        },
      });
      if (count === 0) {
        // The lease expired and another worker took the slot over.
        this.log.warn("lost the job lease before finishing", { job: claim.name });
      }
      await tx.jobRun.update({
        where: { id: claim.runId },
        data: {
          status: succeeded ? "SUCCEEDED" : "FAILED",
          finishedAt: now,
          ...(result ? { result } : {}),
          error,
        },
        select: { id: true },
      });
    });
    if (exhausted) recordMetric("jobs.slot_abandoned", 1, { job: claim.name });
  }
}
