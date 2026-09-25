"use client";
// Interactive specimens for the motion gallery. Every figure here is example
// data and is labelled as such.
import { Button } from "@storevia/ui/button";
import { ChartLegend } from "@storevia/ui/charts";
import { cn } from "@storevia/ui/cn";
import { GlyphTile, Icon, type GlyphName } from "@storevia/ui/icons";
import {
  AnimatedNumber,
  ChartReveal,
  DrawLine,
  FadeIn,
  Float,
  HoverLift,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  Reveal,
  ScaleIn,
  SlideReveal,
  Stagger,
  useInView,
  usePrefersReducedMotion,
  type MotionDuration,
  type MotionEasing,
  type SlideDirection,
} from "@storevia/ui/motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Play,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

// --- Shared pieces -------------------------------------------------------------------

function ExampleTag({ children = "Example" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2 py-0.5 text-caption font-medium text-ink-muted ring-1 ring-line">
      <span className="size-1.5 rounded-full bg-neutral-300" aria-hidden />
      {children}
    </span>
  );
}

/** A specimen stage: a quiet well with a toolbar. Replay remounts the children. */
function Stage({
  label,
  children,
  tag,
  actions,
  className,
  replay = true,
}: {
  /** The specimen's name: Replay is announced as "Replay {label}". */
  label: string;
  children: ReactNode;
  tag?: ReactNode;
  actions?: ReactNode;
  className?: string;
  replay?: boolean;
}) {
  const [run, setRun] = useState(0);
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-subtle">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
        <ExampleTag>{tag ?? "Example"}</ExampleTag>
        <div className="flex items-center gap-1">
          {actions}
          {replay ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Replay ${label}`}
              onClick={() => {
                setRun((value) => value + 1);
              }}
            >
              <Icon icon={RotateCcw} size="xs" />
              Replay
            </Button>
          ) : null}
        </div>
      </div>
      <div key={run} className={cn("p-5 sm:p-8", className)}>
        {children}
      </div>
    </div>
  );
}

function Lines({ widths = ["100%", "64%"] }: { widths?: string[] }) {
  return (
    <div className="space-y-2" aria-hidden>
      {widths.map((width, index) => (
        <div key={index} className="h-1.5 rounded-pill bg-muted" style={{ width }} />
      ))}
    </div>
  );
}

/** A product concept as a quiet card: GlyphTile, title and placeholder lines. */
function DemoCard({
  glyph,
  title,
  meta = "Example",
  className,
}: {
  glyph: GlyphName;
  title: string;
  meta?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-line bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center gap-3">
        <GlyphTile name={glyph} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-label text-ink">{title}</p>
          <p className="text-caption text-ink-faint">{meta}</p>
        </div>
      </div>
      <div className="mt-4">
        <Lines />
      </div>
    </div>
  );
}

const PRODUCTS: [GlyphName, string][] = [
  ["online-store", "Online store"],
  ["website", "Business website"],
  ["publishing", "Publication"],
  ["portfolio", "Portfolio"],
  ["builder", "Builder"],
  ["themes", "Themes"],
];

// --- Tokens ----------------------------------------------------------------------------

const DURATION_USE: Record<MotionDuration, string> = {
  fast: "Hover and press",
  base: "Menus and toggles",
  slow: "Panels and sheets",
  reveal: "Section reveals",
};

const EASING_USE: Record<MotionEasing, string> = {
  standard: "State changes",
  emphasised: "Entrances",
  exit: "Exits",
};

function Track({ on, style }: { on: boolean; style: CSSProperties }) {
  return (
    <div className="relative h-2.5 w-full" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
      <div className="absolute inset-y-0 left-0 w-[calc(100%-10px)]">
        <div
          className="h-full w-full transition-[translate]"
          style={{ ...style, translate: on ? "100% 0" : "0 0" }}
        >
          <span className="block size-2.5 rounded-full bg-brand-600" />
        </div>
      </div>
    </div>
  );
}

// Easing plot: a 48 px tile with the curve inset 8 px, so time runs from the
// plot's bottom-left corner to its top-right one inside the frame.
const PLOT_LO = 8;
const PLOT_HI = 40;
const plotX = (x: number) => PLOT_LO + x * (PLOT_HI - PLOT_LO);
const plotY = (y: number) => PLOT_HI - y * (PLOT_HI - PLOT_LO);
const at = (x: number, y: number) => `${String(plotX(x))} ${String(plotY(y))}`;

function Curve({ points }: { points: readonly [number, number, number, number] }) {
  const [x1, y1, x2, y2] = points;
  return (
    <svg viewBox="0 0 48 48" className="size-12 shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="47" height="47" rx="7.5" className="fill-subtle stroke-line" />
      {/* Start and end values: the curve rises from one to the other. */}
      <path
        d={`M${at(0, 0)}H${String(PLOT_HI)}M${at(0, 1)}H${String(PLOT_HI)}`}
        className="stroke-line-strong"
        shapeRendering="crispEdges"
      />
      <path
        d={`M${at(0, 0)}L${at(x1, y1)}M${at(1, 1)}L${at(x2, y2)}`}
        className="stroke-neutral-300"
      />
      <DrawLine
        d={`M${at(0, 0)}C${at(x1, y1)} ${at(x2, y2)} ${at(1, 1)}`}
        className="fill-none stroke-brand-600"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TokenTables() {
  const [on, setOn] = useState(false);
  const verb = on ? "Reverse" : "Play";
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-subtle">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
        <ExampleTag>Same distance, different timing</ExampleTag>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`${verb} the duration and easing comparison`}
          onClick={() => {
            setOn((value) => !value);
          }}
        >
          <Icon icon={Play} size="xs" className={on ? "-scale-x-100" : undefined} />
          {verb}
        </Button>
      </div>
      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-surface shadow-card">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
            <h3 className="text-body-sm font-semibold text-ink">Durations</h3>
            <p className="text-caption text-ink-faint">On ease-standard</p>
          </div>
          <ul className="divide-y divide-line">
            {(Object.keys(MOTION_DURATIONS) as MotionDuration[]).map((name) => (
              <li
                key={name}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[9rem_1fr_4.5rem]"
              >
                <div>
                  <code className="font-mono text-label font-normal text-ink">duration-{name}</code>
                  <p className="text-caption text-ink-faint">{DURATION_USE[name]}</p>
                </div>
                <p className="text-right text-table tabular-nums text-ink-muted sm:order-last">
                  {MOTION_DURATIONS[name]} ms
                </p>
                <div className="col-span-2 sm:col-span-1">
                  <Track
                    on={on}
                    style={{
                      transitionDuration: `var(--duration-${name})`,
                      transitionTimingFunction: "var(--ease-standard)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-card border border-line bg-surface shadow-card">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
            <h3 className="text-body-sm font-semibold text-ink">Easings</h3>
            <p className="text-caption text-ink-faint">Compared at 640 ms</p>
          </div>
          <ul className="divide-y divide-line">
            {(Object.keys(MOTION_EASINGS) as MotionEasing[]).map((name) => (
              <li key={name} className="flex items-center gap-4 px-5 py-4">
                <Curve points={MOTION_EASINGS[name]} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <code className="font-mono text-label font-normal text-ink">ease-{name}</code>
                    <span className="text-caption text-ink-faint">{EASING_USE[name]}</span>
                  </div>
                  <Track
                    on={on}
                    style={{
                      transitionDuration: "var(--duration-reveal)",
                      transitionTimingFunction: `var(--ease-${name})`,
                    }}
                  />
                  <p className="truncate font-mono text-caption text-ink-faint">
                    cubic-bezier({MOTION_EASINGS[name].join(", ")})
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// --- Reduced motion --------------------------------------------------------------------

export function ReducedMotionStatus() {
  const reduced = usePrefersReducedMotion();
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1 text-label text-ink ring-1 ring-line">
      <span
        className={cn("size-2 rounded-full", reduced ? "bg-warning-500" : "bg-success-500")}
        aria-hidden
      />
      This browser: {reduced ? "reduced motion" : "motion allowed"}
    </span>
  );
}

// --- Entrances ----------------------------------------------------------------------------

export function RevealDemo() {
  return (
    <Stage label="Reveal">
      <div className="grid gap-4 sm:grid-cols-3">
        {PRODUCTS.slice(0, 3).map(([glyph, title], index) => (
          <Reveal key={glyph} appear delay={index * 80}>
            <DemoCard glyph={glyph} title={title} />
          </Reveal>
        ))}
      </div>
    </Stage>
  );
}

export function FadeInDemo() {
  return (
    <Stage label="FadeIn">
      <FadeIn
        appear
        className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 shadow-card"
      >
        <p className="text-overline uppercase text-brand-700">Announcement</p>
        <p className="mt-2 font-display text-h4 text-ink">Your website is published</p>
        <p className="mt-2 text-body-sm text-ink-muted">
          Opacity only. Use it for text over media and for tables, where movement would pull the eye
          away from reading.
        </p>
      </FadeIn>
    </Stage>
  );
}

const DIRECTIONS: [SlideDirection, LucideIcon][] = [
  ["up", ArrowUp],
  ["down", ArrowDown],
  ["left", ArrowLeft],
  ["right", ArrowRight],
];

export function SlideRevealDemo() {
  return (
    <Stage label="SlideReveal">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {DIRECTIONS.map(([direction, arrow], index) => (
          <SlideReveal key={direction} appear direction={direction} delay={index * 60}>
            <div className="flex aspect-[4/3] flex-col justify-between rounded-card border border-line bg-surface p-4 shadow-card">
              <Icon icon={arrow} className="text-ink-muted" />
              <div>
                <code className="font-mono text-label font-normal text-ink">{direction}</code>
                <p className="text-caption text-ink-faint">16 px</p>
              </div>
            </div>
          </SlideReveal>
        ))}
      </div>
    </Stage>
  );
}

function MiniWindow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-panel border border-line bg-surface shadow-window",
        className,
      )}
      aria-hidden
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-line px-3">
        <span className="size-2 rounded-full bg-neutral-200" />
        <span className="size-2 rounded-full bg-neutral-200" />
        <span className="size-2 rounded-full bg-neutral-200" />
        <span className="ml-3 h-1.5 w-24 rounded-pill bg-muted" />
      </div>
      <div className="grid grid-cols-[72px_1fr] gap-4 p-4 sm:grid-cols-[96px_1fr]">
        <div className="space-y-2.5">
          <div className="h-1.5 w-4/5 rounded-pill bg-brand-100" />
          <div className="h-1.5 w-3/5 rounded-pill bg-muted" />
          <div className="h-1.5 w-4/6 rounded-pill bg-muted" />
          <div className="h-1.5 w-3/6 rounded-pill bg-muted" />
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((key) => (
              <div key={key} className="rounded-sm border border-line p-2">
                <div className="h-1.5 w-2/3 rounded-pill bg-muted" />
                <div className="mt-2 h-2.5 w-1/2 rounded-pill bg-neutral-200" />
              </div>
            ))}
          </div>
          <svg viewBox="0 0 200 56" className="h-14 w-full" preserveAspectRatio="none">
            <path
              d="M0 46 C 20 44, 30 36, 50 38 S 80 26, 100 28 S 140 14, 160 18 S 190 8, 200 6"
              className="fill-none stroke-chart-1"
              strokeWidth="1.75"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function ScaleInDemo() {
  return (
    <Stage label="ScaleIn" className="grid place-items-center">
      <ScaleIn appear className="w-full max-w-md">
        <MiniWindow />
      </ScaleIn>
    </Stage>
  );
}

export function StaggerDemo() {
  return (
    <Stage label="Stagger">
      <Stagger appear as="ul" itemAs="li" className="grid gap-3 sm:grid-cols-3">
        {PRODUCTS.map(([glyph, title]) => (
          <DemoCard key={glyph} glyph={glyph} title={title} />
        ))}
      </Stagger>
    </Stage>
  );
}

// --- Numbers and charts -----------------------------------------------------------------

const NUMBER_EXAMPLES = [
  { label: "Orders", start: 12480, format: {} },
  { label: "Conversion", start: 0.042, format: { style: "percent", maximumFractionDigits: 1 } },
  {
    label: "Revenue",
    start: 48210,
    format: { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  },
] satisfies { label: string; start: number; format: Intl.NumberFormatOptions }[];

export function AnimatedNumberDemo() {
  const [values, setValues] = useState(NUMBER_EXAMPLES.map((example) => example.start));
  const shuffle = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        // Obviously fictional: a new random figure near the old one.
        setValues((current) =>
          current.map((value) => {
            const next = value * (0.7 + Math.random() * 0.6);
            return value < 1 ? Math.round(next * 1000) / 1000 : Math.round(next);
          }),
        );
      }}
    >
      New values
    </Button>
  );
  return (
    <Stage label="AnimatedNumber" tag="Example data" actions={shuffle}>
      <div className="grid divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {NUMBER_EXAMPLES.map((example, index) => (
          <div
            key={example.label}
            className="flex items-center justify-between gap-4 p-5 sm:block sm:p-6"
          >
            <div>
              <p className="text-label text-ink-muted">{example.label}</p>
              <p className="mt-1 text-caption text-ink-faint sm:hidden">Example value</p>
            </div>
            <AnimatedNumber
              appear
              value={values[index] ?? example.start}
              format={example.format}
              className="text-metric text-ink sm:mt-3 sm:block"
            />
            <p className="mt-1 hidden text-caption text-ink-faint sm:block">Example value</p>
          </div>
        ))}
      </div>
    </Stage>
  );
}

// Chart specimens, drawn to the chart spec (design-system/charts) so they read
// exactly like LineChart and BarChart: the same legend, 0/25/50 ticks (what
// those charts pick for this data), gutter, hairline grid with a stronger
// baseline, 2 px lines, grey dashed history and ≤ 24 px bars with a 4 px data
// end. Example series only: shapes for the specimen, not measurements.
const THIS_PERIOD = [18, 22, 21, 27, 25, 31, 34, 32, 38, 41, 39, 46];
const PREVIOUS_PERIOD = [16, 17, 19, 18, 21, 22, 21, 24, 25, 27, 26, 28];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LAST_WEEK = [28, 34, 31, 38, 41, 44, 36];
const THIS_WEEK = [31, 37, 35, 42, 45, 48, 40];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TICKS = [0, 25, 50];
const CHART_HEIGHT = 200;
const PAD_TOP = 8;
const AXIS_BAND = 28;
const PLOT_BOTTOM = CHART_HEIGHT - AXIS_BAND;
const NARROW = 480;

/** Rough rendered width of a 12 px label, as the charts estimate it. */
function labelWidth(text: string): number {
  let em = 0;
  for (const char of text) {
    if (/[0-9]/.test(char)) em += 0.62;
    else if (/[A-Z]/.test(char)) em += 0.7;
    else em += 0.56;
  }
  return Math.ceil(em * 12);
}

const GUTTER = Math.max(24, ...TICKS.map((tick) => labelWidth(String(tick)))) + 12;
const valueY = (value: number) =>
  PLOT_BOTTOM - (value / (TICKS.at(-1) ?? 1)) * (PLOT_BOTTOM - PAD_TOP);
const pct = (value: number, total: number) => `${String((value / total) * 100)}%`;
const r2 = (value: number) => String(Math.round(value * 100) / 100);

/** Which x labels fit, anchored on the latest, as the charts thin them. */
function labelIndices(count: number, plotWidth: number, text: string[], narrow: boolean) {
  const widest = Math.max(...text.map(labelWidth));
  const fit = Math.min(Math.floor(plotWidth / (widest + (narrow ? 28 : 20))) + 1, narrow ? 4 : 8);
  if (count <= fit) return text.map((_, index) => index);
  if (fit <= 1) return [count - 1];
  const stride = Math.ceil((count - 1) / (fit - 1));
  const indices: number[] = [];
  for (let index = count - 1; index >= 0; index -= stride) indices.unshift(index);
  return indices;
}

/** A bar with a 4 px rounded data end and a square baseline. */
function barPath(x: number, width: number, end: number) {
  const r = Math.min(4, width / 2, PLOT_BOTTOM - end);
  return [
    `M${r2(x)},${r2(PLOT_BOTTOM)}`,
    `V${r2(end + r)}`,
    `A${r2(r)},${r2(r)} 0 0 1 ${r2(x + r)},${r2(end)}`,
    `H${r2(x + width - r)}`,
    `A${r2(r)},${r2(r)} 0 0 1 ${r2(x + width)},${r2(end + r)}`,
    `V${r2(PLOT_BOTTOM)}`,
    "Z",
  ].join(" ");
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The plot's pixel width, so strokes, radii and labels are drawn at real size. */
function usePlotWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(320);
  useIsoLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = element.getBoundingClientRect().width;
      if (next > 0) setWidth((previous) => (Math.abs(previous - next) < 0.5 ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

/** Grid, y ticks and x labels: the frame stays put while the marks arrive. */
function PlotFrame({
  width,
  plotWidth,
  positions,
  labels,
  summary,
  children,
  plotRef,
}: {
  width: number;
  /** Width between the gutter and the last mark, for fitting x labels. */
  plotWidth: number;
  positions: number[];
  labels: string[];
  summary: string;
  children: ReactNode;
  plotRef: RefObject<HTMLDivElement | null>;
}) {
  const shown = labelIndices(positions.length, plotWidth, labels, width < NARROW);
  return (
    <div
      ref={plotRef}
      role="img"
      aria-label={summary}
      className="relative w-full"
      style={{ height: CHART_HEIGHT }}
    >
      <svg
        aria-hidden="true"
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${String(width)} ${String(CHART_HEIGHT)}`}
        preserveAspectRatio="none"
        className="block overflow-visible"
      >
        <g shapeRendering="crispEdges">
          {TICKS.map((tick) => {
            const y = Math.round(valueY(tick)) + 0.5;
            return (
              <line
                key={tick}
                x1={GUTTER}
                x2={width}
                y1={y}
                y2={y}
                vectorEffect="non-scaling-stroke"
                className={tick === 0 ? "stroke-line-strong" : "stroke-chart-grid"}
              />
            );
          })}
        </g>
        {children}
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 text-caption text-ink-faint tabular-nums"
      >
        {TICKS.map((tick) => (
          <span
            key={tick}
            className="absolute left-0 -translate-y-1/2 pr-2.5 text-right whitespace-nowrap"
            style={{ top: valueY(tick), width: pct(GUTTER, width) }}
          >
            {tick}
          </span>
        ))}
        {shown.map((index) => {
          const text = labels[index] ?? "";
          const left = Math.min(
            Math.max((positions[index] ?? 0) - labelWidth(text) / 2, 0),
            width - labelWidth(text),
          );
          return (
            <span
              key={index}
              className="absolute whitespace-nowrap"
              style={{ top: PLOT_BOTTOM + 8, left: pct(left, width) }}
            >
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ChartSpecimen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <ChartReveal appear className="rounded-card border border-line bg-surface shadow-card">
      <div className="px-5 pt-5">
        <p className="text-body-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 font-mono text-caption text-ink-faint">{description}</p>
      </div>
      <div className="px-5 pt-6 pb-5">{children}</div>
    </ChartReveal>
  );
}

function LineDraw() {
  const plotRef = useRef<HTMLDivElement>(null);
  const width = usePlotWidth(plotRef);
  const right = width - 8;
  const positions = THIS_PERIOD.map(
    (_, index) => GUTTER + (index / (THIS_PERIOD.length - 1)) * (right - GUTTER),
  );
  const line = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${r2(positions[index] ?? 0)},${r2(valueY(value))}`,
      )
      .join("");
  return (
    <>
      <ChartLegend
        className="mb-4"
        items={[
          { id: "current", label: "This period", tone: "primary", shape: "line" },
          { id: "previous", label: "Previous period", tone: "muted", shape: "dashed" },
        ]}
      />
      <PlotFrame
        plotRef={plotRef}
        width={width}
        plotWidth={right - GUTTER}
        positions={positions}
        labels={MONTHS}
        summary="Example line chart, January to December: this period rises from 18 to 46; the previous period from 16 to 28."
      >
        {/* History underneath, the subject on top. Dashes can't use the
            draw technique, so the history line wipes in. */}
        <path
          d={line(PREVIOUS_PERIOD)}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          className="sv-motion-wipe stroke-chart-history"
        />
        <DrawLine
          d={line(THIS_PERIOD)}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-chart-1"
        />
      </PlotFrame>
    </>
  );
}

function BarGrow() {
  const plotRef = useRef<HTMLDivElement>(null);
  const width = usePlotWidth(plotRef);
  const band = (width - GUTTER) / THIS_WEEK.length;
  const positions = THIS_WEEK.map((_, index) => GUTTER + band * (index + 0.5));
  // Two series: 64% of each band, bars 2 px apart, never wider than 24 px.
  const barWidth = Math.max(2, Math.min(24, (band * 0.64 - 2) / 2));
  const group = barWidth * 2 + 2;
  return (
    <>
      <ChartLegend
        className="mb-4"
        items={[
          { id: "last", label: "Last week", tone: "muted", shape: "rect" },
          { id: "this", label: "This week", tone: "primary", shape: "rect" },
        ]}
      />
      <PlotFrame
        plotRef={plotRef}
        width={width}
        plotWidth={width - GUTTER}
        positions={positions}
        labels={WEEKDAYS}
        summary="Example bar chart, Monday to Sunday: last week from 28 to 44, this week from 31 to 48."
      >
        {positions.map((center, index) =>
          [LAST_WEEK, THIS_WEEK].map((series, si) => (
            <path
              key={`${String(si)}-${String(index)}`}
              d={barPath(
                center - group / 2 + si * (barWidth + 2),
                barWidth,
                valueY(series[index] ?? 0),
              )}
              className={cn("sv-motion-grow", si === 0 ? "fill-chart-muted" : "fill-chart-1")}
              style={{ "--sv-motion-i": index } as CSSProperties}
            />
          )),
        )}
      </PlotFrame>
    </>
  );
}

export function ChartRevealDemo() {
  return (
    <Stage label="ChartReveal" tag="Example data">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSpecimen title="Line draw" description="DrawLine · sv-motion-wipe">
          <LineDraw />
        </ChartSpecimen>
        <ChartSpecimen title="Bar grow" description="sv-motion-grow · --sv-motion-i">
          <BarGrow />
        </ChartSpecimen>
      </div>
    </Stage>
  );
}

const FIGURE = "rounded-card border border-line bg-surface p-3 shadow-card sm:p-5";

export function DrawLineDemo() {
  return (
    <Stage label="DrawLine">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <figure className={FIGURE}>
          <svg viewBox="0 0 120 40" className="h-10 w-full sm:h-16" aria-hidden>
            <DrawLine
              appear
              d="M2 32 L14 28 L26 30 L38 22 L50 24 L62 16 L74 19 L86 11 L98 13 L118 5"
              className="fill-none stroke-chart-1"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <figcaption className="mt-3 text-caption text-ink-faint">Sparkline</figcaption>
        </figure>
        <figure className={FIGURE}>
          <svg viewBox="0 0 120 40" className="h-10 w-full sm:h-16" aria-hidden>
            <DrawLine
              appear
              d="M60 4 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32"
              className="fill-none stroke-success-600"
              strokeWidth="1.75"
            />
            <DrawLine
              appear
              delay={360}
              duration="slow"
              d="M52.5 20.5 L58 26 L68.5 15"
              className="fill-none stroke-success-600"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <figcaption className="mt-3 text-caption text-ink-faint">Confirmation</figcaption>
        </figure>
        <figure className={FIGURE}>
          <svg viewBox="0 0 120 40" className="h-10 w-full sm:h-16" aria-hidden>
            <circle cx="10" cy="30" r="4" className="fill-brand-600" />
            <circle cx="110" cy="10" r="4" className="fill-accent-400" />
            <DrawLine
              appear
              d="M16 30 C 56 30, 64 10, 104 10"
              className="fill-none stroke-neutral-400"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <figcaption className="mt-3 text-caption text-ink-faint">Connector</figcaption>
        </figure>
      </div>
    </Stage>
  );
}

// --- Interaction -------------------------------------------------------------------------

const LIFT_ITEMS: [GlyphName, string, string][] = [
  ["online-store", "Online store", "Products and orders"],
  ["website", "Business website", "Pages and bookings"],
  ["publishing", "Publication", "Posts and newsletters"],
];

export function HoverLiftDemo() {
  return (
    <Stage label="HoverLift" replay={false} tag="Hover or tab to a card">
      <ul className="grid gap-4 sm:grid-cols-3">
        {LIFT_ITEMS.map(([glyph, title, body]) => (
          <li key={title}>
            <HoverLift asChild>
              <a
                href="#hover-lift"
                className="group block rounded-card border border-line bg-surface p-5 shadow-card hover:border-line-strong"
              >
                <div className="flex items-start justify-between">
                  <GlyphTile name={glyph} size="sm" />
                  <Icon
                    icon={ArrowUpRight}
                    className="text-ink-faint transition-colors duration-(--duration-fast) group-hover:text-brand-600"
                  />
                </div>
                <p className="mt-6 text-label text-ink">{title}</p>
                <p className="mt-1 text-caption text-ink-faint">{body}</p>
              </a>
            </HoverLift>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

export function FloatDemo() {
  return (
    <Stage
      label="Float"
      replay={false}
      tag="Loops while on screen"
      className="grid place-items-center py-10 sm:py-14"
    >
      <Float className="w-full max-w-md">
        <MiniWindow />
      </Float>
    </Stage>
  );
}

// --- Hooks ---------------------------------------------------------------------------------

export function InViewCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false });
  const [entries, setEntries] = useState({ count: 0, last: false });
  if (inView !== entries.last) {
    // Count rising edges during render (no effect needed for derived state).
    setEntries({ count: entries.count + (inView ? 1 : 0), last: inView });
  }
  return (
    <div ref={ref} className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1 text-label text-ink ring-1 ring-line">
        <span
          className={cn("size-2 rounded-full", inView ? "bg-brand-600" : "bg-neutral-300")}
          aria-hidden
        />
        {inView ? "In view" : "Out of view"}
      </span>
      <span className="text-caption text-ink-faint">
        Entered {entries.count} {entries.count === 1 ? "time" : "times"}; scroll away and back.
      </span>
    </div>
  );
}

// --- On scroll -----------------------------------------------------------------------------

export function ScrollShowcase() {
  return (
    <div className="space-y-24 sm:space-y-32" data-demo="scroll">
      <Reveal className="mx-auto max-w-(--container-prose) text-center" data-demo-item="reveal">
        <p className="text-overline uppercase text-brand-700">Reveal</p>
        <p className="mt-3 font-display text-h2 text-ink">
          Sections arrive once, as you reach them
        </p>
        <p className="mt-4 text-body text-ink-muted">
          This block was below the fold when the page loaded, so it waited in its pre-state and
          animated when it entered the viewport. Scroll back up and down: it does not repeat.
        </p>
      </Reveal>
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <SlideReveal direction="right" data-demo-item="slide">
          <p className="text-overline uppercase text-brand-700">SlideReveal</p>
          <p className="mt-3 font-display text-h3 text-ink">Copy beside a visual</p>
          <p className="mt-3 text-body text-ink-muted">
            Directional entrances suit two-column compositions: the copy and the product window
            travel towards each other and settle on the grid.
          </p>
        </SlideReveal>
        <SlideReveal direction="left" delay={80}>
          <MiniWindow />
        </SlideReveal>
      </div>
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-demo-item="stagger">
        {PRODUCTS.slice(0, 4).map(([glyph, title]) => (
          <DemoCard key={glyph} glyph={glyph} title={title} />
        ))}
      </Stagger>
    </div>
  );
}
