import {
  AreaChart,
  Badge,
  BarChart,
  Card,
  ChartCard,
  ChartHeadline,
  ChartKey,
  ChartLegend,
  ChartTable,
  ChartTooltip,
  DonutChart,
  KpiCard,
  LineChart,
  Sparkline,
  buttonClasses,
  cn,
  type ChartTone,
} from "@storevia/ui";
import type { ReactNode } from "react";
import { RevenueCard } from "./demos";
import {
  EXAMPLE_CHANNELS,
  EXAMPLE_KPIS,
  EXAMPLE_ORDERS,
  EXAMPLE_ORDERS_PREVIOUS,
  EXAMPLE_SESSIONS,
  EXAMPLE_TOP_PRODUCTS,
  EXAMPLE_WEEK_COMPARISON,
  examplePercentChange,
  exampleRevenue,
  exampleTotal,
} from "./example-data";

export const metadata = { title: "Charts · Design system" };

const USD: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
};
const COUNT: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
const usd = new Intl.NumberFormat("en-US", USD);
const count = new Intl.NumberFormat("en-US", COUNT);

const CONTENTS = [
  ["colour", "Colour"],
  ["line", "Line"],
  ["area", "Area"],
  ["bar", "Bar"],
  ["donut", "Donut"],
  ["sparkline", "Sparkline"],
  ["card", "Chart card"],
  ["parts", "Parts"],
] as const;

const PRINCIPLES = [
  [
    "Colour follows the entity",
    "Blue for the subject, violet for a comparison, grey for history, always in that order. A filter never repaints a series.",
  ],
  [
    "One axis, thin marks",
    "Never a second y axis. 2 px lines, bars no wider than 24 px, hairline grids: the data is the only loud thing.",
  ],
  [
    "Never colour alone",
    "A legend for two or more series, dashes for history, a keyboard readout and a table twin for every chart.",
  ],
  [
    "Honest states",
    "Real data, “Not collecting yet”, loading, or badged example data. Never a placeholder line.",
  ],
] as const;

const PALETTE: {
  tone: ChartTone;
  role: string;
  shape: "line" | "dashed" | "rect";
  tokens: readonly string[];
}[] = [
  { tone: "primary", role: "Primary series", shape: "line", tokens: ["chart-1 · #3355FF"] },
  { tone: "comparison", role: "Comparison", shape: "line", tokens: ["chart-2 · #A07CFF"] },
  {
    tone: "muted",
    role: "History, Other",
    shape: "dashed",
    tokens: ["Fills: chart-muted · #C4CAD6", "Lines: chart-history · #9AA2B3, dashed"],
  },
  {
    tone: "tertiary",
    role: "Part-to-whole third",
    shape: "rect",
    tokens: ["chart-3 · #4F35A8"],
  },
];

const CHECKS = [
  [
    "Lines and bars",
    "chart-1 · chart-2",
    "Pass",
    "CVD ΔE 9.4 (target 8) · normal-vision ΔE 18.0 (floor 15) · contrast ≥ 3:1",
  ],
  [
    "Part-to-whole",
    "chart-1 · chart-2 · chart-3, all pairs",
    "Pass",
    "CVD ΔE 9.4 · normal-vision ΔE 15.5 · contrast ≥ 3:1",
  ],
  [
    "History",
    "chart-muted fills · chart-history lines",
    "Grey by design",
    "Below the chroma floor, so never an identity hue. Contrast 1.64:1 (fills) and 2.56:1 (lines): always dashed, named in the legend and in the table view.",
  ],
] as const;

function Section({
  id,
  index,
  title,
  description,
  children,
}: {
  id: string;
  index: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
        <div>
          <p className="text-caption tabular-nums text-ink-faint">{index}</p>
          <h2 className="mt-2 font-display text-h2 text-ink">{title}</h2>
        </div>
        {description ? (
          <div className="max-w-(--container-prose) text-body text-ink-muted lg:pt-7">
            {description}
          </div>
        ) : null}
      </div>
      <div className="mt-10 sm:mt-12">{children}</div>
    </section>
  );
}

