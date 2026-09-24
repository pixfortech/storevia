// Data display primitives (docs/architecture/12-design-system.md §6).
import type { ReactNode } from "react";
import { cn } from "./cn";

/** A usage meter: value against a limit, with over-limit styling. */
export function Meter({
  label,
  value,
  max,
  valueLabel,
  tone,
  className,
}: {
  label: string;
  value: number;
  /** null = unlimited */
  max: number | null;
  valueLabel?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  const over = max !== null && value > max;
  const pct =
    max === null || max === 0 ? (value > 0 ? 100 : 0) : Math.min(100, (value / max) * 100);
  const danger = tone === "danger" || over;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className={cn("tabular", danger ? "font-medium text-danger-700" : "text-ink-muted")}>
          {valueLabel ?? `${String(value)} of ${max === null ? "unlimited" : String(max)}`}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-pill bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuenow={value}
        {...(max === null ? {} : { "aria-valuemax": max })}
      >
        <div
          className={cn(
            "h-full rounded-pill transition-[width] duration-(--duration-slow) ease-(--ease-standard)",
            danger ? "bg-danger-600" : max === null ? "bg-brand-300" : "bg-brand-600",
          )}
          style={{ width: `${String(max === null ? Math.min(100, value > 0 ? 12 : 0) : pct)}%` }}
        />
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line-strong bg-surface px-1 font-sans text-[11px] font-medium text-ink-muted shadow-xs">
      {children}
    </kbd>
  );
}

/** A labelled figure, e.g. "Stores · 2 of 3". Never fed invented numbers. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tracking-tight text-ink tabular">
        {value}
      </dd>
      {hint ? <dd className="mt-0.5 text-sm text-ink-muted">{hint}</dd> : null}
    </div>
  );
}

export interface DataColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** Shown as the card title on phones. Exactly one column should set it. */
  readonly primary?: boolean;
  /** Hidden on phones (secondary detail). */
  readonly hideOnMobile?: boolean;
  readonly align?: "start" | "end";
  readonly className?: string;
}

/**
 * Tables on tablet and desktop; stacked cards on phones. Desktop tables are
 * never squeezed into 360 px.
 */
export function DataList<T>({
  rows,
  columns,
  rowKey,
  rowTestId,
  empty,
  caption,
}: {
  rows: readonly T[];
  columns: readonly DataColumn<T>[];
  rowKey: (row: T) => string;
  /** data-testid for each row: a fixed string or one per row. Phone cards get "-mobile". */
  rowTestId?: string | ((row: T) => string);
  empty?: ReactNode;
  caption?: string;
}) {
  if (rows.length === 0) return <>{empty ?? null}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile);
  const testId = (row: T) => (typeof rowTestId === "function" ? rowTestId(row) : rowTestId);
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-line text-xs text-ink-faint">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-5 py-2.5 font-medium uppercase tracking-wide",
                    c.align === "end" && "text-right",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                data-testid={testId(row)}
                className="align-middle hover:bg-stone-25"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-5 py-3", c.align === "end" && "text-right", c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            data-testid={rowTestId ? `${testId(row) ?? ""}-mobile` : undefined}
            className="px-4 py-3.5"
          >
            <div className="text-[15px] font-medium text-ink">{primary?.cell(row)}</div>
            {secondary.length > 0 ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {secondary.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-ink-faint">{c.header}</dt>
                    <dd className="min-w-0 text-ink">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
