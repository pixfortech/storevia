import "server-only";
import { platformDb } from "@storevia/database/platform";
import { requirePlatformPermission, type PlatformContext } from "@storevia/tenancy/platform";

// Background job health for platform-admin (ADR-0023). Read-only: staff can
// see whether scheduled work is running, never trigger or change it here.

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

export interface JobsOverview {
  readonly jobs: readonly JobHealth[];
  readonly recentRuns: readonly JobRunSummary[];
}

export async function getJobsOverview(
  ctx: PlatformContext,
  now: Date = new Date(),
): Promise<JobsOverview> {
  requirePlatformPermission(ctx, "platform.audit.read");
  const db = platformDb();
  const [jobs, runs] = await Promise.all([
    db.scheduledJob.findMany({ orderBy: { name: "asc" } }),
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 25 }),
  ]);
  return {
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
