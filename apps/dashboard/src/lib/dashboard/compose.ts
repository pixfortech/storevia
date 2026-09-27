// Dashboard composition (brief §11–12): one code path for every business
// type. Three independent dimensions, never mixed:
// - business type decides presentation (which widgets, in what order, and
//   their wording);
// - RBAC decides visibility (a widget the member may not read is absent);
// - plan entitlements decide commercial access (a widget outside the plan is
//   shown locked, never with data).
// Preferences (hide, reorder, density) are honoured here but not stored yet.
import type { FeatureKey } from "@storevia/entitlements/features";
import {
  BUSINESS_TYPE_DEFINITIONS,
  STORE_AREAS,
  type AreaKey,
  type BusinessType,
  type StoreArea,
} from "@storevia/tenancy/business-types";
import type { Permission } from "@storevia/tenancy/rbac";
import {
  DASHBOARD_LAYOUTS,
  DASHBOARD_WIDGETS,
  type UpcomingVisual,
  type WidgetDefinition,
  type WidgetKey,
  type WidgetSize,
} from "./widgets";

export type DashboardDensity = "comfortable" | "compact";

/** A member's dashboard preferences. Typed and honoured, not persisted yet. */
export interface DashboardPreferences {
  /** Widgets the member hid. Hiding never reveals anything RBAC hides. */
  readonly hidden?: readonly WidgetKey[];
  /** A new order for these widgets; the rest keep their places. */
  readonly order?: readonly WidgetKey[];
  readonly density?: DashboardDensity;
}

export type WidgetState =
  | {
      readonly kind: "live";
      /** A figure over the dashboard's period, and its visual in a preview (see WidgetSource). */
      readonly period?: UpcomingVisual;
    }
  | {
      readonly kind: "upcoming";
      readonly area: AreaKey;
      /** The store area the data starts with, e.g. "Orders". */
      readonly areaLabel: string;
      /** When that area ships, e.g. "Milestone 6" or "a later release". */
      readonly availability: string;
      readonly visual: UpcomingVisual;
    }
  | { readonly kind: "locked"; readonly feature: FeatureKey };

export interface ComposedWidget {
  readonly key: WidgetKey;
  readonly size: WidgetSize;
  readonly title: string;
  readonly description: string;
  readonly state: WidgetState;
}

export interface ComposedDashboard {
  readonly businessType: BusinessType;
  readonly widgets: readonly ComposedWidget[];
  readonly density: DashboardDensity;
}

export interface ComposeInput {
  readonly businessType: BusinessType;
  readonly permissions: ReadonlySet<Permission>;
  readonly grantedFeatures: ReadonlySet<FeatureKey>;
  readonly preferences?: DashboardPreferences | undefined;
}

const LATER = "a later release";

function stateOf(definition: WidgetDefinition, granted: ReadonlySet<FeatureKey>): WidgetState {
  if (definition.feature !== undefined && !granted.has(definition.feature)) {
    return { kind: "locked", feature: definition.feature };
  }
  const { source } = definition;
  if (source.kind === "upcoming") {
    const area = STORE_AREAS[source.area];
    return {
      kind: "upcoming",
      area: area.key,
      areaLabel: area.label,
      availability: source.availability ?? area.availability ?? LATER,
      visual: source.visual,
    };
  }
  return source.period === undefined ? { kind: "live" } : { kind: "live", period: source.period };
}

/**
 * Puts the widgets named in `order` into the slots those widgets occupy, in
 * the preferred order; every other widget keeps its slot.
 */
function reorder<T extends { key: WidgetKey }>(items: readonly T[], order: readonly WidgetKey[]) {
  const rank = new Map(order.map((key, i) => [key, i] as const));
  const slots = items.flatMap((item, i) => (rank.has(item.key) ? [i] : []));
  const moved = items
    .filter((item) => rank.has(item.key))
    .sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  const result = [...items];
  slots.forEach((slot, i) => {
    const item = moved[i];
    if (item) result[slot] = item;
  });
  return result;
}

/** The ordered, permission-filtered widgets for a store home. */
export function composeDashboard({
  businessType,
  permissions,
  grantedFeatures,
  preferences = {},
}: ComposeInput): ComposedDashboard {
  const hidden = new Set(preferences.hidden ?? []);
  const visible = DASHBOARD_LAYOUTS[businessType]
    .map((key) => DASHBOARD_WIDGETS[key])
    .filter((definition) => permissions.has(definition.permission) && !hidden.has(definition.key));
  const widgets = reorder(visible, preferences.order ?? []).map((definition): ComposedWidget => {
    const copy = definition.presentation?.[businessType];
    return {
      key: definition.key,
      size: definition.size,
      title: copy?.title ?? definition.title,
      description: copy?.description ?? definition.description,
      state: stateOf(definition, grantedFeatures),
    };
  });
  return { businessType, widgets, density: preferences.density ?? "comfortable" };
}

/**
 * What a widget has to show: real data (live), nothing yet (empty),
 * clearly badged example data in a development preview (example), or
 * nothing because the plan lacks it (locked). Locked widgets never show
 * data, not even example data. Empty and locked widgets get no card of
 * their own; arrangeDashboard() summarises them in one strip. Outside a
 * preview a widget is never "example": live figures are always real, even
 * when they are zero.
 */
export type WidgetDisplay = "live" | "empty" | "example" | "locked";

export function widgetDisplay(widget: ComposedWidget, preview: boolean): WidgetDisplay {
  switch (widget.state.kind) {
    case "locked":
      return "locked";
    case "upcoming":
      return preview ? "example" : "empty";
    default:
      // A preview draws every period figure with example data, so the
      // design can be reviewed on a store with no orders.
      return preview && widget.state.period !== undefined ? "example" : "live";
  }
}

/** The visual a widget's figures take: an upcoming widget's, or a live period figure's. */
export function widgetVisual(widget: ComposedWidget): UpcomingVisual | undefined {
  switch (widget.state.kind) {
    case "upcoming":
      return widget.state.visual;
    case "live":
      return widget.state.period;
    default:
      return undefined;
  }
}

/**
 * Whether a period control would change anything: some time-based widget
 * (a figure, trend, ranking or share, not a list) has data to scope, real
 * (a live period figure such as revenue) or example (a preview). A member
 * who sees none of those gets no control that does nothing.
 */
export function hasPeriodData(widgets: readonly ComposedWidget[], preview: boolean): boolean {
  return widgets.some((widget) => {
    const display = widgetDisplay(widget, preview);
    const visual = widgetVisual(widget);
    return (
      (display === "live" || display === "example") && visual !== undefined && visual !== "list"
    );
  });
}

export interface FocusArea {
  readonly area: StoreArea;
  /** The plan doesn't include the area's feature. Presentation only. */
  readonly locked: boolean;
}

/** The areas a business type's home highlights, filtered by permission. */
export function focusAreas(
  businessType: BusinessType,
  permissions: ReadonlySet<Permission>,
  grantedFeatures: ReadonlySet<FeatureKey>,
): FocusArea[] {
  return BUSINESS_TYPE_DEFINITIONS[businessType].homeFocus
    .map((key) => STORE_AREAS[key])
    .filter((area) => permissions.has(area.permission))
    .map((area) => ({
      area,
      locked: area.feature !== undefined && !grantedFeatures.has(area.feature),
    }));
}
