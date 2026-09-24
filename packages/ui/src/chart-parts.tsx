// Presentational chart parts (charts.tsx): colour keys, legend, tooltip and
// narrow readout, table twin, empty and loading frames, sparkline and
// headline figure. No hooks, so they render in server components too.
import { ArrowDownRight, ArrowUpRight, ChartLine, Minus } from "lucide-react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import {
  CHART_DEFAULT_LOCALE,
  CHART_DETAIL_DATE,
  chartAreaPath,
  chartLinearScale,
  chartLinePath,
  chartNumberFormatter,
  chartPointX,
  chartTableModel,
  chartTrend,
  chartXFormatter,
  type ChartDatum,
  type ChartSeries,
  type ChartTableModel,
  type ChartTone,
  type ChartValueFormat,
  type ChartXFormat,
} from "./chart-core";
import { cn } from "./cn";
import {
  metricDeltaText,
  metricDeltaTone,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type MetricDelta,
  type MetricDeltaTone,
} from "./data";
import { Icon } from "./icons";

/* ---------------------------------------------------------------------------
 * Tone classes (static strings so Tailwind can see them)
 * ------------------------------------------------------------------------- */

/** Fills: bars, segments, swatches and area washes. */
export const CHART_TONE_FILL: Record<ChartTone, string> = {
  primary: "fill-chart-1",
  comparison: "fill-chart-2",
  tertiary: "fill-chart-3",
  muted: "fill-chart-muted",
};
/** HTML fills (horizontal bars). */
export const CHART_TONE_BG: Record<ChartTone, string> = {
  primary: "bg-chart-1",
  comparison: "bg-chart-2",
  tertiary: "bg-chart-3",
  muted: "bg-chart-muted",
};
/**
 * Line strokes. History is dashed chart-history (2.6:1 on white): chart-muted
 * (1.6:1) holds up as a filled bar but all but vanishes as a 2 px dash.
 */
export const CHART_TONE_STROKE: Record<ChartTone, string> = {
  primary: "stroke-chart-1",
  comparison: "stroke-chart-2",
  tertiary: "stroke-chart-3",
  muted: "stroke-chart-history",
};
/** Points on a line (crosshair dots, a lone point) match its stroke. */
export const CHART_TONE_POINT: Record<ChartTone, string> = {
  primary: "fill-chart-1",
  comparison: "fill-chart-2",
  tertiary: "fill-chart-3",
  muted: "fill-chart-history",
};
const TONE_DOT: Record<ChartTone, string> = {
  primary: "bg-chart-1",
  comparison: "bg-chart-2",
  tertiary: "bg-chart-3",
  muted: "bg-chart-history",
};

/** The dash that marks history (previous period) lines, always. */
export const CHART_HISTORY_DASH = "4 4";

// Forced-colours mode may flatten every hue to one system colour, so each
// line slot also gets its own dash there (charts.css).
const FORCED_DASH: Record<ChartTone, string> = {
  primary: "",
  comparison: "sv-chart-dash-comparison",
  tertiary: "sv-chart-dash-tertiary",
  muted: "",
};

/** A line's stroke classes: its slot colour and its forced-colours dash. */
export function chartLineClasses(tone: ChartTone): string {
  return cn(CHART_TONE_STROKE[tone], FORCED_DASH[tone]);
}

/** How a key mirrors its mark: a stroke for lines, dashes for history, a swatch for fills. */
export type ChartKeyShape = "line" | "dashed" | "rect";

/**
 * The colour key beside a label: identity comes from the mark, never from
 * coloured text. Drawn in SVG like the marks themselves, so forced-colours
 * mode (which drops background colours) keeps key and mark matched.
 */
export function ChartKey({
  tone,
  shape = "line",
  className,
}: {
  tone: ChartTone;
  shape?: ChartKeyShape | undefined;
  className?: string | undefined;
}) {
  if (shape === "rect") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 8 8"
        className={cn("size-2 shrink-0 forced-color-adjust-none", className)}
      >
        <rect width="8" height="8" rx="2" className={CHART_TONE_FILL[tone]} />
      </svg>
    );
  }
  const dashed = shape === "dashed";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 2"
      className={cn("h-0.5 w-3.5 shrink-0 overflow-visible forced-color-adjust-none", className)}
    >
      <line
        x1={dashed ? 0 : 1}
        y1="1"
        x2={dashed ? 14 : 13}
        y2="1"
        strokeWidth="2"
        strokeLinecap={dashed ? "butt" : "round"}
        strokeDasharray={dashed ? "4 2" : undefined}
        className={dashed ? CHART_TONE_STROKE[tone] : chartLineClasses(tone)}
      />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Legend
 * ------------------------------------------------------------------------- */

