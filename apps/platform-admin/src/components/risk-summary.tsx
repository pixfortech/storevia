import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { Badge } from "@storevia/ui/surfaces";
import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { RiskItem, RiskTone } from "@/lib/risk";

const TONES: Record<RiskTone, { icon: LucideIcon; className: string; label: string }> = {
  danger: { icon: OctagonAlert, className: "text-danger-600", label: "Critical" },
  warning: { icon: TriangleAlert, className: "text-warning-600", label: "Warning" },
  info: { icon: Info, className: "text-brand-600", label: "Note" },
};

/**
 * What needs attention on an organisation, most severe first. Each line has
 * an icon and a spoken severity, so colour is never the only signal.
 */
export function RiskSummary({ items }: { items: readonly RiskItem[] }) {
  if (items.length === 0) {
    return (
      <section
        aria-label="Risk summary"
        data-testid="risk-summary"
        className="flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3.5 sm:items-center sm:px-5"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 ring-1 ring-success-100 ring-inset">
          <Icon icon={CircleCheck} size="sm" />
        </span>
        <p className="text-body-sm text-ink-muted">
          <span className="font-medium text-ink">Nothing needs attention:</span> subscription,
          limits and overrides are in order.
        </p>
      </section>
    );
  }
  const critical = items.filter((item) => item.tone === "danger").length;
  return (
    <section
      aria-labelledby="risk-summary-title"
      data-testid="risk-summary"
      className={cn(
        "rounded-card border bg-surface",
        critical > 0 ? "border-danger-100" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="risk-summary-title" className="font-display text-body font-semibold text-ink">
          Needs attention
        </h2>
        {critical > 0 ? (
          <Badge tone="danger" size="sm">
            {critical} critical
          </Badge>
        ) : null}
        <span className="text-caption text-ink-faint">Most severe first</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const tone = TONES[item.tone];
          return (
            <li key={item.text} className="flex items-start gap-3 px-4 py-2.5 text-body-sm sm:px-5">
              <Icon icon={tone.icon} size="sm" className={cn("mt-0.5", tone.className)} />
              <span className="min-w-0 text-ink">
                <span className="sr-only">{tone.label}: </span>
                {item.text}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
