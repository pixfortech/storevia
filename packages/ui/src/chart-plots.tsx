"use client";
// Interactive charts (charts.tsx): line, area, bar and donut. Pure SVG and
// React; geometry comes from chart-core.ts.
//
// - Rendered at real pixel size: the plot is measured with ResizeObserver.
//   Server HTML uses a default width inside a viewBox (non-scaling strokes,
//   HTML axis labels), so the frame doesn't shift when the measure lands.
// - Hover, tap and keyboard all drive one readout: a crosshair (lines) or a
//   band wash (bars), plus a floating tooltip on wide plots or, under
//   480 px, a readout pinned above the plot (switched by a container query,
//   so server HTML already has the right one).
// - Entrance motion is MOTION's ChartReveal: marks carry its .sv-motion-*
//   classes, so charts share one reduced-motion and final-state policy.
// - Inside a ChartCard showing "table", each chart renders its table twin.
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  CHART_DEFAULT_LOCALE,
  CHART_DETAIL_DATE,
  CHART_TOOLTIP_DATE,
  chartArcPath,
  chartAreaPath,
  chartAxisFormatter,
  chartBarPath,
  chartExtent,
  chartFoldOther,
  chartIsIntegerData,
  chartLength,
  chartLinearScale,
  chartLinePath,
  chartNearestIndex,
  chartNiceTicks,
  chartNumberFormatter,
  chartPointX,
  chartRuns,
  chartSeriesTones,
  chartShortLabels,
  chartSummary,
  chartTableModel,
  chartTextWidth,
  chartTickIndices,
  chartXAt,
  chartXFormatter,
  chartXKey,
  type ChartCurve,
  type ChartPart,
  type ChartSeries,
  type ChartTableModel,
  type ChartTone,
  type ChartValueFormat,
  type ChartXFormat,
} from "./chart-core";
import { ChartViewContext } from "./chart-context";
import {
  CHART_HISTORY_DASH,
  CHART_TONE_BG,
  CHART_TONE_FILL,
  CHART_TONE_POINT,
  ChartEmpty,
  ChartKey,
  ChartLegend,
  ChartReadout,
  ChartTableView,
  ChartTooltip,
  chartLineClasses,
  type ChartEmptyProps,
  type ChartKeyShape,
  type ChartTooltipRow,
} from "./chart-parts";
import { cn } from "./cn";
import { ChartReveal } from "./motion";

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------- */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The element's content width, or null until measured (server render). */
function useChartWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = el.getBoundingClientRect().width;
      if (next > 0)
        setWidth((prev) => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

type ActiveSource = "pointer" | "touch" | "keyboard";
interface Active {
  index: number;
  source: ActiveSource;
}

/** Keyboard stepping shared by every chart: arrows, Home/End, Escape. */
function stepIndex(key: string, current: number | null, count: number): number | null | undefined {
  const last = count - 1;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return current === null ? last : Math.min(last, current + 1);
    case "ArrowLeft":
    case "ArrowUp":
      return current === null ? last : Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return last;
    case "Escape":
      return null;
    default:
      return undefined;
  }
}

/** A tap elsewhere dismisses a touch readout. */
function useDismissOnOutsideTap(
  rootRef: RefObject<HTMLElement | null>,
  active: Active | null,
  setActive: (next: Active | null) => void,
) {
  const touch = active?.source === "touch";
  useEffect(() => {
    if (!touch) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) {
        setActive(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
    };
  }, [touch, rootRef, setActive]);
}

/**
 * A chart's root. With `reveal` it is MOTION's ChartReveal: marks below the
 * fold wait (hidden) and draw or grow in on first view; charts in view at
 * mount, reduced motion, server HTML and print show the final state.
 */
function ChartRoot({
  reveal,
  step,
  duration,
  ref,
  className,
  children,
}: {
  reveal: boolean;
  step?: number | undefined;
  duration?: "slow" | undefined;
  ref: Ref<HTMLDivElement>;
  className: string;
  children: ReactNode;
}) {
  if (!reveal) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }
  return (
    <ChartReveal ref={ref} step={step} duration={duration} className={className}>
      {children}
    </ChartReveal>
  );
}

/* ---------------------------------------------------------------------------
 * Shared props
 * ------------------------------------------------------------------------- */