function Specimen({
  name,
  api,
  description,
  children,
}: {
  name: string;
  api: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
      <div className="lg:pt-1">
        <h3 className="font-display text-h4 text-ink">{name}</h3>
        <p className="mt-2 text-body-sm text-ink-muted">{description}</p>
        <p className="mt-4 font-mono text-caption leading-relaxed break-words text-ink-faint">
          {api}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-line bg-surface p-5 sm:p-6", className)}>
      {children}
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

function StateLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-mono text-caption text-ink-faint">{children}</p>;
}

export default function ChartsPage() {
  const revenue30 = exampleRevenue("30d");
  const revenue = exampleTotal(revenue30[0]);
  const revenuePrevious = exampleTotal(revenue30[1]);
  const orders = exampleTotal(EXAMPLE_ORDERS[0]);
  const ordersPrevious = exampleTotal(EXAMPLE_ORDERS_PREVIOUS);
  const sessions = EXAMPLE_SESSIONS[0]?.data ?? [];
  const sessionsLatest = sessions[sessions.length - 1]?.y ?? 0;
  const sessionsBefore = sessions[sessions.length - 2]?.y ?? 0;
  return (
    <div className="pb-8">
      <header className="max-w-(--container-prose)">
        <p className="text-overline uppercase text-brand-700">Data</p>
        <h1 className="mt-3 font-display text-h1 text-ink">Charts</h1>
        <p className="mt-5 text-body-lg text-ink-muted">
          One quiet chart language for the dashboard and the admin: thin marks on hairline grids,
          blue for the subject, violet for a comparison, grey for history. Pure SVG and React from{" "}
          <Code>@storevia/ui</Code>, with no chart library.
        </p>
        <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm text-ink-muted">
          <Badge variant="dot">Example data</Badge>
          Every figure on this page is generated for illustration.
        </p>
      </header>

      <nav aria-label="On this page" className="mt-10 mb-4">
        <ul className="flex flex-wrap gap-2">
          {CONTENTS.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex h-8 items-center rounded-pill border border-line bg-surface px-3 text-label text-ink-muted transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-ink"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ol className="mt-10 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map(([title, body], index) => (
          <li key={title} className="bg-surface p-6">
            <p className="text-caption tabular-nums text-brand-700">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-3 font-display text-h4 text-ink">{title}</p>
            <p className="mt-2 text-body-sm text-ink-muted">{body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-16" />

      <Section
        id="colour"
        index="01"
        title="Colour"
        description={
          <p>
            Slots are assigned in a fixed order and follow the entity, never its rank, so a filter
            never repaints a series. There is no fourth hue: extra parts fold into
            &ldquo;Other&rdquo;. Text stays in ink colours; the coloured key beside it carries
            identity. Status colours are never series.
          </p>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {PALETTE.map((slot) => (
            <div key={slot.role} className="rounded-card border border-line bg-surface p-3 sm:p-4">
              <div className={cn("h-12 rounded-sm sm:h-14", SWATCH[slot.tone])} />
              <div className="mt-3 flex items-center gap-2">
                <ChartKey tone={slot.tone} shape={slot.shape} />
                <p className="text-label text-ink">{slot.role}</p>
              </div>
              {slot.tokens.map((token) => (
                <p key={token} className="mt-1 font-mono text-caption text-ink-faint">
                  {token}
                </p>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-10 overflow-hidden rounded-card border border-line">
          <table className="w-full text-left text-body-sm">
            <caption className="border-b border-line bg-surface-sunken px-4 py-3 text-left text-label text-ink">
              Palette validator (light surface #FFFFFF)
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Use</th>
                <th scope="col">Slots</th>
                <th scope="col">Result</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CHECKS.map(([use, slots, result, detail]) => (
                <tr key={use} className="grid gap-1 px-4 py-3 md:table-row md:p-0">
                  <th scope="row" className="font-medium text-ink md:px-4 md:py-3">
                    {use}
                  </th>
                  <td className="text-ink-muted md:px-4 md:py-3">{slots}</td>
                  <td className="md:px-4 md:py-3">
                    <Badge size="sm" tone={result === "Pass" ? "success" : "neutral"}>
                      {result}
                    </Badge>
                  </td>
                  <td className="text-caption text-ink-faint md:px-4 md:py-3">{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="line"
        index="02"
        title="Line"
        description={
          <p>
            For trends over time. 2 px lines with round joins, one y axis with three to five round
            ticks, and x labels thinned to what fits. Hover, tap or focus the plot and use the arrow
            keys: a crosshair and one tooltip list every series at that day. Under 480 px the
            readout is pinned above the plot instead, showing the latest values until you tap.
          </p>
        }
      >
        <Specimen
          name="LineChart in a ChartCard"
          api="series · valueFormat (Intl options) · tone: primary | comparison | muted · curve · height"
          description={
            <>
              Revenue against the previous period, which is grey and dashed so it never relies on
              colour. The period filter sits above the card and re-scopes the headline, the chart
              and the table together.
            </>
          }
        >
          <RevenueCard />
        </Specimen>
        <Specimen
          name="Two comparable series"
          api="series[0] → chart-1 · series[1] → chart-2"
          description="When two series are equally the subject, the second takes violet. Both are solid; the legend names them."
        >
          <Stage>
            <LineChart
              label="Example: two stores' revenue"
              valueFormat={USD}
              height={220}
              series={[
                { id: "north", label: "North store", data: revenue30[0]?.data ?? [] },
                {
                  id: "south",
                  label: "South store",
                  data: (revenue30[1]?.data ?? []).map((d, i) => ({
                    x: revenue30[0]?.data[i]?.x ?? d.x,
                    y: d.y === null ? null : Math.round(d.y * 0.78),
                  })),
                },
              ]}
            />
          </Stage>
        </Specimen>
      </Section>

      <Section
        id="area"
        index="03"
        title="Area"
        description={
          <p>
            A single series with a flat 10% wash of its own colour: never a gradient, and never for
            comparisons (overlapping washes hide each other).
          </p>
        }
      >
        <Specimen
          name="AreaChart"
          api='series (one) · curve="monotone" · axisFormat'
          description="Weekly sessions over twelve weeks. Monotone smoothing never overshoots the data, so it invents no peaks."
        >
          <ChartCard
            title="Sessions"
            description="Weekly, last 12 weeks"
            status="example"
            metric={
              <ChartHeadline
                value={count.format(sessionsLatest)}
                delta={examplePercentChange(sessionsLatest, sessionsBefore)}
                comparison="vs previous week"
              />
            }
          >
            <AreaChart
              label="Weekly sessions"
              series={EXAMPLE_SESSIONS}
              valueFormat={COUNT}
              curve="monotone"
              xFormat={{ month: "short", day: "numeric" }}
            />
          </ChartCard>
        </Specimen>
      </Section>

      <Section
        id="bar"
        index="04"
        title="Bar"
        description={
          <p>
            Magnitude by day or category. Bars are at most 24 px wide with a 4 px rounded data end
            and a square baseline; the rest of each band is air. Grouped bars sit 2 px apart. The
            hovered band gets a quiet wash and its own tooltip. Category axes keep every label:
            weekdays and months shorten to initials rather than disappear.
          </p>
        }
      >
        <Specimen
          name="BarChart · daily"
          api='series · valueFormat · orientation="vertical"'
          description="Orders per day for two weeks. Whole-number data keeps whole-number ticks."
        >
          <ChartCard title="Orders" description="Per day, last 14 days" status="example">
            <BarChart
              label="Orders per day"
              series={EXAMPLE_ORDERS}
              valueFormat={COUNT}
              height={220}
            />
          </ChartCard>
        </Specimen>
        <Specimen
          name="BarChart · comparison"
          api='series[0].tone="muted" · series[1].tone="primary"'
          description="This week against last week, read left to right in time: history in grey, the current week in blue."
        >
          <ChartCard
            title="Orders by weekday"
            description="This week and last week"
            status="example"
          >
            <BarChart
              label="Orders by weekday, this week and last week"
              series={EXAMPLE_WEEK_COMPARISON}
              valueFormat={COUNT}
              height={220}
              xHeader="Weekday"
            />
          </ChartCard>
        </Specimen>
        <Specimen
          name="BarChart · horizontal ranking"
          api='orientation="horizontal" · series sorted by the caller'
          description="For rankings with long names. Labels and values are written out, so nothing depends on hovering; the previous period sits under each bar."
        >
          <ChartCard title="Top products" description="By revenue, last 30 days" status="example">
            <BarChart
              orientation="horizontal"
              label="Top products by revenue"
              series={EXAMPLE_TOP_PRODUCTS}
              valueFormat={USD}
              xHeader="Product"
            />
          </ChartCard>
        </Specimen>
      </Section>

      <Section
        id="donut"
        index="05"
        title="Donut"
        description={
          <p>
            Part-to-whole at a glance, used sparingly: three colours at most, then everything else
            folds into grey &ldquo;Other&rdquo;. Segments are split by 2 px surface gaps; the legend
            lists every value and share. Close values read better as bars.
          </p>
        }
      >
        <Specimen
          name="DonutChart"
          api="data: {id, label, value}[] · maxSegments (≤ 4) · centerLabel · otherLabel"
          description="Sessions by channel. Five channels in, three named segments plus Other out. Hover a segment or a legend row."
        >
          <ChartCard title="Sessions by channel" description="Last 30 days" status="example">
            <DonutChart
              label="Sessions by channel"
              data={EXAMPLE_CHANNELS}
              valueFormat={COUNT}
              centerLabel="Sessions"
              xHeader="Channel"
            />
          </ChartCard>
        </Specimen>
      </Section>

      <Section
        id="sparkline"
        index="06"
        title="Sparkline"
        description={
          <p>
            A trend line with no axes and a dot on the latest value. In a KPI tile it is{" "}
            <Code>decorative</Code>: the figure and its signed delta already say what changed, so a
            screen reader hears one change, not two. On its own, give it a <Code>label</Code>{" "}
            (announced with its first-to-last change) or a full <Code>summary</Code>.
          </p>
        }
      >
        <Specimen
          name="Sparkline in a KpiCard"
          api="Sparkline: data · decorative · label · summary · area · tone · height"
          description="Each tile's figure, signed delta and line come from the same example series, so they agree. A falling refund rate is good news, so its delta is green."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {EXAMPLE_KPIS.map((kpi) => (
              <KpiCard
                key={kpi.id}
                example
                label={kpi.label}
                value={kpi.value}
                delta={kpi.delta}
                lowerIsBetter={kpi.lowerIsBetter}
                comparison="vs previous 30 days"
                sparkline={<Sparkline decorative data={kpi.data} area={kpi.area} />}
              />
            ))}
          </div>
        </Specimen>
      </Section>

      <Section
        id="card"
        index="07"
        title="Chart card"
        description={
          <p>
            The frame every dashboard chart sits in, built from the same card parts as the KPI
            tiles: title, description, headline, card actions, the chart and a{" "}
            <Code>View as table</Code> toggle. Its status is honest: ready, empty (nothing collected
            yet, never a placeholder line), loading, or example (badged, development previews only).
            Filters such as the period belong in one row above the cards they scope, not inside each
            card.
          </p>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <StateLabel>status=&quot;ready&quot;</StateLabel>
            <ChartCard
              title="Orders"
              description="Per day, last 14 days"
              metric={
                <ChartHeadline
                  value={count.format(orders)}
                  delta={examplePercentChange(orders, ordersPrevious)}
                  comparison="vs previous 14 days"
                />
              }
              actions={
                <a href="#bar" className={buttonClasses("ghost", "sm", "-mr-2")}>
                  Details
                </a>
              }
              footer="Days in UTC"
            >
              <BarChart
                label="Orders per day"
                series={EXAMPLE_ORDERS}
                valueFormat={COUNT}
                height={200}
              />
            </ChartCard>
          </div>
          <div className="min-w-0">
            <StateLabel>status=&quot;example&quot;</StateLabel>
            <ChartCard
              title="Revenue"
              description="Last 30 days"
              status="example"
              metric={
                <ChartHeadline
                  value={usd.format(revenue)}
                  delta={examplePercentChange(revenue, revenuePrevious)}
                  comparison="vs previous period"
                />
              }
            >
              <AreaChart
                label="Revenue, last 30 days"
                series={revenue30.slice(0, 1)}
                valueFormat={USD}
                height={200}
              />
            </ChartCard>
          </div>
          <div className="min-w-0">
            <StateLabel>status=&quot;empty&quot;</StateLabel>
            <ChartCard
              title="Revenue"
              description="Last 30 days"
              status="empty"
              height={200}
              empty={{
                title: "Not collecting yet",
                description: "Revenue appears here once your store takes its first order.",
              }}
            />
          </div>
          <div className="min-w-0">
            <StateLabel>status=&quot;loading&quot;</StateLabel>
            <ChartCard title="Visitors" description="Last 30 days" status="loading" height={200} />
          </div>
        </div>
        <div className="mt-12">
          <StateLabel>defaultView=&quot;table&quot; · the table twin, open</StateLabel>
          <RevenueCard defaultPeriod="7d" defaultView="table" />
        </div>
      </Section>

      <Section
        id="parts"
        index="08"
        title="Parts"
        description={
          <p>
            The pieces charts are built from, available on their own for custom visuals. The tooltip
            leads with values; keys mirror the mark (a stroke for lines, dashes for history, a
            swatch for fills) and are drawn in SVG, so they survive forced-colours mode.
          </p>
        }
      >
        <Specimen
          name="ChartLegend"
          api='items: {id, label, tone, shape?, value?}[] · layout="inline" | "list"'
          description="Shown whenever a chart has two or more series."
        >
          <Stage className="space-y-6">
            <ChartLegend
              items={[
                { id: "a", label: "Revenue", tone: "primary" },
                { id: "b", label: "Comparison", tone: "comparison" },
                { id: "c", label: "Previous period", tone: "muted", shape: "dashed" },
              ]}
            />
            <ChartLegend
              layout="list"
              className="max-w-sm"
              items={[
                { id: "a", label: "Direct", tone: "primary", shape: "rect", value: "5,240" },
                {
                  id: "b",
                  label: "Organic search",
                  tone: "comparison",
                  shape: "rect",
                  value: "3,910",
                },
                { id: "c", label: "Social", tone: "tertiary", shape: "rect", value: "1,880" },
                { id: "d", label: "Other", tone: "muted", shape: "rect", value: "1,430" },
              ]}
            />
          </Stage>
        </Specimen>
        <Specimen
          name="ChartTooltip"
          api="title · rows: {id, label, value, tone, shape?, note?}[]"
          description="The readout every chart uses. A note carries the comparison's own date."
        >
          <div className="rounded-card bg-subtle p-8">
            <ChartTooltip
              title="Wed, Sep 23"
              rows={[
                { id: "r", label: "Revenue", value: "$1,912", tone: "primary" },
                {
                  id: "p",
                  label: "Previous period",
                  value: "$1,655",
                  tone: "muted",
                  shape: "dashed",
                  note: "Aug 24",
                },
              ]}
            />
          </div>
        </Specimen>
        <Specimen
          name="ChartTable"
          api="series · valueFormat · xFormat · xHeader · caption · maxHeight"
          description="The accessible twin of any chart, built on Table: one row per x, one column per series, tabular figures. Flush, so it runs edge to edge in a card."
        >
          <Card className="overflow-hidden">
            <ChartTable
              series={EXAMPLE_WEEK_COMPARISON}
              valueFormat={COUNT}
              xHeader="Weekday"
              caption="Orders by weekday, this week and last week (example data)"
            />
          </Card>
        </Specimen>
      </Section>
    </div>
  );
}

// Swatches paint the token directly (static classes so Tailwind emits them).
const SWATCH: Record<ChartTone, string> = {
  primary: "bg-chart-1",
  comparison: "bg-chart-2",
  tertiary: "bg-chart-3",
  muted: "bg-chart-muted",
};
