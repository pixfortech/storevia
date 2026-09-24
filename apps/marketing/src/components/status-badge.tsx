import { cn } from "@storevia/ui";
import { STATUS_LABELS, type Status } from "@/content/capabilities";

const TONES: Record<Status, string> = {
  available: "bg-success-50 text-success-700 ring-success-700/15",
  "in-development": "bg-info-50 text-info-700 ring-info-700/15",
  roadmap: "bg-subtle text-ink-muted ring-line-strong/60",
  future: "bg-surface text-ink-faint ring-line-strong/60",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[status],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          status === "available"
            ? "bg-success-500"
            : status === "in-development"
              ? "bg-info-500"
              : "bg-stone-400",
        )}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
