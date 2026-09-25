// The status legend: what "Available now", "Up next", "On the roadmap"
// and "Future" promise, each in its StatusPill look (components/marketing).
// Pages that label capabilities show it once, near the top.
import { cn } from "@storevia/ui";
import { STATUS_DESCRIPTIONS, STATUSES, type Status } from "@/content/capabilities";
import { StatusPill } from "./marketing/status-pill";

export interface StatusLegendProps {
  /** Adds how many items have each status, e.g. { counts, noun: ["feature", "features"] }. */
  counts?: Readonly<Record<Status, number>>;
  noun?: readonly [singular: string, plural: string];
  statuses?: readonly Status[];
  className?: string;
}

export function StatusLegend({
  counts,
  noun = ["item", "items"],
  statuses = STATUSES,
  className,
}: StatusLegendProps) {
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {statuses.map((status) => (
        <div key={status} className="flex flex-col gap-2.5 bg-surface p-4 sm:p-5">
          <dt className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <StatusPill status={status} />
            {counts ? (
              <span className="text-caption text-ink-faint tabular-nums">
                {counts[status]} {counts[status] === 1 ? noun[0] : noun[1]}
              </span>
            ) : null}
          </dt>
          <dd className="text-body-sm text-ink-muted">{STATUS_DESCRIPTIONS[status]}</dd>
        </div>
      ))}
    </dl>
  );
}
