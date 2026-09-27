import { widgetDisplay, widgetVisual, type ComposedWidget } from "@/lib/dashboard/compose";
import { ListWidget, MetricWidget, RankingWidget, ShareWidget, TrendWidget } from "./data-widgets";
import {
  ActivityCard,
  CatalogueCard,
  ContentUpdatesCard,
  StockAlertsCard,
  FocusBand,
  PlanUsageCard,
  SetupCard,
  TeamCard,
  WebsiteCard,
} from "./live-widgets";
import { CustomersKpiCard, SalesKpiCard, SalesTrendCard, TopProductsCard } from "./sales-widgets";
import type { DashboardScope, LiveData } from "./types";

/**
 * One widget card. Live widgets have their own component and render only
 * real data the page loaded for them (zeros included); upcoming widgets
 * reach here only with example data to draw (arrangeDashboard summarises
 * the rest), one component per visual across every business type. A
 * development preview draws live period figures (orders, customers) with
 * example data too; outside it they are always real.
 */
export function DashboardWidget({
  widget,
  scope,
  live,
}: {
  widget: ComposedWidget;
  scope: DashboardScope;
  live: LiveData;
}) {
  const display = widgetDisplay(widget, scope.preview);
  if (display === "locked" || display === "empty") return null;
  if (display === "example") {
    switch (widgetVisual(widget)) {
      case "metric":
        return <MetricWidget widget={widget} scope={scope} />;
      case "trend":
        return <TrendWidget widget={widget} scope={scope} />;
      case "ranking":
        return <RankingWidget widget={widget} scope={scope} />;
      case "share":
        return <ShareWidget widget={widget} scope={scope} />;
      default:
        return <ListWidget widget={widget} scope={scope} />;
    }
  }
  switch (widget.key) {
    case "setup":
      return <SetupCard widget={widget} tasks={live.setup} />;
    case "website-status":
      return <WebsiteCard widget={widget} site={live.website} />;
    case "plan-usage":
      return live.plan ? <PlanUsageCard widget={widget} plan={live.plan} /> : null;
    case "team":
      return live.team ? <TeamCard widget={widget} team={live.team} /> : null;
    case "activity":
      return live.activity ? <ActivityCard widget={widget} items={live.activity} /> : null;
    case "focus":
      return <FocusBand widget={widget} areas={live.focus} />;
    case "catalogue":
      return live.catalogue ? <CatalogueCard widget={widget} catalogue={live.catalogue} /> : null;
    case "stock-alerts":
      return live.catalogue ? <StockAlertsCard widget={widget} catalogue={live.catalogue} /> : null;
    case "content-updates":
      return live.content ? <ContentUpdatesCard widget={widget} content={live.content} /> : null;
    case "revenue":
    case "orders":
      return live.sales ? <SalesKpiCard widget={widget} sales={live.sales} scope={scope} /> : null;
    case "sales-trend":
      return live.sales ? (
        <SalesTrendCard widget={widget} sales={live.sales} scope={scope} />
      ) : null;
    case "top-products":
      return live.sales ? (
        <TopProductsCard widget={widget} sales={live.sales} scope={scope} />
      ) : null;
    case "customers":
      return live.customers ? (
        <CustomersKpiCard widget={widget} customers={live.customers} scope={scope} />
      ) : null;
    default:
      return null;
  }
}
