import "server-only";
import { platformDb } from "@storevia/database/platform";
import { requirePlatformPermission, type PlatformContext } from "@storevia/tenancy/platform";

// Background job health for platform-admin (ADR-0023, M8). Read-only: staff
// can see whether scheduled work is running and whether its queues are
// draining, never trigger or change it here. Queue figures are
// platform-wide aggregates (app_operations_snapshot): no tenant rows.

export interface JobHealth {
  readonly name: string;
  readonly intervalSeconds: number;
  readonly nextRunAt: Date;
  readonly lastStartedAt: Date | null;
  readonly lastFinishedAt: Date | null;
  readonly lastStatus: "RUNNING" | "SUCCEEDED" | "FAILED" | null;
  readonly consecutiveFailures: number;
  /** A worker holds the job right now. */
  readonly running: boolean;
  /** Due more than two intervals ago and not running: no worker is picking it up. */
  readonly stalled: boolean;
}

export interface JobRunSummary {
  readonly id: string;
  readonly jobName: string;
  readonly slot: Date;
  readonly attempt: number;
  readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  /** Sanitised error name/code only (ADR-0023). */
  readonly error: string | null;
}

export interface QueueSignal {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly unit: "count" | "seconds";
  /** At or past the level docs/operations/alerts.md alerts on. */
  readonly attention: boolean;
}

export interface JobsOverview {
  readonly jobs: readonly JobHealth[];
  readonly recentRuns: readonly JobRunSummary[];
  readonly queues: readonly QueueSignal[];
}

/** The queue signals and the level each alerts at (docs/operations/alerts.md). */
export const QUEUE_SIGNALS: readonly {
  readonly key: string;
  readonly label: string;
  readonly unit: "count" | "seconds";
  readonly attentionAt: number;
}[] = [
  { key: "jobs_overdue", label: "Jobs no worker is running", unit: "count", attentionAt: 1 },
  { key: "jobs_failing", label: "Jobs failing repeatedly", unit: "count", attentionAt: 1 },
  {
    key: "outbox_oldest_seconds",
    label: "Oldest storefront update waiting",
    unit: "seconds",
    attentionAt: 120,
  },
  { key: "outbox_backlog", label: "Storefront updates waiting", unit: "count", attentionAt: 5_000 },
  {
    key: "notifications_oldest_pending_seconds",
    label: "Oldest order email waiting",
    unit: "seconds",
    attentionAt: 900,
  },
  { key: "notifications_pending", label: "Order emails waiting", unit: "count", attentionAt: 500 },
  { key: "notifications_failed", label: "Order emails that failed", unit: "count", attentionAt: 1 },
  {
    key: "messages_unannounced_oldest_seconds",
    label: "Oldest customer message not yet announced to staff",
    unit: "seconds",
    attentionAt: 300,
  },
  {
    key: "payment_webhooks_failed",
    label: "Payment webhooks that failed processing",
    unit: "count",
    attentionAt: 1,
  },
  { key: "media_processing", label: "Images processing now", unit: "count", attentionAt: 50 },
  {
    key: "domains_failed",
    label: "Custom domains failed",
    unit: "count",
    attentionAt: Number.POSITIVE_INFINITY,
  },
];

export async function getJobsOverview(
  ctx: PlatformContext,
  now: Date = new Date(),
): Promise<JobsOverview> {
  requirePlatformPermission(ctx, "platform.audit.read");
  const db = platformDb();
  const [jobs, runs, snapshot] = await Promise.all([
    db.scheduledJob.findMany({ orderBy: { name: "asc" } }),
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 25 }),
    db.$queryRaw<{ metric: string; value: unknown }[]>`
      SELECT metric, value FROM app_operations_snapshot()`,
  ]);
  const values = new Map(snapshot.map((r) => [r.metric, Number(r.value)]));
  return {
    queues: QUEUE_SIGNALS.map((signal) => {
      const value = Math.round(values.get(signal.key) ?? 0);
      return {
        key: signal.key,
        label: signal.label,
        unit: signal.unit,
        value,
        attention: value >= signal.attentionAt,
      };
    }),
    jobs: jobs.map((job) => {
      const running = job.lockedUntil !== null && job.lockedUntil > now;
      const overdueMs = now.getTime() - job.nextRunAt.getTime();
      return {
        name: job.name,
        intervalSeconds: job.intervalSeconds,
        nextRunAt: job.nextRunAt,
        lastStartedAt: job.lastStartedAt,
        lastFinishedAt: job.lastFinishedAt,
        lastStatus: job.lastStatus,
        consecutiveFailures: job.consecutiveFailures,
        running,
        stalled: !running && overdueMs > 2 * job.intervalSeconds * 1000,
      };
    }),
    recentRuns: runs.map((run) => ({
      id: run.id,
      jobName: run.jobName,
      slot: run.slot,
      attempt: run.attempt,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      error: run.error,
    })),
  };
}