export interface ChartLegendItem {
  id: string;
  label: ReactNode;
  tone: ChartTone;
  shape?: ChartKeyShape | undefined;
  /** Optional value beside the label (e.g. a segment total). */
  value?: ReactNode;
}

export interface ChartLegendProps {
  items: readonly ChartLegendItem[];
  /** "inline" (default) wraps in a row; "list" stacks rows with values right-aligned. */
  layout?: "inline" | "list";
  className?: string | undefined;
}

/** Series identity for charts with two or more series. Text stays in ink colours. */
export function ChartLegend({ items, layout = "inline", className }: ChartLegendProps) {
  if (layout === "list") {
    return (
      <ul className={cn("divide-y divide-line text-body-sm", className)}>
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2.5 py-2">
            <ChartKey tone={item.tone} shape={item.shape ?? "rect"} />
            <span className="min-w-0 flex-1 truncate text-ink-muted">{item.label}</span>
            {item.value !== undefined ? (
              <span className="shrink-0 font-medium text-ink tabular-nums">{item.value}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-caption", className)}>
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 text-ink-muted">
          <ChartKey tone={item.tone} shape={item.shape} />
          <span>{item.label}</span>
          {item.value !== undefined ? (
            <span className="font-medium text-ink tabular-nums">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Tooltip body and narrow readout
 * ------------------------------------------------------------------------- */

export interface ChartTooltipRow {
  id: string;
  label: string;
  value: string;
  tone: ChartTone;
  shape?: ChartKeyShape | undefined;
  /** Secondary context, e.g. the previous period's own date. */
  note?: string | undefined;
}

export interface ChartTooltipProps extends Omit<ComponentProps<"div">, "title"> {
  title?: ReactNode;
  rows: readonly ChartTooltipRow[];
}

/**
 * The readout used by every chart: the x label, then one row per series
 * with a line key, the series name and its value. Values are the strong
 * element; everything is in ink colours.
 */
export function ChartTooltip({ title, rows, className, ...props }: ChartTooltipProps) {
  return (
    <div
      className={cn(
        "max-w-72 min-w-40 rounded-card border border-line bg-surface px-3 py-2.5 shadow-popover",
        className,
      )}
      {...props}
    >
      {title !== undefined ? <p className="mb-1.5 text-caption text-ink-faint">{title}</p> : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
        {rows.map((row) => (
          <div key={row.id} className="contents">
            <dt className="contents">
              <ChartKey tone={row.tone} shape={row.shape} />
              <span className="min-w-0 truncate text-caption text-ink-muted">{row.label}</span>
            </dt>
            <dd className="text-right text-label text-ink tabular-nums">{row.value}</dd>
            {row.note ? (
              <dd className="col-start-2 col-end-4 -mt-1 text-caption text-ink-faint">
                {row.note}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

const READOUT_COLUMNS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

/**
 * The readout for narrow plots, pinned above the plot instead of floating
 * over it, so neither the tooltip nor a finger covers the point being read.
 * It shows the latest values until a point is chosen and doubles as the
 * legend. Every row keeps a fixed height, so scrubbing never moves the plot.
 */
export function ChartReadout({
  title,
  rows,
  latest = false,
  className,
}: {
  title?: ReactNode;
  rows: readonly ChartTooltipRow[];
  /** Showing the latest point rather than a chosen one. */
  latest?: boolean;
  className?: string | undefined;
}) {
  const heading = (
    <span className={cn("truncate text-caption", latest ? "text-ink-faint" : "text-ink-muted")}>
      {latest ? "Latest · " : null}
      {title}
    </span>
  );
  const [only] = rows;
  if (rows.length === 1 && only) {
    return (
      <div className={cn("flex min-w-0 items-baseline gap-2.5", className)}>
        <span className="shrink-0 text-label text-ink tabular-nums">{only.value}</span>
        {heading}
      </div>
    );
  }
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex min-w-0">{heading}</p>
      <dl
        className={cn(
          "mt-1.5 grid gap-x-4",
          READOUT_COLUMNS[Math.min(rows.length, READOUT_COLUMNS.length - 1)],
        )}
      >
        {rows.map((row) => (
          <div key={row.id} className="min-w-0">
            <dt className="flex min-w-0 items-center gap-1.5 text-caption text-ink-muted">
              <ChartKey tone={row.tone} shape={row.shape} />
              <span className="truncate">{row.label}</span>
            </dt>
            <dd className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
              <span className="text-label text-ink tabular-nums">{row.value}</span>
              {row.note ? (
                <span className="truncate text-caption text-ink-faint">{row.note}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Table twin
 * ------------------------------------------------------------------------- */

// TableCell's classes on a row header: the x label heads its row.
const ROW_HEADER =
  "h-13 px-4 text-left align-middle font-normal whitespace-nowrap text-ink-muted first:pl-5 last:pr-5 group-data-dense/table:h-10 sm:first:pl-6 sm:last:pr-6";

/**
 * The table twin, built from the design system's Table: white sticky header,
 * hairline rows, 20/24 px insets. It is flush: inside a card it runs edge to
 * edge. Caption notes (a comparison period's dates) sit under the table.
 */
export function ChartTableView({
  model,
  caption,
  className,
  maxHeight = 320,
}: {
  model: ChartTableModel;
  caption?: ReactNode;
  className?: string | undefined;
  maxHeight?: number | undefined;
}) {
  const [xHeader, ...valueHeaders] = model.columns;
  const notes = model.notes.join(" ");
  return (
    <div className={cn("min-w-0", className)}>
      <Table dense stickyHeader maxHeight={`${String(maxHeight)}px`}>
        {caption || notes ? (
          <TableCaption>
            {caption}
            {caption && notes ? ". " : null}
            {notes}
          </TableCaption>
        ) : null}
        <TableHeader>
          <TableRow>
            <TableHead>{xHeader}</TableHead>
            {valueHeaders.map((header, i) => (
              <TableHead key={`${String(i)}-${header}`} numeric>
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.rows.map((row) => (
            <TableRow key={row.key}>
              <th scope="row" className={ROW_HEADER}>
                {row.header}
              </th>
              {row.cells.map((value, i) => (
                <TableCell key={i} numeric className="text-ink">
                  {value}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {notes ? (
        <p
          aria-hidden="true"
          className="border-t border-line px-5 py-3 text-caption text-ink-faint sm:px-6"
        >
          {notes}
        </p>
      ) : null}
    </div>
  );
}

export interface ChartTableProps {
  series: readonly ChartSeries[];
  valueFormat?: ChartValueFormat | undefined;
  xFormat?: ChartXFormat | undefined;
  locale?: string | undefined;
  /** Header for the first column. Defaults to "Date" for dates, otherwise "Label". */
  xHeader?: string | undefined;
  /** Accessible caption (visually hidden). */
  caption?: ReactNode;
  /** Scrolls beyond this height with a sticky header. Default 320. */
  maxHeight?: number | undefined;
  className?: string | undefined;
}

/**
 * The accessible table twin of a chart: one row per x, one column per
 * series. Flush like Table: place it edge to edge in a card.
 */
export function ChartTable({
  series,
  valueFormat,
  xFormat,
  locale = CHART_DEFAULT_LOCALE,
  xHeader,
  caption,
  maxHeight,
  className,
}: ChartTableProps) {
  const model = chartTableModel(series, {
    formatValue: chartNumberFormatter(valueFormat, locale),
    formatX: chartXFormatter(xFormat, locale, CHART_DETAIL_DATE),
    xHeader,
  });
  return (
    <ChartTableView model={model} caption={caption} maxHeight={maxHeight} className={className} />
  );
}

/* ---------------------------------------------------------------------------
 * Empty and loading frames
 * ------------------------------------------------------------------------- */

/** Faint gridlines and a baseline: the chart's frame without any data. */
function ChartFrameLines({ rows = 4 }: { rows?: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-2 bottom-7 flex flex-col justify-between"
    >
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className={cn("block h-px", i === rows - 1 ? "bg-line-strong" : "bg-chart-grid")}
        />
      ))}
    </div>
  );
}

export interface ChartEmptyProps {
  /** Default "Not collecting yet". */
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** An element such as <Icon icon={Store} />. Default: a line-chart icon. */
  icon?: ReactNode;
  /** Match the chart it stands in for, so the card doesn't jump. Default 240. */
  height?: number;
  className?: string | undefined;
}

/**
 * The honest empty state for a chart: the frame (grid and baseline) with a
 * short explanation. Never a placeholder line or invented values.
 */
export function ChartEmpty({
  title = "Not collecting yet",
  description,
  action,
  icon,
  height = 240,
  className,
}: ChartEmptyProps) {
  return (
    <div className={cn("relative", className)} style={{ height }}>
      <ChartFrameLines />
      <div className="absolute inset-0 flex items-center justify-center px-4 pb-5">
        <div className="flex max-w-xs flex-col items-center bg-surface px-5 py-4 text-center">
          <span className="mb-3 flex size-9 items-center justify-center rounded-control border border-line bg-surface text-ink-faint shadow-xs">
            {icon ?? <Icon icon={ChartLine} size="sm" />}
          </span>
          <p className="text-label text-ink">{title}</p>
          {description ? <p className="mt-1 text-caption text-ink-muted">{description}</p> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Loading frame: the grid with a quiet shimmer where the data will be. */
export function ChartSkeleton({
  height = 240,
  className,
}: {
  height?: number;
  className?: string | undefined;
}) {
  return (
    <div className={cn("relative", className)} style={{ height }} role="status">
      <span className="sr-only">Loading chart</span>
      <ChartFrameLines />
      <div aria-hidden="true" className="absolute inset-x-0 top-2 bottom-7 flex items-end gap-3">
        <span className="sv-chart-shimmer block h-3/5 flex-1 rounded-sm" />
      </div>
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 flex justify-between">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="sv-chart-shimmer block h-2.5 w-9 rounded-xs" />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sparkline
 * ------------------------------------------------------------------------- */

export interface SparklineProps {
  /** Values oldest → newest, or {x, y} points. `null` is a gap. */
  data: readonly (number | null)[] | readonly ChartDatum[];
  /**
   * What it measures, e.g. "Revenue, last 30 days". A labelled sparkline is
   * announced as an image: the label and its first-to-last change.
   */
  label?: string | undefined;
  /** The accessible name in full, instead of the computed change. */
  summary?: string | undefined;
  /**
   * Hidden from assistive technology. Use it where a figure beside the line
   * already states the change (a KPI tile), so listeners don't hear two
   * different changes. Default: true when there is no label or summary.
   */
  decorative?: boolean | undefined;
  tone?: ChartTone;
  /** A 10% wash under the line. */
  area?: boolean;
  /** Pixel height. Default 32. Width fills the container. */
  height?: number;
  valueFormat?: ChartValueFormat | undefined;
  locale?: string | undefined;
  className?: string | undefined;
}

const SPARK_PAD = 4;

function sparkValues(data: SparklineProps["data"]): (number | null)[] {
  return data.map((d) => (d === null || typeof d === "number" ? d : d.y));
}

/** "Revenue: up 32.5%, from $1,415 to $1,875". */
function sparkDescription(
  label: string,
  values: readonly (number | null)[],
  format: (value: number) => string,
  locale: string,
): string {
  const trend = chartTrend(values);
  if (trend.first === null || trend.last === null) return `${label}: no data`;
  if (trend.direction === "flat") return `${label}: flat at ${format(trend.last)}`;
  const change =
    trend.change === null
      ? ""
      : ` ${new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(trend.change))}`;
  return `${label}: ${trend.direction}${change}, from ${format(trend.first)} to ${format(trend.last)}`;
}

/**
 * A tiny trend line for KPI tiles: no axes, a dot on the latest value. It
 * stretches to any width without measuring (non-scaling strokes, an HTML dot).
 */
export function Sparkline({
  data,
  label,
  summary,
  decorative,
  tone = "primary",
  area = false,
  height = 32,
  valueFormat,
  locale = CHART_DEFAULT_LOCALE,
  className,
}: SparklineProps) {
  const values = sparkValues(data);
  const drawn = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const min = Math.min(...drawn);
  const max = Math.max(...drawn);
  const y = chartLinearScale(min === max ? [min - 1, max + 1] : [min, max], [
    height - SPARK_PAD,
    SPARK_PAD,
  ]);
  const points = values.map((v, i) =>
    v === null || !Number.isFinite(v)
      ? null
      : { x: chartPointX(i, values.length, 0, 100), y: y(v) },
  );
  const lastIndex = points.findLastIndex((p) => p !== null);
  const last = points[lastIndex] ?? null;
  const hidden = decorative ?? (label === undefined && summary === undefined);
  const name = hidden
    ? undefined
    : (summary ??
      sparkDescription(
        label ?? "Trend",
        values,
        chartNumberFormatter(valueFormat, locale),
        locale,
      ));
  return (
    <div
      {...(hidden ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      className={cn("relative w-full", className)}
      style={{ height }}
    >
      {drawn.length > 0 ? (
        <div className="absolute inset-y-0 right-1 left-0">
          <svg
            aria-hidden="true"
            viewBox={`0 0 100 ${String(height)}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {area ? (
              <path
                d={chartAreaPath(points, height, "linear")}
                className={CHART_TONE_FILL[tone]}
                fillOpacity={0.1}
              />
            ) : null}
            <path
              d={chartLinePath(points)}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={CHART_TONE_STROKE[tone]}
            />
          </svg>
          {last ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface forced-color-adjust-none",
                TONE_DOT[tone],
              )}
              style={{ left: `${String(last.x)}%`, top: last.y } satisfies CSSProperties}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Headline figure
 * ------------------------------------------------------------------------- */

export interface ChartHeadlineProps {
  /** The figure, already formatted (proportional digits, Inter). */
  value: ReactNode;
  /**
   * The change, as Metric takes it: its sign sets the arrow, the visible
   * sign and the spoken direction. { value: 8.2 } shows "+8.2%"; a label
   * keeps a unit, and gets the sign if it lacks one: { value: -0.3,
   * label: "0.3 pts" } shows "−0.3 pts".
   */
  delta?: MetricDelta | undefined;
  /** A fall is good news (e.g. refund rate, page load time). */
  lowerIsBetter?: boolean | undefined;
  /** What the delta compares against, e.g. "vs previous 30 days". */
  comparison?: ReactNode;
  size?: "md" | "lg" | undefined;
  className?: string | undefined;
}

// Metric's delta pill (data.tsx), so a KPI row and a chart card agree.
const DELTA_TONES: Record<MetricDeltaTone, string> = {
  positive: "bg-success-50 text-success-700",
  negative: "bg-danger-50 text-danger-700",
  neutral: "bg-neutral-100 text-ink-muted",
};

/**
 * The headline metric slot of a ChartCard: the figure, then Metric's delta
 * pill (arrow, sign, and spoken text such as "Up 8.2% vs previous period,
 * an improvement") and what it compares against.
 */
export function ChartHeadline({
  value,
  delta,
  lowerIsBetter = false,
  comparison,
  size = "md",
  className,
}: ChartHeadlineProps) {
  const tone = delta ? metricDeltaTone(delta.value, lowerIsBetter) : "neutral";
  const text = delta ? metricDeltaText(delta) : null;
  const direction = delta
    ? delta.value > 0
      ? ArrowUpRight
      : delta.value < 0
        ? ArrowDownRight
        : Minus
    : null;
  // Always signed: a label without a sign takes the value's.
  const visible =
    delta && text && delta.value !== 0 && !/^[+\-−]/.test(text.visible)
      ? `${delta.value > 0 ? "+" : "−"}${text.visible}`
      : text?.visible;
  const judgement =
    tone === "positive" ? ", an improvement" : tone === "negative" ? ", a decline" : "";
  const spokenComparison = typeof comparison === "string" ? ` ${comparison}` : "";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <span className={cn("text-ink", size === "lg" ? "text-metric-lg" : "text-metric")}>
        {value}
      </span>
      {text && direction ? (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "inline-flex h-5 items-center gap-0.5 rounded-pill pr-1.5 pl-1 text-caption font-medium tabular-nums",
              DELTA_TONES[tone],
            )}
          >
            <Icon icon={direction} size="xs" />
            <span aria-hidden="true">{visible}</span>
            <span className="sr-only">
              {text.spoken}
              {spokenComparison}
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
        </span>
      ) : comparison ? (
        <span className="text-caption text-ink-faint">{comparison}</span>
      ) : null}
    </div>
  );
}
