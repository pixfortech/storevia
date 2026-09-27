// The order and customer widgets (Milestone 6): real figures from the
// store's orders, drawn with the same KPI tiles and charts the preview's
// example data uses (data-widgets.tsx), never with example data. A store
// with no orders gets honest zeros and says so. The page loads each summary
// only for a member whose role may read it (order.read, customer.read).
import { BarChart, ChartCard, ChartHeadline, LineChart, Sparkline } from "@storevia/ui/charts";
import { KpiCard } from "@storevia/ui/data";
import Link from "next/link";
import type { ComposedWidget } from "@/lib/dashboard/compose";
import {
  customersKpi,
  salesKpi,
  salesTrend,
  topProductsSeries,
  type LiveKpi,
} from "@/lib/dashboard/sales";
import type { CustomersSummary, DashboardScope, SalesSummary } from "./types";

function LiveKpiCard({
  widget,
  kpi,
  href,
  area = false,
}: {
  widget: ComposedWidget;
  kpi: LiveKpi;
  href: string;
  area?: boolean;
}) {
  return (
    <KpiCard
      label={widget.title}
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
      {...(kpi.delta ? { delta: kpi.delta } : {})}
      comparison={kpi.comparison}
      {...(kpi.data ? { sparkline: <Sparkline data={kpi.data} decorative area={area} /> } : {})}
      href={href}
      linkAs={Link}
      data-testid={`kpi-${widget.key}`}
    />
  );
}

/** Revenue or Orders over the period. */
export function SalesKpiCard({
  widget,
  sales,
  scope,
}: {
  widget: ComposedWidget;
  sales: SalesSummary;
  scope: DashboardScope;
}) {
  const metric = widget.key === "revenue" ? "revenue" : "orders";
  return (
    <LiveKpiCard
      widget={widget}
      kpi={salesKpi(metric, sales.figures, scope.format.locale)}
      href={sales.ordersHref}
      area={metric === "revenue"}
    />
  );
}

/** New customers over the period. */
export function CustomersKpiCard({
  widget,
  customers,
  scope,
}: {
  widget: ComposedWidget;
  customers: CustomersSummary;
  scope: DashboardScope;
}) {
  return (
    <LiveKpiCard
      widget={widget}
      kpi={customersKpi(customers.figures, scope.format.locale)}
      href={customers.customersHref}
    />
  );
}

/** Revenue by day in the store's timezone, against the period before. */
export function SalesTrendCard({
  widget,
  sales,
  scope,
}: {
  widget: ComposedWidget;
  sales: SalesSummary;
  scope: DashboardScope;
}) {
  const { days, timezone } = sales.figures;
  const trend = salesTrend(sales.figures, scope.format.locale);
  return (
    <ChartCard
      titleAs="h2"
      title={widget.title}
      description={`Revenue by day for the last ${String(days)} days, against the ${String(days)} days before.`}
      status={trend.empty ? "empty" : "ready"}
      empty={{
        title: `No orders in the last ${String(days * 2)} days`,
        description: "Revenue by day appears here as your storefront takes orders.",
      }}
      metric={
        <ChartHeadline
          value={trend.value}
          {...(trend.delta ? { delta: trend.delta } : {})}
          comparison={trend.comparison}
        />
      }
      footer={`Order totals less refunds, without cancelled orders. Days in ${timezone} time.`}
      height={260}
    >
      <LineChart
        label={`${widget.title}, last ${String(days)} days`}
        series={trend.series}
        valueFormat={trend.valueFormat}
        locale={scope.format.locale}
        curve="monotone"
        height={260}
      />
    </ChartCard>
  );
}

/** Best sellers over the period, by units sold. */
export function TopProductsCard({
  widget,
  sales,
  scope,
}: {
  widget: ComposedWidget;
  sales: SalesSummary;
  scope: DashboardScope;
}) {
  const { days } = sales.figures;
  const series = topProductsSeries(sales.figures);
  return (
    <ChartCard
      titleAs="h2"
      className="h-full"
      title={widget.title}
      description={widget.description}
      status={series ? "ready" : "empty"}
      empty={{
        title: `No sales in the last ${String(days)} days`,
        description: "Your best sellers appear here once orders come in.",
      }}
    >
      {series ? (
        <BarChart
          orientation="horizontal"
          label={`${widget.title}, last ${String(days)} days`}
          xHeader="Product"
          series={series}
          valueFormat={{ maximumFractionDigits: 0 }}
          locale={scope.format.locale}
        />
      ) : null}
    </ChartCard>
  );
}
