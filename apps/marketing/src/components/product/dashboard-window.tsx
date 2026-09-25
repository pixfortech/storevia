// The merchant dashboard as a product mockup, built from the real components
// (KpiCard, Sparkline, AreaChart, Avatar, Button) and the real navigation for
// the business type (the same resolver the dashboard uses). The layout
// responds to the window's own width, not the viewport's, so the mockup reads
// the same in a hero collage, a split row or a full-width section.
import {
  BUSINESS_TYPE_DEFINITIONS,
  storeNavigation,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { ROLE_PERMISSIONS } from "@storevia/tenancy/rbac";
import {
  AreaChart,
  Avatar,
  Button,
  ButtonGroup,
  ChartHeadline,
  cn,
  Icon,
  Kbd,
  KpiCard,
  Logo,
  Sparkline,
} from "@storevia/ui";
import { ChevronRight, ChevronsUpDown, Plus, Search } from "lucide-react";
import { AREA_ICONS } from "./area-icons";
import { Mockup, WindowFrame } from "./frame";
import {
  exampleDates,
  SAMPLE_ACTIVITY,
  SAMPLE_DASHBOARDS,
  SAMPLE_ORGANISATION,
  SAMPLE_PERSON,
  type SampleDashboard,
} from "./sample-data";

// Every area the owner sees; the mockup shows the full navigation for the type.
const everything = () => true;

function Sidebar({ type, store }: { type: BusinessType; store: string }) {
  const nav = storeNavigation(type, ROLE_PERMISSIONS.OWNER, everything);
  return (
    <div className="hidden w-[12.5rem] shrink-0 flex-col border-r border-line bg-surface px-3 py-3.5 @xl/dash:flex">
      <div className="px-1.5">
        <Logo size="sm" />
      </div>
      <div className="mt-4 flex items-center gap-2.5 rounded-control border border-line px-2 py-1.5">
        <Avatar name={store} shape="square" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] leading-tight font-semibold text-ink">
            {store}
          </span>
          <span className="block truncate text-[11px] leading-tight text-ink-faint">
            {BUSINESS_TYPE_DEFINITIONS[type].label}
          </span>
        </span>
        <Icon icon={ChevronsUpDown} size="xs" className="text-ink-faint" />
      </div>
      <ul className="mt-4 space-y-px">
        {nav.map((item, index) => (
          <li
            key={item.key}
            className={cn(
              "relative flex h-8 items-center gap-2.5 rounded-sm px-2 text-[12.5px]",
              index === 0 ? "bg-subtle font-medium text-ink" : "text-ink-muted",
            )}
          >
            {index === 0 ? (
              <span className="absolute inset-y-1.5 -left-3 w-0.5 rounded-pill bg-brand-600" />
            ) : null}
            <Icon
              icon={AREA_ICONS[item.key]}
              size="sm"
              className={index === 0 ? "text-brand-600" : "text-ink-faint"}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-1.5 pt-3">
        <Avatar name={SAMPLE_PERSON.name} size="sm" />
        <span className="min-w-0 truncate text-[12px] font-medium text-ink">
          {SAMPLE_PERSON.name}
        </span>
      </div>
    </div>
  );
}

function TopBar({ sample }: { sample: SampleDashboard }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
        {/* The organisation steps aside while the search box needs the room. */}
        <span className="hidden truncate text-ink-muted @2xl/dash:inline @3xl/dash:hidden @4xl/dash:inline">
          {SAMPLE_ORGANISATION}
        </span>
        <Icon
          icon={ChevronRight}
          size="xs"
          className="hidden text-neutral-400 @2xl/dash:inline @3xl/dash:hidden @4xl/dash:inline"
        />
        <span className="truncate font-medium text-ink">{sample.store}</span>
      </span>
      <span className="ml-auto hidden h-8 w-48 shrink-0 items-center gap-2 rounded-control border border-line-strong bg-surface px-2.5 text-[12px] whitespace-nowrap text-ink-faint @3xl/dash:flex">
        <Icon icon={Search} size="xs" />
        Search or jump to…
        <Kbd className="ml-auto">⌘K</Kbd>
      </span>
      <Button size="sm" leadingIcon={Plus} className="ml-auto @3xl/dash:ml-0">
        {sample.action}
      </Button>
    </div>
  );
}

function Period() {
  return (
    <ButtonGroup aria-label="Period" className="hidden @3xl/dash:inline-flex">
      {["7 days", "30 days", "90 days"].map((label) => (
        <Button
          key={label}
          size="sm"
          variant="secondary"
          aria-pressed={label === "30 days"}
          className={cn(
            "h-7 px-2.5 text-[12px]",
            label === "30 days" ? "bg-subtle text-ink" : "text-ink-muted",
          )}
        >
          {label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

// Third and fourth tiles appear as the window widens.
const KPI_VISIBILITY = ["", "", "hidden @3xl/dash:block", "hidden @4xl/dash:block"];

function Kpis({ sample }: { sample: SampleDashboard }) {
  return (
    <div className="grid grid-cols-2 gap-3 @3xl/dash:grid-cols-3 @4xl/dash:grid-cols-4">
      {sample.kpis.map((kpi, index) => (
        <KpiCard
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          delta={{ value: kpi.delta, ...(kpi.deltaLabel ? { label: kpi.deltaLabel } : {}) }}
          sparkline={<Sparkline data={kpi.trend} height={28} decorative />}
          className={cn("min-w-0 p-3.5 sm:p-4", KPI_VISIBILITY[index])}
        />
      ))}
    </div>
  );
}

function SalesChart({ sample, height }: { sample: SampleDashboard; height: number }) {
  const dates = exampleDates(sample.chart.data.length);
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[13px] font-semibold text-ink">{sample.chart.title}</p>
          <p className="text-[11.5px] text-ink-faint">Last 30 days</p>
        </div>
      </div>
      <ChartHeadline
        className="mt-2"
        value={sample.chart.headline}
        delta={{ value: sample.chart.delta }}
        comparison="vs previous period"
      />
      <AreaChart
        className="mt-3"
        height={height}
        series={[
          {
            id: "current",
            label: sample.chart.title,
            data: sample.chart.data.map((y, i) => ({ x: dates[i] ?? i, y })),
          },
        ]}
        valueFormat={sample.chart.format}
        curve="monotone"
        legend={false}
        label={`${sample.chart.title}, last 30 days (example data)`}
      />
    </div>
  );
}

function RankedList({ sample }: { sample: SampleDashboard }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface p-4">
      <p className="font-display text-[13px] font-semibold text-ink">{sample.list.title}</p>
      <ol className="mt-3 divide-y divide-line">
        {sample.list.rows.map((row, index) => (
          <li key={row.label} className="flex items-center gap-3 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-subtle text-[11px] font-medium text-ink-faint tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink">{row.label}</span>
              <span className="block truncate text-[11px] text-ink-faint">{row.detail}</span>
            </span>
            <span className="text-[12.5px] font-medium text-ink tabular-nums">{row.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Activity() {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface p-4">
      <p className="font-display text-[13px] font-semibold text-ink">Recent activity</p>
      <ul className="mt-3 space-y-3">
        {SAMPLE_ACTIVITY.map((entry) => (
          <li key={`${entry.person}-${entry.subject}`} className="flex gap-2.5">
            <Avatar name={entry.person} size="xs" className="mt-0.5" />
            <span className="min-w-0 text-[12px] leading-snug text-ink-muted">
              <span className="font-medium text-ink">{entry.person}</span> {entry.action}{" "}
              <span className="text-ink">{entry.subject}</span>
              <span className="block text-[11px] text-ink-faint">{entry.when}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface DashboardWindowProps {
  /** Business type: sets the navigation, the figures and the lists. Default ECOMMERCE. */
  type?: BusinessType;
  /** hero: figures and the main chart · full: adds the ranked list and activity, for a section of its own. */
  variant?: "hero" | "full";
  className?: string;
  /** Accessible name for the whole mockup. */
  label?: string;
}

/**
 * The Storevia dashboard for a business type, with illustrative example
 * figures. Give it a height (it crops its content like a real window).
 */
export function DashboardWindow({
  type = "ECOMMERCE",
  variant = "hero",
  className,
  label,
}: DashboardWindowProps) {
  const sample = SAMPLE_DASHBOARDS[type];
  const definition = BUSINESS_TYPE_DEFINITIONS[type];
  const full = variant === "full";
  return (
    <Mockup
      label={
        label ??
        `Illustration: the Storevia dashboard for ${definition.label.toLowerCase()}, with example figures.`
      }
      className={className}
    >
      <WindowFrame className="h-full">
        <div className="@container/dash flex h-full min-h-0">
          <Sidebar type={type} store={sample.store} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar sample={sample} />
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-4 @2xl/dash:p-5">
              <div className="flex items-end justify-between gap-3 pb-1">
                <div className="min-w-0">
                  <p className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-ink @2xl/dash:text-[19px]">
                    Good morning, {SAMPLE_PERSON.firstName}
                  </p>
                  <p className="truncate text-[12px] text-ink-muted">
                    Here&apos;s how {sample.store} is doing.
                  </p>
                </div>
                <Period />
              </div>
              <Kpis sample={sample} />
              {/* The chart, then the ranked list and (full) the activity feed as room allows. */}
              <div
                className={cn(
                  "grid gap-3",
                  full
                    ? "@4xl/dash:grid-cols-[minmax(0,1fr)_16rem] @5xl/dash:grid-cols-[minmax(0,1fr)_15rem_15rem]"
                    : "@5xl/dash:grid-cols-[minmax(0,1fr)_16rem]",
                )}
              >
                <SalesChart sample={sample} height={full ? 220 : 168} />
                <div className={cn(full ? "hidden @4xl/dash:block" : "hidden @5xl/dash:block")}>
                  <RankedList sample={sample} />
                </div>
                {full ? (
                  <div className="hidden @5xl/dash:block">
                    <Activity />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </WindowFrame>
    </Mockup>
  );
}
