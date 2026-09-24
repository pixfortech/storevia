// Storevia charts (docs/design/design-plan.md §4): pure SVG and React, no
// chart library.
//
// - chart-core.ts: scales, nice ticks, paths, formatting, table and summary
//   models (pure; unit-tested).
// - chart-parts.tsx: keys, legend, tooltip and narrow readout, table twin
//   (on SURFACES' Table), empty and loading frames, Sparkline and
//   ChartHeadline (Metric's delta treatment). Server-safe, no hooks.
// - chart-plots.tsx: LineChart, AreaChart, BarChart and DonutChart
//   (client: measuring, hover, keyboard). The first-view reveal is MOTION's
//   ChartReveal, so charts follow the one motion policy.
// - chart-card.tsx: ChartCard on SURFACES' card parts, with the "View as
//   table" toggle (client).
// - charts.css: hover transitions, the loading shimmer and forced-colours
//   dashes (.sv-chart-*).
//
// Colour: categorical slots in a fixed order: chart-1 (primary, blue),
// chart-2 (comparison, violet), history (grey: chart-muted fills, dashed
// chart-history lines); chart-3 is a third slot for part-to-whole only.
// Validated with the dataviz palette checks; see the design-system charts
// page.
//
// Formats are Intl options so charts can be rendered from server components;
// function formats work only from client components.
export {
  CHART_LINE_TONES,
  CHART_PART_TONES,
  type ChartCurve,
  type ChartDatum,
  type ChartPart,
  type ChartSeries,
  type ChartTone,
  type ChartValueFormat,
  type ChartX,
  type ChartXFormat,
} from "./chart-core";
export {
  ChartEmpty,
  ChartHeadline,
  ChartKey,
  ChartLegend,
  ChartSkeleton,
  ChartTable,
  ChartTooltip,
  Sparkline,
  type ChartEmptyProps,
  type ChartHeadlineProps,
  type ChartKeyShape,
  type ChartLegendItem,
  type ChartLegendProps,
  type ChartTableProps,
  type ChartTooltipProps,
  type ChartTooltipRow,
  type SparklineProps,
} from "./chart-parts";
export {
  AreaChart,
  BarChart,
  DonutChart,
  LineChart,
  type AreaChartProps,
  type BarChartProps,
  type ChartProps,
  type DonutChartProps,
  type LineChartProps,
} from "./chart-plots";
export { ChartCard, type ChartCardProps, type ChartStatus } from "./chart-card";
export type { ChartView } from "./chart-context";
