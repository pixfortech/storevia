import { cn, Reveal } from "@storevia/ui";
import type { ReactNode } from "react";
import type { ComposedWidget, DashboardDensity } from "@/lib/dashboard/compose";
import type { DashboardArrangement } from "@/lib/dashboard/layout";

// Phones: 2 × 2, an odd last tile spanning the row. Tablet: three across,
// or 2 × 2 for four. Desktop (1280+, beside the sidebar): one row.
const KPI_COLUMNS: Record<number, string> = {
  1: "grid-cols-2 xl:grid-cols-4",
  2: "grid-cols-2 xl:grid-cols-4",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
};

// Three modules sit in one row on desktop; other counts pair up.
const MODULE_COLUMNS: Record<number, string> = { 3: "md:grid-cols-2 xl:grid-cols-3" };

/**
 * The store home's layout (design plan §10–12), the same for every business
 * type: the KPI row; the main column (primary chart first, 8 of 12 columns)
 * beside the rail (4), with a lone secondary module (or else the "What
 * you'll track" strip) under the main column; the secondary modules; the
 * strip, if it isn't already placed; then full-width bands. Below 1280 px the rail sits under the main column in two columns
 * and charts span the width; phones stack everything in one column, in
 * that order. Empty groups collapse, so a member who may read little still
 * gets a balanced page.
 */
export function DashboardGrid({
  layout,
  density,
  render,
  tracking,
}: {
  layout: DashboardArrangement;
  density: DashboardDensity;
  render: (widget: ComposedWidget) => ReactNode;
  /** The "What you'll track" card, drawn after the modules. */
  tracking: ReactNode;
}) {
  const { metrics, main, rail, underMain, modules, bands } = layout;
  // The slot under the main column holds a lone module or, failing that,
  // the tracking strip; either way nothing stretches around a little content.
  const trackingUnderMain = !underMain && main.length > 0 && layout.tracking.length > 0;
  const slot = underMain ? render(underMain) : trackingUnderMain ? tracking : null;
  const gap = density === "compact" ? "gap-4" : "gap-4 sm:gap-6";
  const stack = density === "compact" ? "space-y-4" : "space-y-4 sm:space-y-6";
  const cell = (widget: ComposedWidget, className = "flex min-w-0 *:flex-1") => (
    <div key={widget.key} className={className}>
      {render(widget)}
    </div>
  );

  return (
    <div className={density === "compact" ? "space-y-4" : "space-y-6 lg:space-y-8"}>
      {metrics.length > 0 ? (
        <section aria-labelledby="dashboard-metrics">
          <h2 id="dashboard-metrics" className="sr-only">
            Key metrics
          </h2>
          <div
            className={cn(
              "grid",
              density === "compact" ? "gap-3" : "gap-3 sm:gap-4 xl:gap-6",
              KPI_COLUMNS[Math.min(metrics.length, 5)],
              "max-md:[&>*:last-child:nth-child(odd)]:col-span-2",
            )}
          >
            {metrics.map((widget) => cell(widget))}
          </div>
        </section>
      ) : null}

      {main.length > 0 || rail.length > 0 ? (
        <div
          className={cn(
            "grid items-start xl:grid-cols-12",
            // The rail spans both rows; the second row takes any extra
            // height, so the lone module sits right under the main column.
            slot && rail.length > 0 && "xl:grid-rows-[auto_1fr]",
            gap,
          )}
        >
          {main.length > 0 ? (
            <div
              className={cn("min-w-0", stack, rail.length > 0 ? "xl:col-span-8" : "xl:col-span-12")}
            >
              {main.map((widget) => cell(widget, "min-w-0"))}
            </div>
          ) : null}
          {rail.length > 0 ? (
            <div
              className={cn(
                "grid min-w-0 content-start",
                gap,
                rail.length > 1 &&
                  "md:grid-cols-2 md:max-xl:[&>*:last-child:nth-child(odd)]:col-span-2",
                main.length > 0 ? "xl:col-span-4 xl:grid-cols-1" : "xl:col-span-12 xl:grid-cols-3",
                slot && "xl:row-span-2",
              )}
            >
              {rail.map((widget) => cell(widget))}
            </div>
          ) : null}
          {slot ? (
            <div
              className={cn(
                "flex min-w-0 *:flex-1",
                rail.length > 0 ? "xl:col-span-8" : "xl:col-span-12",
              )}
            >
              {slot}
            </div>
          ) : null}
        </div>
      ) : null}

      {modules.length > 0 ? (
        <Reveal
          className={cn(
            "grid",
            gap,
            MODULE_COLUMNS[modules.length] ?? "md:grid-cols-2",
            // An odd module out spans the row until three fit side by side.
            "md:max-xl:[&>*:last-child:nth-child(odd)]:col-span-2",
          )}
        >
          {modules.map((widget) => cell(widget))}
        </Reveal>
      ) : null}

      {trackingUnderMain ? null : tracking}

      {bands.map((widget) => (
        <Reveal key={widget.key}>{render(widget)}</Reveal>
      ))}
    </div>
  );
}
