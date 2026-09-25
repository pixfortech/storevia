// Charts: pure geometry and data shaping (chart-core.ts), and server
// rendering of every chart component (no window, final state, accessible).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  chartArcPath,
  chartAreaPath,
  chartAxisFormatter,
  chartBarPath,
  chartEnglishDateFormatter,
  chartExtent,
  chartFoldOther,
  chartLinePath,
  chartLinearScale,
  chartNearestIndex,
  chartNiceStep,
  chartNiceTicks,
  chartNumberFormatter,
  chartSeriesTones,
  chartShortLabels,
  chartSummary,
  chartTableModel,
  chartTickIndices,
  chartTrend,
  chartXFormatter,
  type ChartSeries,
} from "./chart-core";
import {
  AreaChart,
  BarChart,
  ChartCard,
  ChartEmpty,
  ChartHeadline,
  ChartKey,
  ChartLegend,
  ChartTable,
  ChartTooltip,
  DonutChart,
  LineChart,
  Sparkline,
} from "./charts";

const day = (d: number) => new Date(Date.UTC(2026, 8, d));
// The previous period: the four days a month earlier, drawn under the current ones.
const REVENUE: ChartSeries[] = [
  {
    id: "revenue",
    label: "Revenue",
    data: [
      { x: day(1), y: 1200 },
      { x: day(2), y: 1850 },
      { x: day(3), y: null },
      { x: day(4), y: 2210 },
    ],
  },
  {
    id: "previous",
    label: "Previous period",
    tone: "muted",
    data: [
      { x: new Date(Date.UTC(2026, 7, 1)), y: 1100 },
      { x: new Date(Date.UTC(2026, 7, 2)), y: 1300 },
      { x: new Date(Date.UTC(2026, 7, 3)), y: 1500 },
      { x: new Date(Date.UTC(2026, 7, 4)), y: 1700 },
    ],
  },
];
const USD: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
};

describe("scales and ticks", () => {
  it("maps a domain onto a range, including inverted ranges", () => {
    const y = chartLinearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
    expect(chartLinearScale([5, 5], [10, 20])(5)).toBe(10);
  });

  it("picks 1, 2, 2.5 and 5 steps", () => {
    expect(chartNiceStep(0.8)).toBe(1);
    expect(chartNiceStep(1.6)).toBe(2);
    expect(chartNiceStep(2.2)).toBe(2.5);
    expect(chartNiceStep(411)).toBe(500);
    expect(chartNiceStep(6200)).toBe(10000);
    expect(chartNiceStep(2.2, true)).toBe(5);
    expect(chartNiceStep(0.3, true)).toBe(1);
  });

  it.each([
    [0, 2200, 4],
    [0, 2200, 3],
    [0, 59, 3],
    [0, 13460, 4],
    [-340, 1200, 4],
    [1500, 2200, 4],
    [0, 0.37, 4],
    [0, 8420, 4],
  ])("covers [%d, %d] with 3–5 round ticks (target %d)", (min, max, target) => {
    const ticks = chartNiceTicks(min, max, target);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0]).toBeLessThanOrEqual(min);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    const steps = ticks.slice(1).map((t, i) => t - (ticks[i] ?? 0));
    for (const step of steps) expect(step).toBeCloseTo(steps[0] ?? 0, 9);
  });

  it("prefers the tick count that wastes the least headroom", () => {
    expect(chartNiceTicks(0, 2200, 3)).toEqual([0, 1000, 2000, 3000]);
    expect(chartNiceTicks(0, 1234, 4)).toEqual([0, 500, 1000, 1500]);
    expect(chartNiceTicks(0, 59, 3, { integer: true })).toEqual([0, 20, 40, 60]);
  });

  it("keeps whole-number data on whole-number ticks and handles flat data", () => {
    expect(chartNiceTicks(0, 3, 4, { integer: true }).every(Number.isInteger)).toBe(true);
    expect(chartNiceTicks(0, 0, 4, { integer: true })).toEqual([0, 2, 4]);
    expect(chartNiceTicks(0, 0, 4)).toEqual([0, 0.5, 1]);
    expect(chartNiceTicks(12, 12, 4)[0]).toBe(0);
  });

  it("includes zero in the extent and skips gaps", () => {
    expect(chartExtent(REVENUE)).toEqual([0, 2210]);
    expect(chartExtent(REVENUE, false)).toEqual([1100, 2210]);
    expect(chartExtent([])).toEqual([0, 0]);
  });

  it("thins x labels from the latest point with an even stride", () => {
    expect(chartTickIndices(5, 10)).toEqual([0, 1, 2, 3, 4]);
    expect(chartTickIndices(30, 6)).toEqual([4, 10, 16, 22, 28].map((i) => i + 1));
    expect(chartTickIndices(30, 1)).toEqual([29]);
    expect(chartTickIndices(0, 4)).toEqual([]);
    const indices = chartTickIndices(90, 5);
    expect(indices.length).toBeLessThanOrEqual(5);
    expect(indices.at(-1)).toBe(89);
  });

  it("finds the nearest position", () => {
    expect(chartNearestIndex(48, [0, 40, 80])).toBe(1);
    expect(chartNearestIndex(75, [0, 40, 80])).toBe(2);
    expect(chartNearestIndex(1, [])).toBe(-1);
  });

  it("shortens weekday and month categories to initials, and nothing else", () => {
    expect(chartShortLabels(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).toEqual([
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
      "S",
    ]);
    expect(chartShortLabels(["January", "Feb", "Mar.", "Sept"])).toEqual(["J", "F", "M", "S"]);
    // Look-alikes and mixed sets keep their full labels.
    expect(chartShortLabels(["Satisfaction", "Monitoring"])).toBeNull();
    expect(chartShortLabels(["Mon", "Linen overshirt"])).toBeNull();
    expect(chartShortLabels([])).toBeNull();
  });
});

