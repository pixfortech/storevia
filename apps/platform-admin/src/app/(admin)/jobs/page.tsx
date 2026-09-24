import { getJobsOverview, type JobHealth } from "@storevia/billing";
import { hasPlatformPermission } from "@storevia/tenancy/platform";
import { Alert, Badge, Card, CardHeader, DataList } from "@storevia/ui";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, humanise } from "@/lib/format";

export const metadata: Metadata = { title: "Jobs" };

// Read-only health of the scheduled jobs run by apps/worker (ADR-0023).

function every(seconds: number): string {
  if (seconds % 86_400 === 0)
    return seconds === 86_400 ? "Daily" : `Every ${String(seconds / 86_400)} days`;
  if (seconds % 3600 === 0) return `Every ${String(seconds / 3600)} h`;
  if (seconds % 60 === 0) return `Every ${String(seconds / 60)} min`;
  return `Every ${String(seconds)} s`;
}

function health(job: JobHealth): {
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
} {
  if (job.stalled) return { tone: "danger", label: "Stalled" };
  if (job.running) return { tone: "info", label: "Running" };
  if (job.consecutiveFailures > 0)
    return { tone: "warning", label: `Failing (${String(job.consecutiveFailures)})` };
  if (job.lastStatus === "SUCCEEDED") return { tone: "success", label: "Healthy" };
  return { tone: "neutral", label: "Not run yet" };
}

export default async function JobsPage() {
  const ctx = await requireStaff("/jobs");
  if (!hasPlatformPermission(ctx, "platform.audit.read")) {
    return (
      <Alert tone="warning" title="You can't view background jobs">
        Your platform role doesn&apos;t include operational visibility.
      </Alert>
    );
  }
  const overview = await getJobsOverview(ctx);
  const attention = overview.jobs.filter((j) => j.stalled || j.consecutiveFailures > 0);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Background jobs</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Scheduled work run by the worker. Read-only: jobs retry on their own and are changed in
          code, not here.
        </p>
      </div>
      {overview.jobs.length === 0 ? (
        <Alert tone="info" title="No jobs registered yet">
          Jobs appear after the worker starts for the first time (
          <code>pnpm --filter @storevia/worker dev</code>).
        </Alert>
      ) : attention.length > 0 ? (
        <Alert tone="danger" title="Jobs need attention">
          {attention.map((j) => j.name).join(", ")}: check the worker logs for these jobs.
        </Alert>
      ) : null}
      <Card data-testid="jobs-card">
        <CardHeader title="Schedule" />
        <DataList
          caption="Scheduled jobs"
          rows={overview.jobs}
          rowKey={(job) => job.name}
          rowTestId="job-row"
          columns={[
            {
              key: "name",
              header: "Job",
              primary: true,
              cell: (job) => <span className="font-mono text-[13px]">{job.name}</span>,
            },
            {
              key: "health",
              header: "Health",
              cell: (job) => {
                const h = health(job);
                return <Badge tone={h.tone}>{h.label}</Badge>;
              },
            },
            { key: "interval", header: "Runs", cell: (job) => every(job.intervalSeconds) },
            {
              key: "last",
              header: "Last finished",
              cell: (job) => formatDateTime(job.lastFinishedAt),
            },
            { key: "next", header: "Next run", cell: (job) => formatDateTime(job.nextRunAt) },
          ]}
        />
      </Card>
      <Card data-testid="runs-card">
        <CardHeader title="Recent runs" description="The latest 25 attempts across all jobs." />
        <DataList
          caption="Recent job runs"
          rows={overview.recentRuns}
          rowKey={(run) => run.id}
          rowTestId="run-row"
          empty={<p className="px-5 py-4 text-sm text-ink-muted">No runs recorded yet.</p>}
          columns={[
            {
              key: "job",
              header: "Job",
              primary: true,
              cell: (run) => <span className="font-mono text-[13px]">{run.jobName}</span>,
            },
            {
              key: "status",
              header: "Result",
              cell: (run) => (
                <Badge
                  tone={
                    run.status === "SUCCEEDED"
                      ? "success"
                      : run.status === "FAILED"
                        ? "danger"
                        : "info"
                  }
                >
                  {humanise(run.status)}
                </Badge>
              ),
            },
            { key: "attempt", header: "Attempt", cell: (run) => run.attempt },
            { key: "started", header: "Started", cell: (run) => formatDateTime(run.startedAt) },
            {
              key: "error",
              header: "Error",
              cell: (run) =>
                run.error ? <code className="font-mono text-xs">{run.error}</code> : "—",
            },
          ]}
        />
      </Card>
    </div>
  );
}
