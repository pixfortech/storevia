import "server-only";
import { workerDb } from "@storevia/database/worker";
import type { JobDefinition } from "@storevia/jobs";
import { recordMetric } from "@storevia/observability";

// Queue-health gauges (M8): every minute, the platform-wide aggregates from
// app_operations_snapshot() become ops.* metrics, which the alert rules in
// docs/operations/alerts.md watch (backlogs, oldest items, failures, jobs
// nobody is running). Aggregates only: no tenant ids or content.

export async function operationsSnapshot(): Promise<Record<string, number>> {
  const rows = await workerDb().$queryRaw<{ metric: string; value: unknown }[]>`
    SELECT metric, value FROM app_operations_snapshot()`;
  return Object.fromEntries(rows.map((r) => [r.metric, Number(r.value)]));
}

export const operationsMetricsJob: JobDefinition = {
  name: "ops.metrics",
  schedule: { everySeconds: 60 },
  maxAttempts: 1,
  timeoutMs: 30_000,
  async run() {
    const snapshot = await operationsSnapshot();
    for (const [metric, value] of Object.entries(snapshot)) {
      recordMetric(`ops.${metric}`, Math.round(value), {});
    }
    return { gauges: Object.keys(snapshot).length };
  },
};