describe("paths", () => {
  it("breaks lines at gaps", () => {
    const d = chartLinePath([
      { x: 0, y: 10 },
      { x: 10, y: 20 },
      null,
      { x: 30, y: 5 },
      { x: 40, y: 0 },
    ]);
    expect(d).toBe("M0,10 L10,20 M30,5 L40,0");
  });

  it("closes each area run down to the baseline", () => {
    const d = chartAreaPath([{ x: 0, y: 10 }, { x: 10, y: 20 }, null, { x: 30, y: 5 }], 100);
    expect(d).toBe("M0,10 L10,20 L10,100 L0,100 Z");
  });

  it("keeps monotone curves inside the data (no invented peaks)", () => {
    const points = [
      { x: 0, y: 50 },
      { x: 10, y: 40 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
      { x: 40, y: 0 },
    ];
    const d = chartLinePath(points, "monotone");
    expect(d.startsWith("M0,50 C")).toBe(true);
    const ys = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });

  it("rounds only the data end of a bar", () => {
    // Up from a baseline at y=100 to y=40: square base, 4 px arcs at the top.
    expect(chartBarPath(10, 20, 100, 40)).toBe(
      "M10,100 V44 A4,4 0 0 1 14,40 H26 A4,4 0 0 1 30,44 V100 Z",
    );
    // Negative values grow down with the rounded end at the bottom.
    expect(chartBarPath(10, 20, 100, 160)).toBe(
      "M10,100 V156 A4,4 0 0 0 14,160 H26 A4,4 0 0 0 30,156 V100 Z",
    );
    // Short bars shrink the radius; zero draws nothing.
    expect(chartBarPath(0, 20, 100, 98)).toContain("A2,2");
    expect(chartBarPath(0, 20, 100, 100)).toBe("");
  });

  it("draws ring segments and splits a full turn", () => {
    const quarter = chartArcPath(50, 50, 50, 40, 0, Math.PI / 2);
    expect(quarter.startsWith("M50,0 A50,50 0 0 1 100,50 L90,50 A40,40 0 0 0 50,10")).toBe(true);
    const full = chartArcPath(50, 50, 50, 40, 0, Math.PI * 2);
    expect(full.match(/M/g)).toHaveLength(2);
    expect(chartArcPath(50, 50, 50, 40, 1, 1)).toBe("");
  });
});

describe("colour slots", () => {
  it("assigns the fixed order and honours pinned tones", () => {
    expect(chartSeriesTones([{}, {}, {}])).toEqual(["primary", "comparison", "muted"]);
    expect(chartSeriesTones([{ tone: "muted" }, {}])).toEqual(["muted", "comparison"]);
  });

  it("folds the tail into Other, keeping order so colour follows the entity", () => {
    const parts = chartFoldOther(
      [
        { id: "email", label: "Email", value: 960 },
        { id: "direct", label: "Direct", value: 5240 },
        { id: "referral", label: "Referral", value: 470 },
        { id: "search", label: "Search", value: 3910 },
        { id: "social", label: "Social", value: 1880 },
      ],
      4,
    );
    expect(parts.map((p) => p.id)).toEqual(["direct", "search", "social", "other"]);
    expect(parts.map((p) => p.tone)).toEqual(["primary", "comparison", "tertiary", "muted"]);
    expect(parts[3]).toMatchObject({ label: "Other", value: 1430, other: true });
    expect(parts.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1, 9);
  });

  it("never exceeds three colours and drops non-positive values", () => {
    const four = chartFoldOther(
      [
        { id: "a", label: "A", value: 4 },
        { id: "b", label: "B", value: 3 },
        { id: "c", label: "C", value: 2 },
        { id: "d", label: "D", value: 1 },
        { id: "neg", label: "Refunds", value: -2 },
      ],
      9,
    );
    expect(four.map((p) => [p.id, p.tone])).toEqual([
      ["a", "primary"],
      ["b", "comparison"],
      ["c", "tertiary"],
      ["d", "muted"],
    ]);
    expect(chartFoldOther([{ id: "a", label: "A", value: 0 }])).toEqual([]);
  });
});

describe("formatting and models", () => {
  it("formats axes compactly from five digits", () => {
    expect(chartAxisFormatter(USD, "en-US", 15000)(15000)).toBe("$15K");
    expect(chartAxisFormatter(USD, "en-US", 3000)(2500)).toBe("$2,500");
    expect(chartAxisFormatter({ style: "currency", currency: "USD" }, "en-US", 3000)(500)).toBe(
      "$500",
    );
    expect(chartAxisFormatter(undefined, "en-US", 1)(0.5)).toBe("0.5");
  });

  it("formats dates in UTC and passes strings through", () => {
    const format = chartXFormatter(undefined, "en-US");
    expect(format(new Date(Date.UTC(2026, 8, 24, 23, 30)))).toBe("Sep 24");
    expect(format("Mon")).toBe("Mon");
    expect(format(1200)).toBe("1,200");
    expect(chartXFormatter((x) => `#${String(x)}`)("a")).toBe("#a");
  });

  it("formats English dates without Intl, so server and browser text match", () => {
    const friday = new Date(Date.UTC(2026, 8, 25, 23, 30));
    const tooltip = { weekday: "short", month: "short", day: "numeric" } as const;
    const detail = { month: "short", day: "numeric", year: "numeric" } as const;
    // The same text as Intl's en-US output, which the other tests rely on.
    expect(chartXFormatter(tooltip, "en-US")(friday)).toBe("Fri, Sep 25");
    expect(chartXFormatter(detail, "en-US")(friday)).toBe("Sep 25, 2026");
    // Day-first English locales: one fixed spelling, whatever the ICU data.
    expect(chartXFormatter(tooltip, "en-GB")(friday)).toBe("Fri 25 Sep");
    expect(chartXFormatter(undefined, "en-IN")(friday)).toBe("25 Sep");
    expect(chartXFormatter(detail, "en-Latn-AU")(friday)).toBe("25 Sep 2026");
    expect(chartXFormatter(undefined, "en")(friday)).toBe("Sep 25");
    // Other languages and other options still use Intl.
    expect(chartEnglishDateFormatter("fr-FR", detail)).toBeNull();
    expect(chartEnglishDateFormatter("en-GB", { month: "long", day: "numeric" })).toBeNull();
    expect(chartEnglishDateFormatter("en-GB", { ...detail, timeZone: "Asia/Kolkata" })).toBeNull();
  });

  it("maps series to a table twin, with the comparison's dates in one caption note", () => {
    const model = chartTableModel(REVENUE, {
      formatValue: chartNumberFormatter(USD),
      formatX: chartXFormatter(undefined),
    });
    expect(model.columns).toEqual(["Date", "Revenue", "Previous period"]);
    expect(model.rows).toHaveLength(4);
    expect(model.rows[0]).toMatchObject({ header: "Sep 1", cells: ["$1,200", "$1,100"] });
    expect(model.rows[2]?.cells).toEqual(["—", "$1,500"]);
    expect(model.rows[3]?.cells).toEqual(["$2,210", "$1,700"]);
    // Rows are the current period's dates; the previous period is named once.
    expect(model.notes).toEqual(["Previous period: Aug 1 – Aug 4, matched row by row."]);
    // Series that share the rows' x values need no note.
    const same = chartTableModel(REVENUE.slice(0, 1), {
      formatValue: chartNumberFormatter(USD),
      formatX: chartXFormatter(undefined),
      xHeader: "Day",
    });
    expect(same.columns[0]).toBe("Day");
    expect(same.notes).toEqual([]);
  });

  it("summarises a chart for its accessible name", () => {
    const summary = chartSummary("Line chart", REVENUE, {
      formatValue: chartNumberFormatter(USD),
      formatX: chartXFormatter(undefined),
      label: "Revenue",
    });
    expect(summary).toBe(
      "Revenue. Line chart, 4 points from Sep 1 to Sep 4. Revenue: $1,200 to $2,210, peak $2,210 (Sep 4); Previous period: $1,100 to $1,700, peak $1,700 (Aug 4).",
    );
    expect(chartSummary("Bar chart", [], { formatValue: String, formatX: String })).toBe(
      "Bar chart, no data.",
    );
  });

  it("describes a trend", () => {
    expect(chartTrend([10, null, 12])).toEqual({
      first: 10,
      last: 12,
      change: 0.2,
      direction: "up",
    });
    expect(chartTrend([0, 5]).change).toBeNull();
    expect(chartTrend([]).direction).toBe("flat");
  });
});

// Anything that would hide data in server HTML: a motion pre-state
// (data-sv-motion is only ever set on the client) or hidden styles.
const HIDDEN = /data-sv-motion=|data-revealed="false"|opacity:\s*0|visibility:\s*hidden/;

/** Visible text: markup stripped, sr-only spans included. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("server markup", () => {
  it("renders charts without a window, in their final state", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToStaticMarkup(
      <>
        <LineChart label="Revenue" series={REVENUE} valueFormat={USD} />
        <AreaChart series={REVENUE.slice(0, 1)} />
        <BarChart series={REVENUE} />
        <BarChart orientation="horizontal" series={REVENUE} valueFormat={USD} />
        <DonutChart
          label="Channels"
          data={[
            { id: "a", label: "Direct", value: 3 },
            { id: "b", label: "Search", value: 1 },
          ]}
        />
      </>,
    );
    expect(html).not.toMatch(HIDDEN);
    expect(html).toContain("Revenue. Line chart, 4 points");
    expect(html).toContain('viewBox="0 0 640 240"');
    // 2 px lines, dashed history, a 10% wash for the single area series.
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('stroke-dasharray="4 4"');
    expect(html).toContain('fill-opacity="0.1"');
    // Legend for two series; values and labels in ink, never in series colour.
    expect(html).toContain("Previous period");
    expect(html).not.toMatch(/text-chart-/);
    // Horizontal bars write their labels and values out.
    expect(html).toContain("$2,210");
    expect(html).toContain("Donut chart, total 4");
  });

  it("reveals through MOTION's ChartReveal contract", () => {
    const html = renderToStaticMarkup(
      <>
        <LineChart series={REVENUE} />
        <BarChart series={REVENUE} />
        <BarChart orientation="horizontal" series={REVENUE} />
        <DonutChart data={[{ id: "a", label: "A", value: 1 }]} />
        <LineChart series={REVENUE} reveal={false} />
      </>,
    );
    // Five charts, four of them revealed: final state in server HTML.
    expect(html.match(/class="[^"]*\bsv-motion-chart\b/g)).toHaveLength(4);
    expect(html.match(/data-revealed="true"/g)).toHaveLength(4);
    expect(html).toContain('<g class="sv-motion-wipe">');
    expect(html).toMatch(
      /class="sv-chart-bar sv-motion-grow fill-chart-1" style="--sv-motion-i:0"/,
    );
    expect(html).toContain("sv-motion-grow-x");
    expect(html).toContain("sv-motion-fade");
    // No private reveal system any more.
    expect(html).not.toMatch(/sv-chart-reveal|sv-chart-marks/);
  });

  it("makes plots keyboard charts that screen readers hand the arrow keys to", () => {
    const html = renderToStaticMarkup(
      <>
        <LineChart label="Revenue" series={REVENUE} />
        <DonutChart label="Channels" data={[{ id: "a", label: "A", value: 1 }]} />
      </>,
    );
    expect(html).not.toContain('role="img"');
    expect(html.match(/role="application" aria-roledescription="chart"/g)).toHaveLength(2);
    expect(html).toContain("Use the left and right arrow keys to read each value.");
    expect(html).toContain('aria-live="polite"');
  });

  it("pins a readout above narrow plots, showing the latest values", () => {
    const html = renderToStaticMarkup(
      <LineChart
        series={REVENUE}
        valueFormat={USD}
        tooltipXFormat={{ month: "short", day: "numeric" }}
      />,
    );
    // The container query picks legend (wide) or readout (narrow) in CSS, so
    // server HTML carries both and nothing shifts after hydration.
    expect(html).toContain("@container/chart");
    expect(html).toContain("hidden @min-[30rem]/chart:flex");
    expect(html).toContain("@min-[30rem]/chart:hidden");
    expect(text(html)).toContain("Latest · Sep 4 Revenue $2,210 Previous period $1,700 Aug 4");
  });

  it("strokes history lines darker than history fills, and draws keys in SVG", () => {
    const html = renderToStaticMarkup(
      <>
        <LineChart series={REVENUE} />
        <ChartLegend
          items={[
            { id: "a", label: "Revenue", tone: "primary" },
            { id: "b", label: "Stores", tone: "comparison" },
            { id: "c", label: "Other", tone: "muted", shape: "rect" },
          ]}
        />
      </>,
    );
    expect(html).toContain("stroke-chart-history");
    expect(html).toContain("fill-chart-muted");
    // Keys are SVG (forced colours drop background colours, not SVG paint)
    // and the comparison line gets its own forced-colours dash.
    expect(html).not.toMatch(/<span[^>]*class="[^"]*bg-chart-/);
    expect(html).toContain("forced-color-adjust-none");
    expect(html).toContain("sv-chart-dash-comparison");
    const key = renderToStaticMarkup(<ChartKey tone="primary" shape="rect" />);
    expect(key).toMatch(/^<svg aria-hidden="true" viewBox="0 0 8 8"/);
  });

  it("renders the sparkline as an image, or hides it where a figure speaks", () => {
    const labelled = renderToStaticMarkup(
      <Sparkline
        label="Orders"
        data={[10, 12, null, 15]}
        valueFormat={{ maximumFractionDigits: 0 }}
      />,
    );
    expect(labelled).toContain('role="img" aria-label="Orders: up 50%, from 10 to 15"');
    expect(labelled).toContain('vector-effect="non-scaling-stroke"');
    expect(labelled).toContain("left:100%");

    const summary = renderToStaticMarkup(
      <Sparkline label="Orders" summary="Orders rose all month" data={[1, 2]} />,
    );
    expect(summary).toContain('aria-label="Orders rose all month"');

    // Decorative by default without a label, or when asked (a KPI tile).
    for (const html of [
      renderToStaticMarkup(<Sparkline data={[1, 2]} />),
      renderToStaticMarkup(<Sparkline decorative label="Orders" data={[1, 2]} />),
    ]) {
      expect(html).toMatch(/^<div aria-hidden="true"/);
      expect(html).not.toContain('role="img"');
      expect(html).not.toContain("aria-label");
    }
  });

  it("speaks the headline delta with its direction and whether it is good news", () => {
    const up = renderToStaticMarkup(
      <ChartHeadline value="$48,210" delta={{ value: 8.2 }} comparison="vs previous period" />,
    );
    expect(text(up)).toBe(
      "$48,210 +8.2% Up 8.2% vs previous period, an improvement vs previous period",
    );
    expect(up).toContain("bg-success-50 text-success-700");

    const refunds = renderToStaticMarkup(
      <ChartHeadline
        value="1.1%"
        delta={{ value: -0.2, label: "0.2 pts" }}
        lowerIsBetter
        comparison="vs previous 30 days"
      />,
    );
    // A signed, visible "−0.2 pts"; spoken as a fall that is good news.
    expect(text(refunds)).toContain("−0.2 pts Down 0.2 pts vs previous 30 days, an improvement");

    const conversion = renderToStaticMarkup(
      <ChartHeadline value="2.9%" delta={{ value: -0.3, label: "0.3 pts" }} />,
    );
    expect(text(conversion)).toContain("−0.3 pts Down 0.3 pts, a decline");
    expect(conversion).toContain("bg-danger-50 text-danger-700");
  });

  it("renders every ChartCard status honestly", () => {
    const chart = <LineChart series={REVENUE} />;
    const ready = renderToStaticMarkup(<ChartCard title="Revenue">{chart}</ChartCard>);
    expect(ready).toContain("View as table");
    expect(ready).not.toContain("Example data");
    // SURFACES' card: a hairline, the card title type, no shadow by default.
    expect(ready).toContain("rounded-card");
    expect(ready).toContain("font-display");
    expect(ready).not.toContain("shadow-card");

    const example = renderToStaticMarkup(
      <ChartCard title="Revenue" status="example">
        {chart}
      </ChartCard>,
    );
    // The shared ExampleDataBadge: neutral with a dot, status colours stay for status.
    expect(example).toMatch(
      /<span class="[^"]*rounded-pill[^"]*ring-line-strong[^"]*" data-example-data="">.*?Example data<\/span>/,
    );
    expect(example).not.toMatch(/warning/);

    const empty = renderToStaticMarkup(
      <ChartCard title="Revenue" status="empty" metric="$1">
        {chart}
      </ChartCard>,
    );
    expect(empty).toContain("Not collecting yet");
    expect(empty).not.toContain('<svg aria-hidden="true" width="100%"');
    expect(empty).not.toContain("$1");
    expect(empty).not.toContain("View as table");

    const loading = renderToStaticMarkup(<ChartCard title="Revenue" status="loading" />);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading chart");
  });

  it("switches charts to their table twin inside a card", () => {
    const html = renderToStaticMarkup(
      <ChartCard title="Revenue" defaultView="table">
        <LineChart series={REVENUE} valueFormat={USD} label="Revenue" />
      </ChartCard>,
    );
    expect(html).toContain("<table");
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('<th scope="row"');
    expect(html).toContain("Sep 1, 2026");
    // The comparison's dates: once, in the caption and the note under the table.
    expect(html).toContain("Previous period: Aug 1, 2026 – Aug 4, 2026, matched row by row.");
    expect(html).not.toContain("Aug 2, 2026");
    // The toggle names the view it switches to, without a contradicting aria-pressed.
    expect(html).toContain("View as chart");
    expect(html).not.toContain("aria-pressed");
  });

  it("renders the parts", () => {
    const html = renderToStaticMarkup(
      <>
        <ChartLegend items={[{ id: "a", label: "Revenue", tone: "primary" }]} />
        <ChartTooltip
          title="Sep 1"
          rows={[{ id: "a", label: "Revenue", value: "$1", tone: "primary" }]}
        />
        <ChartTable series={REVENUE.slice(0, 1)} caption="Revenue" />
        <ChartEmpty description="Appears after the first order." />
      </>,
    );
    expect(html).toContain("stroke-chart-1");
    expect(html).toContain("rounded-card border border-line bg-surface");
    // The design system's Table: sticky white header, dense hairline rows.
    expect(html).toContain('data-dense=""');
    expect(html).toContain('data-sticky=""');
    expect(html).toContain('<caption class="sr-only">Revenue</caption>');
    expect(html).toContain("Not collecting yet");
    expect(html).toContain("Appears after the first order.");
  });
});
