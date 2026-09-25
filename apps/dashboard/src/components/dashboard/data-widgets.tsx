// Widgets for data domains Storevia doesn't collect yet (orders, visitors,
// content…). They get a card only when there is something to draw, which
// today means a development preview's example data, always badged. Without
// data they are summarised in the "What you'll track" strip (TrackingCard),
// plan-locked ones too, so the page never stacks empty frames and a locked
// widget never shows data, not even example data.
import {
  BarChart,
  ChartCard,
  ChartHeadline,
  DonutChart,
  LineChart,
  Sparkline,
} from "@storevia/ui/charts";
import { cn } from "@storevia/ui/cn";
import { KpiCard } from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { Badge, Card, CardFooter, CardHeader, ExampleDataBadge } from "@storevia/ui/surfaces";
import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { NAV_ICONS } from "@/components/shell/icons";
import type { ComposedWidget } from "@/lib/dashboard/compose";
import {
  exampleKpi,
  exampleList,
  exampleRanking,
  exampleShare,
  exampleTotal,
  exampleTrend,
  exampleValueFormat,
  type ExampleMetric,
} from "@/lib/dashboard/example-data";
import type { TrackingGroup } from "@/lib/dashboard/layout";
import { PERIOD_DAYS } from "@/lib/dashboard/preview";
import { DASHBOARD_WIDGETS, type WidgetKey } from "@/lib/dashboard/widgets";
import type { DashboardScope } from "./types";

const periodWindow = (scope: DashboardScope) => ({
  days: PERIOD_DAYS[scope.period],
  end: scope.today,
});
const comparison = (scope: DashboardScope) =>
  `vs previous ${String(PERIOD_DAYS[scope.period])} days`;

/* ---------------------------------------------------------------------------
 * KPI tiles
 * ------------------------------------------------------------------------- */

export function MetricWidget({ widget, scope }: { widget: ComposedWidget; scope: DashboardScope }) {
  if (!scope.preview) return null;
  const kpi = exampleKpi(widget.key as ExampleMetric, periodWindow(scope), scope.format);
  return (
    <KpiCard
      // The badge gets its own line under the label, so every tile in the
      // row keeps its figure on one baseline and a narrow tile never clips
      // the badge (KpiCard's `example` badge wraps with the label's length).
      label={
        <span className="flex flex-col items-start gap-1.5">
          {widget.title}
          <ExampleDataBadge />
        </span>
      }
      // Phones get the compact figure, so a 2 × 2 tile never truncates it.
      value={
        kpi.short === kpi.value ? (
          kpi.value
        ) : (
          <>
            <span className="sm:hidden">{kpi.short}</span>
            <span className="max-sm:hidden">{kpi.value}</span>
          </>
        )
      }
      delta={kpi.delta}
      comparison={comparison(scope)}
      sparkline={<Sparkline data={kpi.data} decorative area={widget.key === "revenue"} />}
      data-testid={`kpi-${widget.key}`}
    />
  );
}

/* ---------------------------------------------------------------------------
 * What you'll track: every widget without data, in one strip
 * ------------------------------------------------------------------------- */

// Columns by group count, by the card's own width (it sits full width, or
// in the main column).
const TRACKING_COLUMNS: Record<number, string> = {
  0: "",
  1: "",
  2: "@xl:grid-cols-2",
  3: "@3xl:grid-cols-3",
  4: "@xl:grid-cols-2 @5xl:grid-cols-4",
};

/** "Milestone 6", "Later release" or "Available". */
function availabilityText(availability: string | undefined) {
  if (availability === undefined) return "Available";
  return availability.replace(/^a later/, "Later");
}

