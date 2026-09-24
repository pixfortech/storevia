// Data display primitives (docs/architecture/12-design-system.md §6): meters,
// metrics, KPI cards, tables, lists and description lists.
//
// Server-safe: no hooks, so server components render real data directly (the
// tables' scroll area is a small client leaf, data-scroll.tsx). Figures are
// never invented here; callers pass real values, or an honest "not
// collecting yet" state, or clearly badged example data.
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  CircleAlert,
  InfinityIcon,
  Minus,
  TriangleAlert,
} from "lucide-react";
import type {
  ElementType,
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { TableScrollArea } from "./data-scroll";
import { Icon } from "./icons";
import { Badge, cardClasses, ExampleDataBadge } from "./surfaces";

const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/* ----------------------------------------------------------------------------
 * Meter and UsageMeter
 * ------------------------------------------------------------------------- */

export type UsageMeterStatus = "ok" | "warning" | "full" | "over" | "unlimited";

export interface UsageMeterState {
  status: UsageMeterStatus;
  /** 0–100, clamped. Null when unlimited. */
  percent: number | null;
}

/**
 * The state of a usage line: `warning` from `warnAt` (80% by default), `full`
 * at the limit, `over` past it. A zero limit counts any use as over.
 */
export function usageMeterState(used: number, limit: number | null, warnAt = 0.8): UsageMeterState {
  if (limit === null) return { status: "unlimited", percent: null };
  if (limit <= 0) return { status: used > 0 ? "over" : "full", percent: 100 };
  const ratio = used / limit;
  const percent = Math.min(100, Math.max(0, ratio * 100));
  if (used > limit) return { status: "over", percent };
  if (used === limit) return { status: "full", percent };
  if (ratio >= warnAt) return { status: "warning", percent };
  return { status: "ok", percent };
}

const FILL: Record<UsageMeterStatus, string> = {
  ok: "bg-brand-600",
  warning: "bg-warning-500",
  full: "bg-warning-500",
  over: "bg-danger-600",
  unlimited: "bg-transparent",
};

function MeterTrack({
  percent,
  status,
  size = "md",
}: {
  percent: number | null;
  status: UsageMeterStatus;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-pill bg-muted",
        size === "sm" ? "h-1" : "h-1.5",
        // Forced colours drop fills: outline the track instead.
        "forced-colors:border forced-colors:border-[CanvasText]",
        // No limit: an empty dashed track, so a list of meters stays aligned.
        status === "unlimited" && "border border-dashed border-line-strong bg-transparent",
      )}
    >
      <div
        className={cn(
          "h-full rounded-pill transition-[width] duration-(--duration-slow) ease-(--ease-standard)",
          FILL[status],
          // …and draw the fill in the system highlight colour.
          "forced-color-adjust-none forced-colors:bg-[Highlight]",
        )}
        style={{ width: `${String(percent ?? 0)}%` }}
      />
    </div>
  );
}

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
  const state = usageMeterState(value, max);
  const danger = tone === "danger" || state.status === "over";
  // No amber here: this meter has no words for "nearly full" (UsageMeter does).
  const status: UsageMeterStatus = max === null ? "unlimited" : danger ? "over" : "ok";
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-body-sm">
        <span className="font-medium text-ink">{label}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 tabular-nums",
            danger ? "font-medium text-danger-700" : "text-ink-muted",
          )}
        >
          {danger && valueLabel === undefined ? (
            <Icon icon={CircleAlert} size="xs" className="self-center" />
          ) : null}
          {valueLabel ?? `${String(value)} of ${max === null ? "unlimited" : String(max)}`}
          {danger && valueLabel === undefined ? (
            <span className="sr-only">, over limit</span>
          ) : null}
        </span>
      </div>
      <div
        className="mt-2"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuenow={value}
        {...(max === null ? {} : { "aria-valuemax": max })}
      >
        <MeterTrack percent={max === null ? null : (state.percent ?? 0)} status={status} />
      </div>
    </div>
  );
}

