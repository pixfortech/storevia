// Analytics mockups: a small floating figure card (hero collage) and the
// report preview (live, interactive charts on example data, each marked
// "Example data"). Analytics is on the roadmap; plans already set how much
// history each keeps.
import {
  AreaChart,
  BarChart,
  ChartCard,
  ChartHeadline,
  DonutChart,
  Sparkline,
} from "@storevia/ui/charts";
import { cn } from "@storevia/ui/cn";
import { KpiCard, Metric } from "@storevia/ui/data";
import { Mockup } from "./frame";
import { exampleDates, exampleSeries, SAMPLE_DASHBOARDS, scaleSeries } from "./sample-data";

const SHOP = SAMPLE_DASHBOARDS.ECOMMERCE;

const CHANNELS = [
  { id: "search", label: "Search", value: 4120 },
  { id: "direct", label: "Direct", value: 2380 },
  { id: "social", label: "Social", value: 1510 },
  { id: "email", label: "Email", value: 930 },
] as const;

/** One figure with its change and trend, as a floating card. */
export function AnalyticsCard({
  kpi = 2,
  className,
}: {
  /** Which of the online store's example figures to show. */
  kpi?: number;
  className?: string;
}) {
  const figure = SHOP.kpis[kpi] ?? SHOP.kpis[0];
  if (!figure) return null;
  return (
    <Mockup
      label={`Illustration: a ${figure.label.toLowerCase()} card with an example figure.`}
      className={className}
    >
      <div className="rounded-card border border-line bg-surface p-4 shadow-popover">
        <Metric
          label={figure.label}
          value={figure.value}
          delta={{
            value: figure.delta,
            ...(figure.deltaLabel ? { label: figure.deltaLabel } : {}),
          }}
          comparison="vs last month"
          sparkline={<Sparkline data={figure.trend} height={36} area decorative />}
          sparklinePlacement="below"
        />
      </div>
    </Mockup>
  );
}

/** Visits by channel as ranked bars, as a floating card. */
export function ChannelsCard({ className }: { className?: string | undefined }) {
  const total = CHANNELS.reduce((sum, channel) => sum + channel.value, 0);
  // Bars are relative to the leading channel.
  const top = Math.max(...CHANNELS.map((channel) => channel.value));
  return (
    <Mockup
      label="Illustration: a card of visits by channel, with example figures."
      className={className}
    >
      <div className="rounded-card border border-line bg-surface p-4 shadow-popover">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-label text-ink-muted">Visits by channel</p>
          <p className="text-caption text-ink-faint">30 days</p>
        </div>
        <ul className="mt-3 space-y-2.5">
          {CHANNELS.map((channel, index) => (
            <li key={channel.id}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-ink">{channel.label}</span>
                <span className="text-ink-muted tabular-nums">
                  {Math.round((channel.value / total) * 100)}%
                </span>
              </div>
              <span className="mt-1 block h-1.5 rounded-pill bg-muted">
                <span
                  className={cn(
                    "block h-full rounded-pill",
                    index === 0 ? "bg-chart-1" : "bg-chart-2",
                  )}
                  style={{ width: `${String((channel.value / top) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Mockup>
  );
}

const DAYS = 30;
// The visitors chart agrees with the Visitors figure and its change.
const VISITORS = { total: 8940, change: 9.1 } as const;
const visitors = scaleSeries(
  exampleSeries(DAYS, { base: 290, growth: 0.28, weekly: 0.14, jitter: 0.08, seed: 41 }),
  VISITORS.total,
);
const previous = scaleSeries(
  exampleSeries(DAYS, { base: 270, growth: 0.06, weekly: 0.12, jitter: 0.08, seed: 42 }),
  Math.round(VISITORS.total / (1 + VISITORS.change / 100)),
);
const dates = exampleDates(DAYS);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const ORDERS_BY_DAY = [38, 44, 41, 52, 61, 49, 33] as const;

const COUNT = { maximumFractionDigits: 0 } as const;

/**
 * The analytics report as planned: figures, visitors against the previous
 * period, orders by weekday and traffic by channel. Interactive (hover, keys
 * and a table view) and marked as example data throughout. Phones get the
 * figures and the visitors chart only, to keep the page a sensible length.
 */
export function AnalyticsPreview({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-12", className)}>
      <ul className="grid gap-4 min-[360px]:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
        {SHOP.kpis.map((kpi) => (
          <li key={kpi.label} className="min-w-0">
            <KpiCard
              label={kpi.label}
              value={kpi.value}
              delta={{ value: kpi.delta, ...(kpi.deltaLabel ? { label: kpi.deltaLabel } : {}) }}
              comparison="vs last month"
              sparkline={<Sparkline data={kpi.trend} height={32} decorative />}
              example
              className="h-full"
            />
          </li>
        ))}
      </ul>
      <ChartCard
        title="Visitors"
        description="Last 30 days against the 30 before"
        status="example"
        metric={
          <ChartHeadline
            value={VISITORS.total.toLocaleString("en-US")}
            delta={{ value: VISITORS.change }}
            comparison="vs previous period"
          />
        }
        className="min-w-0 lg:col-span-8"
      >
        <AreaChart
          height={220}
          curve="monotone"
          valueFormat={COUNT}
          label="Visitors per day, last 30 days, with the previous period (example data)"
          series={[
            {
              id: "current",
              label: "This period",
              data: visitors.map((y, i) => ({ x: dates[i] ?? i, y })),
            },
            {
              id: "previous",
              label: "Previous period",
              tone: "muted",
              data: previous.map((y, i) => ({ x: dates[i] ?? i, y })),
            },
          ]}
        />
      </ChartCard>
      <ChartCard
        title="Traffic by channel"
        description="Share of visits"
        status="example"
        className="min-w-0 max-md:hidden lg:col-span-4"
      >
        <DonutChart
          data={CHANNELS}
          size={148}
          thickness={14}
          centerLabel="Visits"
          valueFormat={COUNT}
          label="Visits by channel, last 30 days (example data)"
          xHeader="Channel"
        />
      </ChartCard>
      <ChartCard
        title="Orders by weekday"
        description="Average over the last 12 weeks"
        status="example"
        className="min-w-0 max-md:hidden lg:col-span-12"
      >
        <BarChart
          height={180}
          valueFormat={COUNT}
          label="Average orders by weekday (example data)"
          xHeader="Weekday"
          series={[
            {
              id: "orders",
              label: "Orders",
              data: WEEKDAYS.map((day, i) => ({ x: day, y: ORDERS_BY_DAY[i] ?? 0 })),
            },
          ]}
        />
      </ChartCard>
    </div>
  );
}
