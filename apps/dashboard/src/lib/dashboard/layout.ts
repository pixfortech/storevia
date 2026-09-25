// How the composed widgets are laid out on the store home. Pure, so the
// arrangement is unit-tested. Only widgets with something to show get a
// card: every widget that has no data (a domain Storevia doesn't collect
// yet, or a plan feature the organisation lacks) is summarised in one
// "What you'll track" strip instead of drawing an empty frame each. Today
// no store has collected data, so the real page opens with setup and the
// website, not with a wall of placeholders (brief §10: don't show every
// chart at once).
import type { FeatureKey } from "@storevia/entitlements/features";
import { STORE_AREAS, type AreaKey } from "@storevia/tenancy/business-types";
import { widgetDisplay, type ComposedWidget } from "./compose";
import { DASHBOARD_WIDGETS } from "./widgets";

/** One store area in the strip: the figures that start when it ships. */
export interface TrackingGroup {
  readonly area: AreaKey;
  /** The store area, e.g. "Orders". */
  readonly label: string;
  /** "Milestone 6" or "a later release"; unset once the area is available. */
  readonly availability: string | undefined;
  /** Widget titles, in layout order, without repeats ("Revenue", "Orders", "Sales"). */
  readonly metrics: readonly string[];
  /** The plan doesn't include this; the strip says so and shows no data. */
  readonly lockedBy: FeatureKey | null;
}

export interface DashboardArrangement {
  readonly metrics: readonly ComposedWidget[];
  /** The 8-column main column (primary chart, setup). */
  readonly main: readonly ComposedWidget[];
  /** The 4-column rail beside it. */
  readonly rail: readonly ComposedWidget[];
  /**
   * A single secondary module sits under the main column: alone in its own
   * row it would stretch the full width around very little content.
   */
  readonly underMain: ComposedWidget | null;
  /** Secondary modules, two or three to a row. */
  readonly modules: readonly ComposedWidget[];
  readonly tracking: readonly TrackingGroup[];
  /** Full-width bands at the end (focus areas). */
  readonly bands: readonly ComposedWidget[];
}

/** Milestone number for ordering; later releases after every milestone. */
function milestone(availability: string | undefined): number {
  if (availability === undefined) return 0;
  const match = /(\d+)/.exec(availability);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Groups data-less widgets by the store area their data arrives with,
 * soonest first; plan-locked areas come last.
 */
export function trackingGroups(widgets: readonly ComposedWidget[]): TrackingGroup[] {
  const groups = new Map<
    string,
    { area: AreaKey; lockedBy: FeatureKey | null; metrics: string[] }
  >();
  for (const widget of widgets) {
    const source = DASHBOARD_WIDGETS[widget.key].source;
    if (source.kind !== "upcoming") continue;
    const lockedBy = widget.state.kind === "locked" ? widget.state.feature : null;
    const id = `${source.area}:${lockedBy ?? ""}`;
    const group = groups.get(id) ?? { area: source.area, lockedBy, metrics: [] };
    if (!group.metrics.includes(widget.title)) group.metrics.push(widget.title);
    groups.set(id, group);
  }
  return [...groups.values()]
    .map((group) => {
      const area = STORE_AREAS[group.area];
      return { ...group, label: area.label, availability: area.availability };
    })
    .sort(
      (a, b) =>
        Number(a.lockedBy !== null) - Number(b.lockedBy !== null) ||
        milestone(a.availability) - milestone(b.availability),
    );
}

export function arrangeDashboard(
  widgets: readonly ComposedWidget[],
  preview: boolean,
): DashboardArrangement {
  const shown = widgets.filter((widget) => {
    const display = widgetDisplay(widget, preview);
    return display === "live" || display === "example";
  });
  const bySize = (size: ComposedWidget["size"]) => shown.filter((w) => w.size === size);
  const main = bySize("main");
  const half = bySize("half");
  const lone = half.length === 1 && main.length > 0 ? (half[0] ?? null) : null;
  return {
    metrics: bySize("kpi"),
    main,
    rail: bySize("rail"),
    underMain: lone,
    modules: lone ? [] : half,
    tracking: trackingGroups(widgets.filter((widget) => !shown.includes(widget))),
    bands: bySize("full"),
  };
}
