// Presentation of background-job health (ADR-0023). Pure.
import type { JobHealth, JobRunSummary } from "@storevia/billing";

export type JobTone = "success" | "warning" | "danger" | "info" | "neutral";

/** A job's interval in words: "Daily", "Every 6 h", "Every 15 min". */
export function jobInterval(seconds: number): string {
  if (seconds % 86_400 === 0)
    return seconds === 86_400 ? "Daily" : `Every ${String(seconds / 86_400)} days`;
  if (seconds % 3600 === 0) return `Every ${String(seconds / 3600)} h`;
  if (seconds % 60 === 0) return `Every ${String(seconds / 60)} min`;
  return `Every ${String(seconds)} s`;
}

export function jobHealth(job: JobHealth): { tone: JobTone; label: string } {
  if (job.stalled) return { tone: "danger", label: "Stalled" };
  if (job.running) return { tone: "info", label: "Running" };
  if (job.consecutiveFailures > 0)
    return { tone: "warning", label: `Failing (${String(job.consecutiveFailures)})` };
  if (job.lastStatus === "SUCCEEDED") return { tone: "success", label: "Healthy" };
  return { tone: "neutral", label: "Not run yet" };
}

export function needsAttention(job: JobHealth): boolean {
  return job.stalled || job.consecutiveFailures > 0;
}

export function runTone(status: JobRunSummary["status"]): JobTone {
  return status === "SUCCEEDED" ? "success" : status === "FAILED" ? "danger" : "info";
}

export interface JobsSummary {
  readonly total: number;
  readonly healthy: number;
  readonly attention: number;
  /** The latest recorded attempt, if any. */
  readonly lastRunAt: Date | null;
}

export function jobsSummary(
  jobs: readonly JobHealth[],
  runs: readonly JobRunSummary[],
): JobsSummary {
  const lastRunAt = runs.reduce<Date | null>(
    (latest, run) => (latest === null || run.startedAt > latest ? run.startedAt : latest),
    null,
  );
  return {
    total: jobs.length,
    healthy: jobs.filter((job) => jobHealth(job).label === "Healthy").length,
    attention: jobs.filter(needsAttention).length,
    lastRunAt,
  };
}