export interface UsageMeterProps {
  label: ReactNode;
  used: number;
  /** null or "unlimited" for no limit. */
  limit: number | null | "unlimited";
  /** Appended to figures, e.g. "GB" or "seats". */
  unit?: string;
  /** Formats figures (server components only pass the default). */
  format?: (value: number) => string;
  /** Fraction at which the meter turns amber. Default 0.8. */
  warnAt?: number;
  /** A quiet line under the meter (e.g. "Resets on 1 October"). */
  hint?: ReactNode;
  size?: "sm" | "md";
  className?: string;
  "data-testid"?: string;
}

/**
 * Plan usage against a limit. States are spelled out in words and an icon
 * (never colour alone): nearly at the limit, at the limit, over the limit,
 * unlimited.
 */
export function UsageMeter({
  label,
  used,
  limit,
  unit,
  format = (value) => NUMBER.format(value),
  warnAt = 0.8,
  hint,
  size = "md",
  className,
  ...props
}: UsageMeterProps) {
  const max = limit === "unlimited" ? null : limit;
  const { status, percent } = usageMeterState(used, max, warnAt);
  const withUnit = (text: string) => (unit ? `${text} ${unit}` : text);
  const figure =
    max === null ? withUnit(`${format(used)} used`) : withUnit(`${format(used)} of ${format(max)}`);
  const message =
    status === "over"
      ? `Over limit by ${withUnit(format(used - (max ?? 0)))}`
      : status === "full"
        ? "At limit"
        : status === "warning"
          ? `${String(Math.round(percent ?? 0))}% used`
          : status === "unlimited"
            ? "Unlimited"
            : null;
  const valueText = message ? `${figure}. ${message}` : figure;
  return (
    <div className={cn("min-w-0", className)} data-status={status} {...props}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={cn("font-medium text-ink", size === "sm" ? "text-label" : "text-body-sm")}>
          {label}
        </span>
        <span
          className={cn(
            "tabular-nums",
            size === "sm" ? "text-caption" : "text-body-sm",
            status === "over" ? "font-medium text-danger-700" : "text-ink-muted",
          )}
        >
          {figure}
        </span>
      </div>
      <div
        className={size === "sm" ? "mt-1.5" : "mt-2"}
        {...(max === null
          ? {}
          : {
              role: "meter",
              "aria-valuemin": 0,
              "aria-valuemax": max,
              "aria-valuenow": used,
              "aria-valuetext": valueText,
              ...(typeof label === "string" ? { "aria-label": label } : {}),
            })}
      >
        <MeterTrack percent={percent} status={status} size={size} />
      </div>
      {message || hint ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-caption">
          {message ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 font-medium",
                status === "over" && "text-danger-700",
                (status === "warning" || status === "full") && "text-warning-700",
                status === "unlimited" && "text-ink-muted",
              )}
            >
              <Icon
                icon={
                  status === "over"
                    ? CircleAlert
                    : status === "unlimited"
                      ? InfinityIcon
                      : TriangleAlert
                }
                size="xs"
              />
              {message}
            </span>
          ) : (
            <span />
          )}
          {hint ? <span className="text-ink-faint">{hint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Kbd and Stat
 * ------------------------------------------------------------------------- */

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line-strong bg-surface px-1 font-sans text-[11px] leading-none font-medium text-ink-muted shadow-[inset_0_-1px_0_var(--color-line)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** A labelled figure, e.g. "Stores · 2 of 3". Never fed invented numbers. Use inside a <dl>. */
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
      <dt className="text-label text-ink-muted">{label}</dt>
      <dd className="mt-1.5 truncate font-sans text-h4 font-semibold tracking-[-0.01em] text-ink tabular-nums">
        {value}
      </dd>
      {hint ? <dd className="mt-0.5 text-body-sm text-ink-muted">{hint}</dd> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Metric and KpiCard
 * ------------------------------------------------------------------------- */

export type MetricDeltaTone = "positive" | "negative" | "neutral";

/** Whether a change is good news. With `lowerIsBetter` (e.g. refunds) a fall is positive. */
export function metricDeltaTone(value: number, lowerIsBetter = false): MetricDeltaTone {
  if (value === 0 || !Number.isFinite(value)) return "neutral";
  return value > 0 !== lowerIsBetter ? "positive" : "negative";
}

export interface MetricDelta {
  /** Signed change; its sign sets the arrow. */
  value: number;
  /** Visible text. Default: the signed value as a percentage ("+12.4%"). */
  label?: string;
}

/** Visible and spoken text for a delta ("+12.4%", "Up 12.4%"). */
export function metricDeltaText(delta: MetricDelta): { visible: string; spoken: string } {
  const abs = Math.abs(delta.value);
  const magnitude = delta.label?.replace(/^[+\-−]/, "") ?? `${NUMBER.format(abs)}%`;
  if (delta.value === 0) return { visible: delta.label ?? "0%", spoken: "No change" };
  const up = delta.value > 0;
  return {
    visible: delta.label ?? `${up ? "+" : "−"}${magnitude}`,
    spoken: `${up ? "Up" : "Down"} ${magnitude}`,
  };
}

const DELTA_TONES: Record<MetricDeltaTone, string> = {
  positive: "bg-success-50 text-success-700",
  negative: "bg-danger-50 text-danger-700",
  neutral: "bg-neutral-100 text-ink-muted",
};

export interface MetricProps {
  label: ReactNode;
  /** The figure, already formatted (e.g. "£12,480"). */
  value: ReactNode;
  delta?: MetricDelta;
  /** A fall is good news (e.g. refund rate, page load time). */
  lowerIsBetter?: boolean;
  /** What the delta compares against, e.g. "vs previous 30 days". */
  comparison?: ReactNode;
  /**
   * A trend line (e.g. a decorative <Sparkline>). With a delta it is hidden
   * from assistive technology: the delta already says what changed, and a
   * listener should hear one change, not two.
   */
  sparkline?: ReactNode;
  /**
   * inline (default): beside the figure, in a fixed-height row so figures
   * line up with or without one · below: full width under the change, in a
   * 32 px slot (KpiCard; fits a two-column grid on phones).
   */
  sparklinePlacement?: "inline" | "below";
  /** md: 28 px figure (KPI rows) · lg: 44 px (the one hero figure per view). */
  size?: "md" | "lg";
  /** Extra detail under the value. */
  footer?: ReactNode;
  /** Marks the figures as example data with the standard <ExampleDataBadge>. */
  example?: boolean;
  /** A badge at the end of the label row (e.g. a status). */
  badge?: ReactNode;
  className?: string;
}

/** A labelled figure with its change and comparison. */
export function Metric({
  label,
  value,
  delta,
  lowerIsBetter = false,
  comparison,
  sparkline,
  sparklinePlacement = "inline",
  size = "md",
  footer,
  example = false,
  badge,
  className,
}: MetricProps) {
  const tone = delta ? metricDeltaTone(delta.value, lowerIsBetter) : "neutral";
  const text = delta ? metricDeltaText(delta) : null;
  const direction = delta
    ? delta.value > 0
      ? ArrowUpRight
      : delta.value < 0
        ? ArrowDownRight
        : Minus
    : null;
  const judgement =
    tone === "positive" ? ", an improvement" : tone === "negative" ? ", a decline" : "";
  const inline = sparklinePlacement === "inline";
  const trend = sparkline ? (
    <div
      {...(delta ? { "aria-hidden": true } : {})}
      className={inline ? "mb-1 w-24 shrink-0 sm:w-28" : "mt-4 h-8"}
    >
      {sparkline}
    </div>
  ) : null;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-h-5 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 text-label text-ink-muted">{label}</div>
        {example || badge ? (
          <div className="-my-0.5 flex shrink-0 flex-wrap items-center gap-1.5">
            {example ? <ExampleDataBadge /> : null}
            {badge}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-2 flex items-end justify-between gap-4",
          // The height of an inline sparkline, reserved whether or not there
          // is one, so a row of figures shares one baseline.
          inline && (size === "lg" ? "min-h-12" : "min-h-9"),
        )}
      >
        <div
          className={cn(
            "min-w-0 truncate text-ink",
            size === "lg" ? "text-metric-lg" : "text-metric",
          )}
        >
          {value}
        </div>
        {inline ? trend : null}
      </div>
      {delta && text && direction ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "inline-flex h-5 items-center gap-0.5 rounded-pill pr-1.5 pl-1 text-caption font-medium tabular-nums",
              DELTA_TONES[tone],
            )}
          >
            <Icon icon={direction} size="xs" />
            <span aria-hidden="true">{text.visible}</span>
            <span className="sr-only">
              {text.spoken}
              {comparison && typeof comparison === "string" ? ` ${comparison}` : ""}
              {judgement}
            </span>
          </span>
          {comparison ? (
            <span
              className="text-caption text-ink-faint"
              {...(typeof comparison === "string" ? { "aria-hidden": true } : {})}
            >
              {comparison}
            </span>
          ) : null}
        </div>
      ) : comparison ? (
        <div className="mt-2.5 text-caption text-ink-faint">{comparison}</div>
      ) : null}
      {inline ? null : trend}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

export interface KpiCardProps extends MetricProps {
  /**
   * live (default) shows the figure. not-collecting shows an honest empty
   * frame: Storevia doesn't record this yet, so there is no number to show.
   */
  status?: "live" | "not-collecting";
  /** Copy for the not-collecting frame. */
  notCollectingText?: ReactNode;
  /** Makes the whole card a link (e.g. to the report). */
  href?: string;
  /** Link component for `href` (e.g. next/link, for client-side routing). Default <a>. */
  linkAs?: ElementType;
  "data-testid"?: string;
}

/**
 * A Metric in a card: the KPI row tile. Stacked (label, figure, change, then
 * the sparkline full width), so tiles line up in a row of four on desktop
 * and fit a 2×2 grid on phones. `example` adds the standard "Example data"
 * badge (development previews only).
 */
export function KpiCard({
  status = "live",
  notCollectingText = "Storevia doesn't record this yet, so there is no figure to show. It fills in once recording starts.",
  href,
  linkAs: Link = "a",
  sparklinePlacement = "below",
  className,
  "data-testid": testId,
  ...metric
}: KpiCardProps) {
  const body =
    status === "not-collecting" ? (
      <div className="min-w-0">
        <div className="flex min-h-5 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0 text-label text-ink-muted">{metric.label}</div>
          <Badge variant="dot" size="sm" className="-my-0.5">
            Not collecting yet
          </Badge>
        </div>
        <div aria-hidden="true" className="mt-2 text-metric text-neutral-300">
          —
        </div>
        <p className="mt-2.5 text-caption text-ink-faint">{notCollectingText}</p>
      </div>
    ) : (
      <Metric {...metric} sparklinePlacement={sparklinePlacement} />
    );
  const classes = cardClasses(
    status === "not-collecting" ? "dashed" : href ? "interactive" : "default",
    cn("p-4 sm:p-5", className),
  );
  if (href) {
    return (
      <Link href={href} className={classes} data-testid={testId} data-status={status}>
        {body}
      </Link>
    );
  }
  return (
    <div className={classes} data-testid={testId} data-status={status}>
      {body}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * DataList: tables on tablet and desktop, cards on phones
 * ------------------------------------------------------------------------- */

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
      <TableScrollArea className="hidden md:block">
        <table className="w-full text-left text-table">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "h-10 px-5 text-caption font-medium whitespace-nowrap text-ink-faint first:pl-6 last:pr-6",
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
                className="align-middle transition-colors duration-(--duration-fast) hover:bg-subtle"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-5 py-3.5 text-ink first:pl-6 last:pr-6",
                      c.align === "end" && "text-right tabular-nums",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollArea>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            data-testid={rowTestId ? `${testId(row) ?? ""}-mobile` : undefined}
            className="px-5 py-4"
          >
            <div className="text-body-sm font-medium text-ink">{primary?.cell(row)}</div>
            {secondary.length > 0 ? (
              <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-sm">
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

/* ----------------------------------------------------------------------------
 * Table primitives
 * ------------------------------------------------------------------------- */

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** 40 px rows instead of 52 px. */
  dense?: boolean;
  /** Keeps the header visible while the table's scroll area scrolls (set `maxHeight`). */
  stickyHeader?: boolean;
  /** Height of the scroll area, e.g. "24rem". */
  maxHeight?: string;
  /** Class names for the scroll container. */
  containerClassName?: string;
  /** Names the scroll region when the table has no TableCaption (default: aria-label). */
  scrollLabel?: string;
}

/**
 * A data table in its own scroll area, so wide tables never widen the page.
 * While it overflows, the area is a focusable region named by the caption
 * (keyboard users can scroll it) and shows a soft shadow on each edge with
 * more beyond. Density and the sticky header reach the cells through data
 * attributes (no context), keeping the primitives server-safe.
 */
export function Table({
  dense = false,
  stickyHeader = false,
  maxHeight,
  className,
  containerClassName,
  scrollLabel,
  ...props
}: TableProps) {
  return (
    <TableScrollArea
      scrollClassName={containerClassName}
      style={maxHeight ? { maxHeight } : undefined}
      label={scrollLabel ?? props["aria-label"]}
      stickyHeader={stickyHeader}
    >
      <table
        data-dense={dense ? "" : undefined}
        data-sticky={stickyHeader ? "" : undefined}
        className={cn(
          "group/table w-full border-collapse text-left text-table text-ink",
          className,
        )}
        {...props}
      />
    </TableScrollArea>
  );
}

export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr:last-child]:border-b-0", className)} {...props} />;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** A highlighted row (e.g. the current store). */
  selected?: boolean;
}

export function TableRow({ selected = false, className, ...props }: TableRowProps) {
  return (
    <tr
      data-selected={selected ? "" : undefined}
      aria-selected={selected || undefined}
      className={cn(
        "border-b border-line transition-colors duration-(--duration-fast)",
        "[tbody>&]:hover:bg-subtle data-selected:bg-brand-25",
        className,
      )}
      {...props}
    />
  );
}

export type TableSort = "ascending" | "descending" | "none";

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Makes the header a sort control; "none" = sortable but not the sorted column. */
  sort?: TableSort;
  /** Client components: called when the header is activated. */
  onSort?: () => void;
  /** Server components: a link that applies the sort (e.g. "?sort=name"). */
  sortHref?: string;
  /** Link component for `sortHref` (e.g. next/link, for client-side routing). Default <a>. */
  linkAs?: ElementType;
}

const HEAD_BASE = cn(
  "h-10 px-4 align-middle text-caption font-medium whitespace-nowrap text-ink-faint first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
  "shadow-[inset_0_-1px_0_var(--color-line)]",
  "group-data-dense/table:h-9",
  "group-data-sticky/table:sticky group-data-sticky/table:top-0 group-data-sticky/table:z-(--z-raised) group-data-sticky/table:bg-surface",
  // Once rows pass under a sticky header, it lifts off them (the scroll area sets data-sv-scrolled).
  "group-data-sticky/table:in-data-sv-scrolled:shadow-[inset_0_-1px_0_var(--color-line),0_8px_10px_-8px_rgb(11_21_48/0.14)]",
);

export function TableHead({
  numeric = false,
  sort,
  onSort,
  sortHref,
  linkAs: Link = "a",
  scope = "col",
  className,
  children,
  ...props
}: TableHeadProps) {
  const sortable = sort !== undefined;
  const SortIcon =
    sort === "ascending" ? ChevronUp : sort === "descending" ? ChevronDown : ChevronsUpDown;
  const control = cn(
    "-mx-1.5 inline-flex h-7 items-center gap-1 rounded-sm px-1.5 transition-colors duration-(--duration-fast)",
    "hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus",
    sort && sort !== "none" && "text-ink",
    numeric && "flex-row-reverse",
  );
  const inner = sortable ? (
    <>
      <span>{children}</span>
      <Icon
        icon={SortIcon}
        size="xs"
        className={cn(sort === "none" ? "text-neutral-300" : "text-ink-muted")}
      />
    </>
  ) : (
    children
  );
  return (
    <th
      scope={scope}
      {...(sort === "ascending" || sort === "descending" ? { "aria-sort": sort } : {})}
      className={cn(HEAD_BASE, numeric ? "text-right" : "text-left", className)}
      {...props}
    >
      {sortable && sortHref ? (
        <Link href={sortHref} className={control}>
          {inner}
        </Link>
      ) : sortable && onSort ? (
        <button type="button" onClick={onSort} className={control}>
          {inner}
        </button>
      ) : (
        inner
      )}
    </th>
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
}

export function TableCell({ numeric = false, className, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        "h-13 px-4 align-middle first:pl-5 last:pr-5 group-data-dense/table:h-10 sm:first:pl-6 sm:last:pr-6",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export interface TableCaptionProps extends HTMLAttributes<HTMLTableCaptionElement> {
  /** Visible under the table instead of screen-reader only. */
  visible?: boolean;
}

export function TableCaption({
  visible = false,
  className,
  children,
  ...props
}: TableCaptionProps) {
  return (
    <caption
      className={cn(
        visible ? "caption-bottom px-5 pt-3 text-left text-caption text-ink-faint" : "sr-only",
        className,
      )}
      {...props}
    >
      {/* The caption is as wide as the table; its text stays in view while the table scrolls sideways. */}
      {visible ? <span className="sticky left-5 inline-block">{children}</span> : children}
    </caption>
  );
}

export interface TableEmptyProps {
  /** Number of columns to span. */
  colSpan: number;
  children: ReactNode;
  className?: string;
}

/** A single full-width row for "nothing here yet" (an EmptyState or a sentence). */
export function TableEmpty({ colSpan, children, className }: TableEmptyProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn("px-5 py-2 text-center text-body-sm text-ink-muted", className)}
      >
        {children}
      </td>
    </tr>
  );
}

/* ----------------------------------------------------------------------------
 * DescriptionList
 * ------------------------------------------------------------------------- */

export interface DescriptionItem {
  term: ReactNode;
  detail: ReactNode;
  /** React key; defaults to the term when it is a string. */
  key?: string;
}

export interface DescriptionListProps {
  items: readonly DescriptionItem[];
  /** horizontal: term beside detail, hairlines between rows (stacks on phones) · stacked: term above detail. */
  layout?: "horizontal" | "stacked";
  /** Columns for the stacked layout from the sm breakpoint. */
  columns?: 1 | 2 | 3;
  className?: string;
}

const STACK_COLUMNS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" } as const;

/** Term/detail pairs: settings summaries, record details. */
export function DescriptionList({
  items,
  layout = "horizontal",
  columns = 1,
  className,
}: DescriptionListProps) {
  if (layout === "stacked") {
    return (
      <dl className={cn("grid gap-x-8 gap-y-6", STACK_COLUMNS[columns], className)}>
        {items.map((item, i) => (
          <div
            key={item.key ?? (typeof item.term === "string" ? item.term : String(i))}
            className="min-w-0"
          >
            <dt className="text-label text-ink-muted">{item.term}</dt>
            <dd className="mt-1.5 text-body-sm break-words text-ink">{item.detail}</dd>
          </div>
        ))}
      </dl>
    );
  }
  // Container query, not a viewport breakpoint: the same list sits in a
  // page, a card or a 384 px drawer.
  return (
    <div className={cn("@container", className)}>
      <dl className="divide-y divide-line">
        {items.map((item, i) => (
          <div
            key={item.key ?? (typeof item.term === "string" ? item.term : String(i))}
            className="grid gap-1 py-3.5 first:pt-0 last:pb-0 @xs:grid-cols-[minmax(7.5rem,1fr)_minmax(0,2fr)] @xs:gap-6"
          >
            <dt className="text-body-sm text-ink-muted">{item.term}</dt>
            <dd className="min-w-0 text-body-sm break-words text-ink">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
