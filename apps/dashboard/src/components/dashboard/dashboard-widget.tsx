import type { ComposedWidget } from "@/lib/dashboard/compose";
import { ListWidget, MetricWidget, RankingWidget, ShareWidget, TrendWidget } from "./data-widgets";
import {
  ActivityCard,
  CatalogueCard,
  StockAlertsCard,
  FocusBand,
  PlanUsageCard,
  SetupCard,
  TeamCard,
  WebsiteCard,
} from "./live-widgets";
import type { DashboardScope, LiveData } from "./types";

/**
 * One widget card. Live widgets have their own component and render only
 * data the page loaded for them; upcoming widgets reach here only with
 * example data to draw (arrangeDashboard summarises the rest), one
 * component per visual across every business type.
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
  const { state } = widget;
  if (state.kind === "locked") return null;
  if (state.kind === "upcoming") {
    switch (state.visual) {
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
    default:
      return null;
  }
}
