import { getJobsOverview } from "@storevia/billing";
import { hasPlatformPermission } from "@storevia/tenancy/platform";
import { Alert, Badge, Card, CardHeader, DataList, PageHeader, Stat } from "@storevia/ui";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, humanise } from "@/lib/format";
import { jobHealth, jobInterval, jobsSummary, needsAttention, runTone } from "@/lib/jobs";

export const metadata: Metadata = { title: "Jobs" };

// Read-only health of the scheduled jobs run by apps/worker (ADR-0023). The
// page has no controls on purpose: jobs retry on their own.

const DESCRIPTION =
  "Scheduled work run by the worker. Read-only: jobs retry on their own and are changed in code, not here.";

export default async function JobsPage() {
  const ctx = await requireStaff("/jobs");
  if (!hasPlatformPermission(ctx, "platform.audit.read")) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Operations" title="Background jobs" description={DESCRIPTION} />
        <Alert tone="warning" title="You can't view background jobs">
          Your platform role doesn&apos;t include operational visibility.
        </Alert>
      </div>
    );
  }
  const overview = await getJobsOverview(ctx);
  const attention = overview.jobs.filter(needsAttention);
  const summary = jobsSummary(overview.jobs, overview.recentRuns);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Background jobs"
        description={DESCRIPTION}
        meta={<Badge variant="outline">Read-only</Badge>}
      />
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

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4 [&>div]:bg-surface [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6">
        <Stat label="Scheduled jobs" value={summary.total} />
        <Stat label="Healthy" value={summary.healthy} />
        <Stat
          label="Need attention"
          value={
            <span className={summary.attention > 0 ? "text-danger-700" : undefined}>
              {summary.attention}
            </span>
          }
        />
        <Stat
          label="Latest run started"
          value={
            // Stat truncates its value; this timestamp wraps instead, so it
            // stays readable in a half-width tile on phones.
            <span className="block text-body font-medium whitespace-normal">
              {formatDateTime(summary.lastRunAt)}
            </span>
          }
        />
      </dl>

      <Card data-testid="jobs-card">
        <CardHeader title="Schedule" description="Each job, how often it runs and its health." />
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
              cell: (job) => <code className="font-mono text-[13px] text-ink">{job.name}</code>,
            },
            {
              key: "health",
              header: "Health",
              cell: (job) => {
                const h = jobHealth(job);
                return (
                  <Badge tone={h.tone} dot>
                    {h.label}
                  </Badge>
                );
              },
            },
            {
              key: "interval",
              header: "Runs",
              className: "whitespace-nowrap",
              cell: (job) => jobInterval(job.intervalSeconds),
            },
            {
              key: "last",
              header: "Last finished",
              className: "whitespace-nowrap tabular-nums text-ink-muted",
              cell: (job) => formatDateTime(job.lastFinishedAt),
            },
            {
              key: "next",
              header: "Next run",
              className: "whitespace-nowrap tabular-nums text-ink-muted",
              cell: (job) => formatDateTime(job.nextRunAt),
            },
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
          empty={<p className="px-6 py-5 text-body-sm text-ink-muted">No runs recorded yet.</p>}
          columns={[
            {
              key: "job",
              header: "Job",
              primary: true,
              cell: (run) => <code className="font-mono text-[13px] text-ink">{run.jobName}</code>,
            },
            {
              key: "status",
              header: "Result",
              cell: (run) => (
                <Badge tone={runTone(run.status)} dot>
                  {humanise(run.status)}
                </Badge>
              ),
            },
            { key: "attempt", header: "Attempt", align: "end", cell: (run) => run.attempt },
            {
              key: "started",
              header: "Started",
              className: "whitespace-nowrap tabular-nums text-ink-muted",
              cell: (run) => formatDateTime(run.startedAt),
            },
            {
              key: "error",
              header: "Error",
              cell: (run) =>
                run.error ? (
                  <code className="font-mono text-caption break-all text-danger-700">
                    {run.error}
                  </code>
                ) : (
                  <span className="text-ink-faint">—</span>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
