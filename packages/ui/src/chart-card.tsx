"use client";
// ChartCard (charts.tsx): the standard frame for a chart on a dashboard,
// built from the SURFACES card parts (cardClasses, CardHeader, CardFooter,
// Badge) so it sits beside KpiCards as one family. Title, description,
// headline metric and actions; then the chart, or its table twin flush to
// the card edges like any Table; then a footer with the view toggle.
import { ChartLine, Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ChartViewContext, type ChartView } from "./chart-context";
import { ChartEmpty, ChartSkeleton, type ChartEmptyProps } from "./chart-parts";
import { cn } from "./cn";
import { Icon } from "./icons";
import { CardFooter, CardHeader, ExampleDataBadge, cardClasses } from "./surfaces";

/**
 * - "ready": real data.
 * - "empty": nothing collected yet; an honest frame, never a placeholder line.
 * - "loading": a skeleton in the chart's footprint.
 * - "example": clearly badged example data for development previews only.
 */
export type ChartStatus = "ready" | "empty" | "loading" | "example";

export interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Headline figure, e.g. <ChartHeadline value="$48,210" delta={{ value: 8.2 }} />. */
  metric?: ReactNode;
  /**
   * Card-scoped actions, e.g. a "Details" link or a measure switch. Filters
   * that scope data (period, store) belong in one row above the cards.
   */
  actions?: ReactNode;
  status?: ChartStatus | undefined;
  /** Copy for the empty state. Defaults to "Not collecting yet". */
  empty?: Omit<ChartEmptyProps, "height"> | undefined;
  /** Footer note, e.g. "Updated 5 minutes ago". */
  footer?: ReactNode;
  /** Offer the table twin. Default true (hidden while empty or loading). */
  tableToggle?: boolean | undefined;
  /** Start in table view (e.g. for a table-first layout). */
  defaultView?: ChartView | undefined;
  /** Chart height, used for the empty and loading frames. Default 240. */
  height?: number | undefined;
  /** Heading level for the title. Default "h3". */
  titleAs?: "h2" | "h3" | "h4" | undefined;
  className?: string | undefined;
  /** The chart. Storevia charts switch to their table twin automatically. */
  children?: ReactNode;
}

export function ChartCard({
  title,
  description,
  metric,
  actions,
  status = "ready",
  empty,
  footer,
  tableToggle = true,
  defaultView = "chart",
  height = 240,
  titleAs = "h3",
  className,
  children,
}: ChartCardProps) {
  const [view, setView] = useState<ChartView>(defaultView);
  const titleId = useId();
  const hasData = status === "ready" || status === "example";
  const showToggle = tableToggle && hasData;
  const tableView = showToggle && view === "table";
  // The shared marker KPI tiles and previews use, at the end of the title row.
  const example = status === "example" ? <ExampleDataBadge /> : null;

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cardClasses("default", cn("flex flex-col", className))}
    >
      <CardHeader
        divider={false}
        titleAs={titleAs}
        title={<span id={titleId}>{title}</span>}
        description={description}
        actions={
          example || actions ? (
            <>
              {example}
              {actions}
            </>
          ) : undefined
        }
      />

      {metric && hasData ? <div className="px-5 pt-4 sm:px-6">{metric}</div> : null}
      {status === "loading" ? (
        <div aria-hidden="true" className="px-5 pt-4 sm:px-6">
          <span className="sv-chart-shimmer block h-8 w-36 rounded-sm" />
        </div>
      ) : null}

      <div className={cn("flex-1", tableView ? "pt-5" : "px-5 pt-6 pb-5 sm:px-6")}>
        {status === "loading" ? (
          <ChartSkeleton height={height} />
        ) : status === "empty" ? (
          <ChartEmpty height={height} {...empty} />
        ) : (
          <ChartViewContext value={tableView ? "table" : "chart"}>{children}</ChartViewContext>
        )}
      </div>

      {showToggle || footer ? (
        <CardFooter className="min-h-11 flex-nowrap justify-between gap-3 py-1.5">
          <div className="min-w-0 flex-1 text-caption text-ink-faint">{footer}</div>
          {showToggle ? (
            // The label names the view it switches to, so it carries no
            // aria-pressed ("View as chart, pressed" would contradict itself).
            <button
              type="button"
              onClick={() => {
                setView(tableView ? "chart" : "table");
              }}
              className="relative -mr-2 inline-flex h-8 shrink-0 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-[7px] items-center gap-1.5 rounded-sm px-2 text-caption font-medium text-ink-muted transition-colors duration-(--duration-fast) ease-standard hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Icon icon={tableView ? ChartLine : Table2} size="sm" />
              {tableView ? "View as chart" : "View as table"}
            </button>
          ) : null}
        </CardFooter>
      ) : null}
    </section>
  );
}
