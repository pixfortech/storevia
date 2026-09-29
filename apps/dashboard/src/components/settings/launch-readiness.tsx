import { Icon } from "@storevia/ui/icons";
import { AlertTriangle, ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";

// What the store needs before it goes live (final pass, DB-1), each with
// where to fix it. Going live enforces the same checks on the server.

export interface LaunchReadinessItem {
  readonly key: string;
  readonly label: string;
  readonly ok: boolean;
  readonly blocking: boolean;
  readonly detail: string;
  readonly href: string | null;
}

export function LaunchReadinessList({ checks }: { checks: readonly LaunchReadinessItem[] }) {
  const missing = checks.filter((c) => c.blocking && !c.ok).length;
  return (
    <section aria-labelledby="launch-readiness-title" data-testid="launch-readiness">
      <h3 id="launch-readiness-title" className="text-label text-ink">
        {missing > 0
          ? `Before you go live: ${String(missing)} ${missing === 1 ? "step" : "steps"} left`
          : "Ready to go live"}
      </h3>
      <ul className="mt-3 divide-y divide-line rounded-control border border-line">
        {checks.map((c) => {
          const state = c.ok ? "ok" : c.blocking ? "missing" : "warning";
          return (
            <li
              key={c.key}
              data-check={c.key}
              data-state={state}
              className="flex items-start gap-3 px-4 py-3"
            >
              <span
                className={
                  state === "ok"
                    ? "mt-0.5 text-success-700"
                    : state === "missing"
                      ? "mt-0.5 text-danger-700"
                      : "mt-0.5 text-warning-700"
                }
              >
                <Icon
                  icon={state === "ok" ? Check : state === "missing" ? X : AlertTriangle}
                  size="sm"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-ink">
                  {c.label}
                  <span className="sr-only">
                    {state === "ok" ? " (done)" : state === "missing" ? " (missing)" : " (warning)"}
                  </span>
                </p>
                <p className="text-body-sm text-ink-muted">{c.detail}</p>
              </div>
              {!c.ok && c.href ? (
                <Link
                  href={c.href}
                  className="inline-flex shrink-0 items-center gap-1 text-body-sm font-medium text-brand-700 hover:underline"
                >
                  Fix
                  <span className="sr-only"> {c.label}</span>
                  <Icon icon={ArrowRight} size="sm" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