export interface ChartProps {
  /** Up to three series; slots follow the fixed order unless pinned with `tone`. */
  series: readonly ChartSeries[];
  /** Total pixel height including the x-axis band. Default 240. */
  height?: number | undefined;
  /** Values in tooltips and the table. Intl options work from server components. */
  valueFormat?: ChartValueFormat | undefined;
  /** Y-axis ticks. Defaults to `valueFormat`, compact from five digits. */
  axisFormat?: ChartValueFormat | undefined;
  /** X-axis labels for dates (default "Sep 24", in UTC). */
  xFormat?: ChartXFormat | undefined;
  /** Dates in the tooltip (default "Wed, Sep 24"). */
  tooltipXFormat?: ChartXFormat | undefined;
  /** Locale for numbers and dates. Default "en-US". */
  locale?: string | undefined;
  /** Accessible name, e.g. "Revenue, last 30 days". A data summary is appended. */
  label?: string | undefined;
  /** Show the legend. Default: when there are two or more series. */
  legend?: boolean | undefined;
  /** Fix the y domain (it's still extended to round ticks). Default: data and zero. */
  yDomain?: readonly [number, number] | undefined;
  /** Header of the first table column. Default "Date" or "Label". */
  xHeader?: string | undefined;
  /** Shown when there is no data. */
  empty?: Omit<ChartEmptyProps, "height"> | undefined;
  /** Draw/grow the marks on first view (MOTION's ChartReveal). Default true. */
  reveal?: boolean | undefined;
  className?: string | undefined;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_WIDTH = 640;
const PAD_TOP = 8;
const AXIS_BAND = 28;
const BAR_GAP = 2;
const BAR_MAX = 24;
/** Below this plot width the readout is pinned above the plot. */
const NARROW = 480;
// The same breakpoint as a container query on the chart root (30rem = 480 px).
const WIDE_ONLY = "hidden @min-[30rem]/chart:flex";
const NARROW_ONLY = "@min-[30rem]/chart:hidden";

// Draw order: history underneath, the primary series on top.
const DRAW_RANK: Record<ChartTone, number> = { muted: 0, tertiary: 1, comparison: 2, primary: 3 };

function keyShape(kind: "line" | "area" | "bar", tone: ChartTone): ChartKeyShape {
  if (kind === "bar") return "rect";
  return tone === "muted" ? "dashed" : "line";
}

const pct = (value: number, total: number) => `${String((value / total) * 100)}%`;

/** Bars share about 360 ms of stagger, so any count reads as one gesture. */
function revealStep(count: number): number {
  return Math.max(8, Math.min(40, Math.round(360 / Math.max(1, count))));
}

/* ---------------------------------------------------------------------------
 * Cartesian charts (line, area, vertical bar)
 * ------------------------------------------------------------------------- */

interface CartesianProps extends ChartProps {
  kind: "line" | "area" | "bar";
  curve?: ChartCurve | undefined;
}

function Cartesian({
  kind,
  series: input,
  height = DEFAULT_HEIGHT,
  valueFormat,
  axisFormat,
  xFormat,
  tooltipXFormat,
  locale = CHART_DEFAULT_LOCALE,
  label,
  legend,
  yDomain,
  xHeader,
  empty,
  reveal = true,
  curve = "linear",
  className,
}: CartesianProps) {
  const view = useContext(ChartViewContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const measured = useChartWidth(frameRef);
  const [active, setActive] = useState<Active | null>(null);
  const [tipLeft, setTipLeft] = useState<number | null>(null);
  useDismissOnOutsideTap(rootRef, active, setActive);

  // Three slots exist; a fourth series would need a generated colour.
  const series = input.slice(0, 3);
  const tones = chartSeriesTones(series);
  const count = chartLength(series);
  const width = measured ?? DEFAULT_WIDTH;
  const narrow = width < NARROW;

  const formatValue = chartNumberFormatter(valueFormat, locale);
  const formatX = chartXFormatter(xFormat, locale);
  const formatTipX = chartXFormatter(
    tooltipXFormat ?? (typeof xFormat === "function" ? xFormat : undefined),
    locale,
    CHART_TOOLTIP_DATE,
  );

  // Y scale: 3–5 round ticks over the data (and zero).
  const [lo, hi] = yDomain ?? chartExtent(series, true);
  const ticks = chartNiceTicks(lo, hi, height < 200 || narrow ? 3 : 4, {
    integer: chartIsIntegerData(series),
  });
  const yMin = ticks[0] ?? 0;
  const yMax = ticks[ticks.length - 1] ?? 1;
  const formatAxis = chartAxisFormatter(
    axisFormat ?? valueFormat,
    locale,
    Math.max(Math.abs(yMin), Math.abs(yMax)),
  );
  const tickLabels = ticks.map(formatAxis);
  const gutter = Math.max(24, ...tickLabels.map((t) => chartTextWidth(t))) + 12;

  const plotLeft = gutter;
  const plotRight = width - (kind === "bar" ? 0 : 8);
  const plotTop = PAD_TOP;
  const plotBottom = height - AXIS_BAND;
  const yScale = chartLinearScale([yMin, yMax], [plotBottom, plotTop]);
  const baseValue = yMin <= 0 && yMax >= 0 ? 0 : yMin;
  const baseY = yScale(baseValue);
  const band = (plotRight - plotLeft) / Math.max(1, count);
  const positions = Array.from({ length: count }, (_, i) =>
    kind === "bar" ? plotLeft + band * (i + 0.5) : chartPointX(i, count, plotLeft, plotRight),
  );

  // X labels. Time axes thin to what fits, anchored on the latest point.
  // Category axes show every label that fits, and weekday or month names
  // shorten to initials rather than drop out (an unlabelled weekday bar
  // can't be read). Other categories too long to fit thin like time; long
  // names belong in a horizontal bar chart.
  const xs = positions.map((_, i) => chartXAt(series, i));
  const fullLabels = xs.map((x) => (x === undefined ? "" : formatX(x)));
  const categorical = count > 0 && xs.every((x) => typeof x === "string");
  const slot = kind === "bar" || count < 2 ? band : (plotRight - plotLeft) / Math.max(1, count - 1);
  const fits = (labels: readonly string[]) =>
    labels.every((text) => chartTextWidth(text) + 6 <= slot);
  const shortLabels = categorical ? chartShortLabels(fullLabels) : null;
  let xLabels = fullLabels;
  let shownLabels: number[];
  if (categorical && fits(fullLabels)) {
    shownLabels = positions.map((_, i) => i);
  } else if (shortLabels && fits(shortLabels)) {
    xLabels = shortLabels;
    shownLabels = positions.map((_, i) => i);
  } else {
    const labelWidth = Math.max(0, ...fullLabels.map((l) => chartTextWidth(l)));
    const fit = Math.floor((plotRight - plotLeft) / (labelWidth + (narrow ? 28 : 20))) + 1;
    shownLabels = chartTickIndices(count, Math.min(fit, narrow ? 4 : 8));
  }

  // Tooltip placement (wide plots): beside the active x, flipped or clamped
  // to stay inside.
  useIsoLayoutEffect(() => {
    const tip = tooltipRef.current;
    const frame = frameRef.current;
    if (!tip || !frame || active === null) {
      if (tipLeft !== null) setTipLeft(null);
      return;
    }
    const frameWidth = frame.clientWidth;
    const scale = frameWidth / width;
    const x = (positions[active.index] ?? 0) * scale;
    const offset = (kind === "bar" ? (band / 2) * scale : 0) + 12;
    const tipWidth = tip.offsetWidth;
    let left = x + offset;
    if (left + tipWidth > frameWidth - 4) left = x - offset - tipWidth;
    if (left < 4) left = Math.min(Math.max(4, x - tipWidth / 2), frameWidth - tipWidth - 4);
    left = Math.round(left);
    if (left !== tipLeft) setTipLeft(left);
  });

  if (view === "table") {
    return (
      <ChartTableView
        className={className}
        caption={label}
        model={chartTableModel(series, {
          formatValue,
          formatX: chartXFormatter(
            typeof xFormat === "function" ? xFormat : undefined,
            locale,
            CHART_DETAIL_DATE,
          ),
          xHeader,
        })}
      />
    );
  }

  if (count === 0) {
    return (
      <ChartEmpty
        height={height}
        title={empty?.title ?? "No data yet"}
        description={empty?.description}
        action={empty?.action}
        icon={empty?.icon}
        className={className}
      />
    );
  }

  const kindName = kind === "bar" ? "Bar chart" : kind === "area" ? "Area chart" : "Line chart";
  const summary = chartSummary(kindName, series, { formatValue, formatX: formatTipX, label });
  const showLegend = legend ?? series.length > 1;
  const fillArea = kind === "area" && series.length === 1;
  const drawOrder = series
    .map((s, i) => ({ s, i, tone: tones[i] ?? "muted" }))
    .sort((a, b) => DRAW_RANK[a.tone] - DRAW_RANK[b.tone]);

  const activeIndex = active?.index ?? null;
  const rowsAt = (index: number): ChartTooltipRow[] => {
    const rowX = chartXAt(series, index);
    return series.map((s, i) => {
      const d = s.data[index];
      const tone = tones[i] ?? "muted";
      const differs = d && rowX !== undefined && chartXKey(d.x) !== chartXKey(rowX);
      return {
        id: s.id,
        label: s.label,
        tone,
        shape: keyShape(kind, tone),
        value: d?.y === null || d?.y === undefined ? "—" : formatValue(d.y),
        note: differs ? formatTipX(d.x) : undefined,
      };
    });
  };
  const titleAt = (index: number) => {
    const x = chartXAt(series, index);
    return x === undefined ? undefined : formatTipX(x);
  };
  const rows = activeIndex === null ? [] : rowsAt(activeIndex);
  const tipTitle = activeIndex === null ? undefined : titleAt(activeIndex);
  const readoutIndex = activeIndex ?? count - 1;
  const liveText =
    active?.source === "keyboard"
      ? `${tipTitle ?? ""}: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`
      : "";

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
    return chartNearestIndex(x, positions);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const index = indexAt(event);
    const source = event.pointerType === "touch" ? "touch" : "pointer";
    if (index !== active?.index || source !== active.source) setActive({ index, source });
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") setActive({ index: indexAt(event), source: "touch" });
  };
  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && active?.source === "pointer") setActive(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepIndex(event.key, activeIndex, count);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next === null ? null : { index: next, source: "keyboard" });
  };

  const crossX = activeIndex === null ? null : (positions[activeIndex] ?? null);

  return (
    <ChartRoot
      reveal={reveal}
      step={kind === "bar" ? revealStep(count) : undefined}
      ref={rootRef}
      className={cn("sv-chart @container/chart min-w-0", className)}
    >
      {showLegend ? (
        <ChartLegend
          className={cn("mb-4", WIDE_ONLY)}
          items={series.map((s, i) => {
            const tone = tones[i] ?? "muted";
            return { id: s.id, label: s.label, tone, shape: keyShape(kind, tone) };
          })}
        />
      ) : null}
      <ChartReadout
        className={cn("mb-4", NARROW_ONLY)}
        title={titleAt(readoutIndex)}
        rows={rowsAt(readoutIndex)}
        latest={activeIndex === null}
      />
      {/* role="application": screen readers hand the arrow keys to the chart
          (focus mode), and the live region below reads each value. */}
      <div
        ref={frameRef}
        role="application"
        aria-roledescription="chart"
        aria-label={`${summary} Use the left and right arrow keys to read each value.`}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (activeIndex === null && event.currentTarget.matches(":focus-visible")) {
            setActive({ index: count - 1, source: "keyboard" });
          }
        }}
        onBlur={() => {
          setActive(null);
        }}
        className="relative w-full touch-pan-y rounded-xs select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-focus"
        style={{ height }}
      >
        <svg
          aria-hidden="true"
          width="100%"
          height={height}
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          preserveAspectRatio="none"
          className="block overflow-visible"
        >
          {/* Grid: solid hairlines; the baseline one step stronger. */}
          <g shapeRendering="crispEdges">
            {ticks.map((tick) => {
              const y = Math.round(yScale(tick)) + 0.5;
              return (
                <line
                  key={tick}
                  x1={plotLeft}
                  x2={width}
                  y1={y}
                  y2={y}
                  vectorEffect="non-scaling-stroke"
                  className={tick === baseValue ? "stroke-line-strong" : "stroke-chart-grid"}
                />
              );
            })}
          </g>

          {kind === "bar" && activeIndex !== null ? (
            <rect
              x={plotLeft + band * activeIndex + 1}
              y={plotTop}
              width={Math.max(0, band - 2)}
              height={plotBottom - plotTop}
              rx={4}
              className="fill-subtle"
            />
          ) : null}

          {kind === "bar" ? (
            <BarMarks
              series={series}
              tones={tones}
              positions={positions}
              band={band}
              baseY={baseY}
              yScale={yScale}
            />
          ) : (
            // Lines (dashed ones included) and the wash wipe in together.
            <g className="sv-motion-wipe">
              {drawOrder.map(({ s, tone }) => {
                const points = positions.map((x, i) => {
                  const v = s.data[i]?.y;
                  return v === null || v === undefined ? null : { x, y: yScale(v) };
                });
                const lone = chartRuns(points).filter((run) => run.length === 1);
                return (
                  <g key={s.id}>
                    {fillArea ? (
                      <path
                        d={chartAreaPath(points, baseY, curve)}
                        className={CHART_TONE_FILL[tone]}
                        fillOpacity={0.1}
                      />
                    ) : null}
                    <path
                      d={chartLinePath(points, curve)}
                      fill="none"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap={tone === "muted" ? "butt" : "round"}
                      strokeDasharray={tone === "muted" ? CHART_HISTORY_DASH : undefined}
                      vectorEffect="non-scaling-stroke"
                      className={chartLineClasses(tone)}
                    />
                    {lone.map(([p]) =>
                      p ? (
                        <circle
                          key={String(p.x)}
                          cx={p.x}
                          cy={p.y}
                          r={3}
                          className={CHART_TONE_POINT[tone]}
                        />
                      ) : null,
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {kind !== "bar" && crossX !== null && activeIndex !== null ? (
            <g>
              <line
                x1={crossX}
                x2={crossX}
                y1={plotTop}
                y2={plotBottom}
                vectorEffect="non-scaling-stroke"
                shapeRendering="crispEdges"
                className="stroke-neutral-300"
              />
              {drawOrder.map(({ s, tone }) => {
                const v = s.data[activeIndex]?.y;
                if (v === null || v === undefined) return null;
                return (
                  <circle
                    key={s.id}
                    cx={crossX}
                    cy={yScale(v)}
                    r={4}
                    strokeWidth={2}
                    className={cn(CHART_TONE_POINT[tone], "stroke-surface")}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {/* Axis labels are HTML so they never stretch with the viewBox. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 text-caption text-ink-faint tabular-nums"
        >
          {ticks.map((tick, i) => (
            <span
              key={tick}
              className="absolute left-0 -translate-y-1/2 pr-2.5 text-right whitespace-nowrap"
              style={{ top: yScale(tick), width: pct(gutter, width) }}
            >
              {tickLabels[i]}
            </span>
          ))}
          {shownLabels.map((i) => {
            const x = positions[i] ?? 0;
            const text = xLabels[i] ?? "";
            // Centred under its point, nudged only as far as needed to stay inside.
            const textWidth = chartTextWidth(text);
            const left = Math.min(Math.max(x - textWidth / 2, 0), width - textWidth);
            return (
              <span
                key={i}
                className="absolute whitespace-nowrap"
                style={{ top: plotBottom + 8, left: pct(left, width) }}
              >
                {text}
              </span>
            );
          })}
        </div>

        {activeIndex !== null && !narrow ? (
          <ChartTooltip
            ref={tooltipRef}
            aria-hidden="true"
            title={tipTitle}
            rows={rows}
            className="pointer-events-none absolute animate-fade-in"
            style={
              {
                top: plotTop,
                left: tipLeft ?? 0,
                visibility: tipLeft === null ? "hidden" : "visible",
                zIndex: "var(--z-raised)",
              } satisfies CSSProperties
            }
          />
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
    </ChartRoot>
  );
}

function BarMarks({
  series,
  tones,
  positions,
  band,
  baseY,
  yScale,
}: {
  series: readonly ChartSeries[];
  tones: readonly ChartTone[];
  positions: readonly number[];
  band: number;
  baseY: number;
  yScale: (value: number) => number;
}) {
  const k = Math.max(1, series.length);
  // Thin bars (≤ 24 px) with the band's leftover as air; 2 px between a group.
  const share = k === 1 ? 0.44 : 0.64;
  const barWidth = Math.max(2, Math.min(BAR_MAX, (band * share - BAR_GAP * (k - 1)) / k));
  const groupWidth = k * barWidth + (k - 1) * BAR_GAP;
  return (
    <g>
      {positions.map((center, i) =>
        series.map((s, si) => {
          const v = s.data[i]?.y;
          if (v === null || v === undefined) return null;
          const end = yScale(v);
          const d = chartBarPath(
            center - groupWidth / 2 + si * (barWidth + BAR_GAP),
            barWidth,
            baseY,
            end,
          );
          if (!d) return null;
          return (
            <path
              key={`${s.id}-${String(i)}`}
              d={d}
              className={cn("sv-chart-bar sv-motion-grow", CHART_TONE_FILL[tones[si] ?? "muted"])}
              style={
                {
                  "--sv-motion-i": i,
                  // Negative bars grow down from the baseline at their top.
                  ...(end > baseY ? { transformOrigin: "50% 0%" } : {}),
                } as CSSProperties
              }
            />
          );
        }),
      )}
    </g>
  );
}

/* ---------------------------------------------------------------------------
 * Horizontal bars (rankings)
 * ------------------------------------------------------------------------- */

function HorizontalBars({
  series: input,
  valueFormat,
  xFormat,
  locale = CHART_DEFAULT_LOCALE,
  label,
  legend,
  xHeader,
  empty,
  reveal = true,
  className,
}: ChartProps) {
  const view = useContext(ChartViewContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  useDismissOnOutsideTap(rootRef, active, setActive);

  const series = input.slice(0, 3);
  const tones = chartSeriesTones(series);
  const count = chartLength(series);
  const formatValue = chartNumberFormatter(valueFormat, locale);
  const formatX = chartXFormatter(xFormat, locale, CHART_DETAIL_DATE);
  const [, max] = chartExtent(series, true);

  if (view === "table") {
    return (
      <ChartTableView
        className={className}
        caption={label}
        model={chartTableModel(series, { formatValue, formatX, xHeader })}
      />
    );
  }
  if (count === 0) {
    return (
      <ChartEmpty
        height={200}
        title={empty?.title ?? "No data yet"}
        description={empty?.description}
        action={empty?.action}
        icon={empty?.icon}
        className={className}
      />
    );
  }

  const showLegend = legend ?? series.length > 1;
  const activeIndex = active?.index ?? null;
  const valueAt = (s: ChartSeries | undefined, i: number) => {
    const v = s?.data[i]?.y;
    return v === null || v === undefined ? "—" : formatValue(v);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const next = stepIndex(event.key, activeIndex, count);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next === null ? null : { index: next, source: "keyboard" });
  };
  const activeX = activeIndex === null ? undefined : chartXAt(series, activeIndex);

  return (
    <ChartRoot reveal={reveal} ref={rootRef} className={cn("sv-chart min-w-0", className)}>
      {showLegend ? (
        <ChartLegend
          className="mb-4"
          items={series.map((s, i) => ({
            id: s.id,
            label: s.label,
            tone: tones[i] ?? "muted",
            shape: "rect",
          }))}
        />
      ) : null}
      {/* Labels and values are written out (a list screen readers read in
          place), so the hover readout is inline: the active row shows the
          other series' values beside its own. */}
      <ul
        aria-label={label ? `${label}, ranked` : "Ranking"}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (activeIndex === null && event.currentTarget.matches(":focus-visible")) {
            setActive({ index: 0, source: "keyboard" });
          }
        }}
        onBlur={() => {
          setActive(null);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null);
        }}
        className="rounded-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-focus"
      >
        {Array.from({ length: count }, (_, i) => {
          const x = chartXAt(series, i);
          const isActive = activeIndex === i;
          return (
            <li
              key={x === undefined ? i : chartXKey(x)}
              onPointerEnter={(event) => {
                setActive({
                  index: i,
                  source: event.pointerType === "mouse" ? "pointer" : "touch",
                });
              }}
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse") setActive({ index: i, source: "touch" });
              }}
              // The highlight bleeds 8 px sideways as a shadow, so rows stay
              // aligned with the card's text and never widen the layout.
              className={cn(
                "rounded-xs py-2 transition-[background-color,box-shadow] duration-(--duration-fast)",
                isActive && "bg-subtle shadow-[0_0_0_8px_var(--color-subtle)]",
              )}
            >
              <div className="flex items-baseline gap-3 text-body-sm">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {x === undefined ? "" : formatX(x)}
                </span>
                {series.slice(1).map((s, si) => (
                  <span
                    key={s.id}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 text-caption text-ink-muted tabular-nums transition-opacity duration-(--duration-fast)",
                      isActive ? "opacity-100" : "sr-only opacity-0",
                    )}
                  >
                    <ChartKey tone={tones[si + 1] ?? "muted"} shape="rect" />
                    <span className="sr-only">{s.label}: </span>
                    {valueAt(s, i)}
                  </span>
                ))}
                <span className="shrink-0 font-medium text-ink tabular-nums">
                  {series.length > 1 ? <span className="sr-only">{series[0]?.label}: </span> : null}
                  {valueAt(series[0], i)}
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 flex flex-col gap-0.5">
                {series.map((s, si) => {
                  const v = Math.max(0, s.data[i]?.y ?? 0);
                  return (
                    <span
                      key={s.id}
                      // Forced colours would drop the background (the bar).
                      className={cn(
                        "sv-chart-hbar sv-motion-grow-x block h-2 rounded-r-xs forced-color-adjust-none",
                        CHART_TONE_BG[tones[si] ?? "muted"],
                      )}
                      style={
                        {
                          width: max > 0 ? pct(v, max) : "0%",
                          minWidth: v > 0 ? 2 : 0,
                          "--sv-motion-i": i,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {active?.source === "keyboard" && activeX !== undefined && activeIndex !== null
          ? `${formatX(activeX)}: ${series.map((s) => `${s.label} ${valueAt(s, activeIndex)}`).join(", ")}`
          : ""}
      </p>
    </ChartRoot>
  );
}

/* ---------------------------------------------------------------------------
 * Public cartesian charts
 * ------------------------------------------------------------------------- */

export interface LineChartProps extends ChartProps {
  /** "linear" (default) or "monotone": smooth without overshooting the data. */
  curve?: ChartCurve | undefined;
}

/**
 * Trend over time. Series take the fixed slots: primary (blue), comparison
 * (violet), history (grey, dashed). One y axis, always.
 */
export function LineChart(props: LineChartProps) {
  return <Cartesian kind="line" {...props} />;
}

export type AreaChartProps = LineChartProps;

/** A line with a 10% wash beneath it. The wash is drawn for a single series only. */
export function AreaChart(props: AreaChartProps) {
  return <Cartesian kind="area" {...props} />;
}

export interface BarChartProps extends ChartProps {
  /** "vertical" columns (default) or "horizontal" bars for rankings. */
  orientation?: "vertical" | "horizontal" | undefined;
}

/**
 * Magnitude by category or day. Bars are at most 24 px wide with a 4 px
 * rounded data end; grouped series sit 2 px apart. Horizontal bars suit
 * rankings: labels and values are written out, so pass them sorted.
 */
export function BarChart({ orientation = "vertical", ...props }: BarChartProps) {
  if (orientation === "horizontal") return <HorizontalBars {...props} />;
  return <Cartesian kind="bar" {...props} />;
}

/* ---------------------------------------------------------------------------
 * Donut
 * ------------------------------------------------------------------------- */

export interface DonutChartProps {
  /** Parts of one whole. Order is kept, so colour follows each entity. */
  data: readonly ChartPart[];
  /** Up to 4 segments: three colours, then "Other" in grey. Default 4. */
  maxSegments?: number | undefined;
  otherLabel?: string | undefined;
  valueFormat?: ChartValueFormat | undefined;
  locale?: string | undefined;
  /** Caption under the centre figure, e.g. "Sessions". */
  centerLabel?: ReactNode;
  /** Centre figure. Defaults to the formatted total. */
  centerValue?: ReactNode;
  /** Diameter in px. Default 176. */
  size?: number | undefined;
  /** Ring thickness in px. Default 16. */
  thickness?: number | undefined;
  /** Legend beside the ring (wraps below on narrow containers) or none. Default "side". */
  legend?: "side" | "none" | undefined;
  /** Accessible name, e.g. "Sessions by channel". */
  label?: string | undefined;
  /** Header of the first table column. Default "Segment". */
  xHeader?: string | undefined;
  empty?: Omit<ChartEmptyProps, "height"> | undefined;
  reveal?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Part-to-whole at a glance, for a few clearly different shares. Use
 * sparingly: close values read better as bars. 2 px surface gaps separate
 * segments; the legend lists every value and share.
 */
export function DonutChart({
  data,
  maxSegments = 4,
  otherLabel = "Other",
  valueFormat,
  locale = CHART_DEFAULT_LOCALE,
  centerLabel,
  centerValue,
  size = 176,
  thickness = 16,
  legend = "side",
  label,
  xHeader = "Segment",
  empty,
  reveal = true,
  className,
}: DonutChartProps) {
  const view = useContext(ChartViewContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  useDismissOnOutsideTap(rootRef, active, setActive);

  const parts = chartFoldOther(data, maxSegments, otherLabel);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const formatValue = chartNumberFormatter(valueFormat, locale);
  const formatShare = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  if (view === "table") {
    const valid = data.filter((p) => Number.isFinite(p.value) && p.value > 0);
    const model: ChartTableModel = {
      columns: [xHeader, "Value", "Share"],
      rows: valid.map((p) => ({
        key: p.id,
        header: p.label,
        cells: [formatValue(p.value), total > 0 ? formatShare.format(p.value / total) : "—"],
      })),
      notes: [],
    };
    return <ChartTableView className={className} caption={label} model={model} />;
  }
  if (total <= 0) {
    return (
      <ChartEmpty
        height={size}
        title={empty?.title ?? "No data yet"}
        description={empty?.description}
        action={empty?.action}
        icon={empty?.icon}
        className={className}
      />
    );
  }

  const outer = size / 2;
  const inner = outer - thickness;
  let angle = 0;
  const arcs = parts.map((p) => {
    const a0 = angle;
    angle += (p.value / total) * Math.PI * 2;
    return { part: p, d: chartArcPath(outer, outer, outer, inner, a0, angle) };
  });
  const activePart = active === null ? null : (parts[active.index] ?? null);
  const summary = `${label ? `${label}. ` : ""}Donut chart, total ${formatValue(total)}. ${parts
    .map((p) => `${p.label}: ${formatValue(p.value)} (${formatShare.format(p.share)})`)
    .join("; ")}.`;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepIndex(event.key, active?.index ?? null, parts.length);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next === null ? null : { index: next, source: "keyboard" });
  };

  return (
    <ChartRoot
      reveal={reveal}
      step={60}
      duration="slow"
      ref={rootRef}
      className={cn("sv-chart flex min-w-0 flex-wrap items-center gap-x-10 gap-y-6", className)}
    >
      <div
        role="application"
        aria-roledescription="chart"
        aria-label={`${summary} Use the arrow keys to read each segment.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (active === null && event.currentTarget.matches(":focus-visible")) {
            setActive({ index: 0, source: "keyboard" });
          }
        }}
        onBlur={() => {
          setActive(null);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null);
        }}
        className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-focus"
        style={{ width: size, height: size }}
      >
        <svg
          aria-hidden="true"
          width={size}
          height={size}
          viewBox={`0 0 ${String(size)} ${String(size)}`}
        >
          {arcs.map(({ part, d }, i) => (
            <path
              key={part.id}
              d={d}
              strokeWidth={2}
              strokeLinejoin="round"
              onPointerEnter={(event) => {
                setActive({
                  index: i,
                  source: event.pointerType === "mouse" ? "pointer" : "touch",
                });
              }}
              className={cn(
                "sv-chart-segment sv-motion-fade stroke-surface",
                CHART_TONE_FILL[part.tone],
                activePart && activePart.id !== part.id && "opacity-35",
              )}
              style={{ "--sv-motion-i": i } as CSSProperties}
            />
          ))}
        </svg>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center"
        >
          <span
            className={cn(
              "max-w-full truncate text-ink",
              size >= 160 ? "text-h3 font-semibold tracking-tight" : "text-h4 font-semibold",
            )}
          >
            {activePart ? formatValue(activePart.value) : (centerValue ?? formatValue(total))}
          </span>
          <span className="mt-0.5 max-w-full truncate text-caption text-ink-faint">
            {activePart ? activePart.label : (centerLabel ?? "Total")}
          </span>
        </div>
      </div>
      {legend === "side" ? (
        <ul className="min-w-48 flex-1 divide-y divide-line text-body-sm">
          {parts.map((p, i) => (
            <li
              key={p.id}
              onPointerEnter={(event) => {
                setActive({
                  index: i,
                  source: event.pointerType === "mouse" ? "pointer" : "touch",
                });
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setActive(null);
              }}
              className={cn(
                "flex items-center gap-2.5 py-2 transition-opacity duration-(--duration-fast)",
                activePart && activePart.id !== p.id && "opacity-50",
              )}
            >
              <ChartKey tone={p.tone} shape="rect" />
              <span className="min-w-0 flex-1 truncate text-ink-muted">{p.label}</span>
              <span className="shrink-0 font-medium text-ink tabular-nums">
                {formatValue(p.value)}
              </span>
              <span className="w-12 shrink-0 text-right text-caption text-ink-faint tabular-nums">
                {formatShare.format(p.share)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {active?.source === "keyboard" && activePart
          ? `${activePart.label}: ${formatValue(activePart.value)}, ${formatShare.format(activePart.share)}`
          : ""}
      </p>
    </ChartRoot>
  );
}