export function TrackingCard({
  groups,
  billingHref,
}: {
  groups: readonly TrackingGroup[];
  billingHref: string | null;
}) {
  if (groups.length === 0) return null;
  const locked = groups.some((group) => group.lockedBy !== null);
  return (
    <Card className="@container" data-testid="dashboard-tracking">
      <CardHeader
        title="What you'll track"
        description="Figures start recording as each area arrives. Until then, nothing is estimated."
      />
      <ul className={cn("grid", TRACKING_COLUMNS[Math.min(groups.length, 4)])}>
        {groups.map((group) => (
          // Hairlines above and to the left of every cell: along the card's
          // edge they fall on its own border, so any column count works.
          <li
            key={`${group.area}:${group.lockedBy ?? ""}`}
            className="flex gap-3.5 px-5 py-4.5 shadow-[-1px_-1px_0_var(--color-line)] sm:px-6"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-subtle text-ink-muted ring-1 ring-line ring-inset">
              <Icon icon={NAV_ICONS[group.area]} size="sm" />
            </span>
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-ink">{group.metrics.join(" · ")}</p>
              {/* "Orders · Milestone 6": the area the figures start with, and when. */}
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-ink-muted">
                <span>{group.label}</span>
                <span aria-hidden="true" className="text-ink-faint">
                  ·
                </span>
                {group.lockedBy ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon icon={Lock} size="xs" className="text-ink-faint" />
                    Not in your plan
                  </span>
                ) : (
                  <span>{availabilityText(group.availability)}</span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {locked && billingHref ? (
        <CardFooter className="justify-start py-1.5">
          <Link
            href={billingHref}
            className="-mx-2 inline-flex h-11 items-center gap-1.5 rounded-control px-2 text-label font-medium text-brand-700 transition-colors hover:bg-brand-50 lg:h-9 pointer-coarse:h-11"
          >
            View your plan
            <Icon icon={ArrowRight} size="sm" />
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Primary trend chart
 * ------------------------------------------------------------------------- */

const TREND_METRIC: Partial<Record<WidgetKey, ExampleMetric>> = {
  "sales-trend": "revenue",
  "traffic-trend": "visitors",
};

export function TrendWidget({ widget, scope }: { widget: ComposedWidget; scope: DashboardScope }) {
  if (!scope.preview) return null;
  const metric = TREND_METRIC[widget.key] ?? "visitors";
  const days = PERIOD_DAYS[scope.period];
  // The series is named for what it measures ("Revenue" on the Sales chart).
  const series = metric === "revenue" ? "Revenue" : widget.title;
  const trend = exampleTrend(metric, series, periodWindow(scope), scope.format);
  return (
    <ChartCard
      titleAs="h2"
      title={widget.title}
      description={`Last ${String(days)} days against the ${String(days)} days before.`}
      status="example"
      metric={
        <ChartHeadline value={trend.value} delta={trend.delta} comparison={comparison(scope)} />
      }
      footer="Generated for this preview"
    >
      <LineChart
        label={`${widget.title}, last ${String(days)} days`}
        series={trend.series}
        valueFormat={exampleValueFormat(metric, scope.format)}
        locale={scope.format.locale}
        yDomain={trend.domain}
        curve="monotone"
        height={260}
      />
    </ChartCard>
  );
}

/* ---------------------------------------------------------------------------
 * Secondary modules: ranking, share and list
 * ------------------------------------------------------------------------- */

export function RankingWidget({
  widget,
  scope,
}: {
  widget: ComposedWidget;
  scope: DashboardScope;
}) {
  if (!scope.preview) return null;
  const days = PERIOD_DAYS[scope.period];
  const products = widget.key === "top-products";
  return (
    <ChartCard
      titleAs="h2"
      className="h-full"
      title={widget.title}
      description={widget.description}
      status="example"
    >
      <BarChart
        orientation="horizontal"
        label={`${widget.title}, last ${String(days)} days`}
        xHeader={products ? "Product" : "Title"}
        series={exampleRanking(
          products ? "top-products" : "top-content",
          scope.businessType,
          products ? "Revenue" : "Views",
          days,
        )}
        valueFormat={
          products
            ? { style: "currency", currency: scope.format.currency, maximumFractionDigits: 0 }
            : { maximumFractionDigits: 0 }
        }
        locale={scope.format.locale}
      />
    </ChartCard>
  );
}

export function ShareWidget({ widget, scope }: { widget: ComposedWidget; scope: DashboardScope }) {
  if (!scope.preview) return null;
  const days = PERIOD_DAYS[scope.period];
  // The split adds up to the visitors KPI's figure, named as that KPI is.
  const visitors = DASHBOARD_WIDGETS.visitors;
  const people = visitors.presentation?.[scope.businessType]?.title ?? visitors.title;
  return (
    <ChartCard
      titleAs="h2"
      className="h-full"
      title={widget.title}
      description={widget.description}
      status="example"
    >
      <DonutChart
        label={`${people} by source, last ${String(days)} days`}
        xHeader="Source"
        centerLabel={people}
        data={exampleShare(exampleTotal("visitors", periodWindow(scope)))}
        locale={scope.format.locale}
        size={160}
      />
    </ChartCard>
  );
}

export function ListWidget({ widget, scope }: { widget: ComposedWidget; scope: DashboardScope }) {
  if (!scope.preview) return null;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={widget.title}
        description={widget.description}
        actions={<ExampleDataBadge />}
      />
      <ul className="divide-y divide-line">
        {exampleList(widget.key).map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-ink">{row.title}</p>
              <p className="mt-0.5 truncate text-caption text-ink-faint">{row.detail}</p>
            </div>
            {row.badge ? (
              <Badge size="sm" tone={row.badge.tone}>
                {row.badge.label}
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
