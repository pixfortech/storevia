// The dashboard on a phone: the app layout the product ships (compact top
// bar, a 2 × 2 figure grid, cards instead of tables and the bottom bar with
// the centre Create button), filled with the business type's example
// figures. Sized by its width.
import {
  BUSINESS_TYPE_DEFINITIONS,
  STORE_AREAS,
  type AreaKey,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { Sparkline } from "@storevia/ui/charts";
import { cn } from "@storevia/ui/cn";
import { Icon, LogoMark } from "@storevia/ui/icons";
import { Avatar } from "@storevia/ui/surfaces";
import { ArrowUpRight, ChevronDown, Ellipsis, Minus, Plus } from "lucide-react";
import { AREA_ICONS } from "./area-icons";
import { Mockup, PhoneFrame } from "./frame";
import { mobileTabs } from "./mobile-tabs";
import { SAMPLE_DASHBOARDS, SAMPLE_PERSON } from "./sample-data";

function Tab({ area, active = false }: { area: AreaKey; active?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-1 text-[9.5px] font-medium",
        active ? "text-brand-700" : "text-ink-muted",
      )}
    >
      {active ? (
        <span className="absolute top-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-b-pill bg-brand-600" />
      ) : null}
      <Icon
        icon={AREA_ICONS[area]}
        size={18}
        className={active ? "text-brand-600" : "text-ink-faint"}
      />
      {STORE_AREAS[area].label}
    </span>
  );
}

export interface PhoneAdminProps {
  type?: BusinessType;
  className?: string;
  /** Accessible name for the whole mockup. */
  label?: string;
}

export function PhoneAdmin({ type = "ECOMMERCE", className, label }: PhoneAdminProps) {
  const sample = SAMPLE_DASHBOARDS[type];
  const tabs = mobileTabs(type);
  return (
    <Mockup
      label={
        label ??
        `Illustration: the Storevia dashboard on a phone for ${BUSINESS_TYPE_DEFINITIONS[type].label.toLowerCase()}, with example figures and the bottom navigation bar.`
      }
      className={className}
    >
      <PhoneFrame>
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3.5">
          <LogoMark size={16} />
          <span className="flex min-w-0 items-center gap-1 text-[11.5px] font-semibold text-ink">
            <span className="truncate">{sample.store}</span>
            <Icon icon={ChevronDown} size="xs" className="size-3 text-ink-faint" />
          </span>
          <Avatar name={SAMPLE_PERSON.name} size="xs" className="ml-auto" />
        </div>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden bg-surface-sunken px-3 pt-3">
          <div className="px-0.5">
            <p className="font-display text-[14px] font-semibold tracking-[-0.01em] text-ink">
              Good morning, {SAMPLE_PERSON.firstName}
            </p>
            <p className="text-[10.5px] text-ink-muted">Last 30 days</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {sample.kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-control border border-line bg-surface p-2.5">
                <p className="truncate text-[9.5px] font-medium text-ink-muted">{kpi.label}</p>
                <p className="mt-0.5 truncate font-display text-[14px] font-semibold tracking-[-0.02em] text-ink tabular-nums">
                  {kpi.value}
                </p>
                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-0.5 text-[9.5px] font-medium tabular-nums",
                    kpi.delta > 0 ? "text-success-700" : "text-ink-muted",
                  )}
                >
                  <Icon
                    icon={kpi.delta > 0 ? ArrowUpRight : Minus}
                    size="xs"
                    className="size-2.5"
                  />
                  {kpi.delta > 0 ? (kpi.deltaLabel ?? `${String(kpi.delta)}%`) : "No change"}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-control border border-line bg-surface p-2.5">
            <div className="flex items-baseline justify-between">
              <p className="text-[10.5px] font-semibold text-ink">{sample.chart.title}</p>
              <p className="text-[10.5px] font-semibold text-ink tabular-nums">
                {sample.chart.headline}
              </p>
            </div>
            <Sparkline data={sample.chart.data} height={44} area decorative className="mt-1.5" />
          </div>
          <div className="rounded-control border border-line bg-surface px-2.5 py-1">
            {sample.list.rows.slice(0, 3).map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-2 border-b border-line py-1.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10.5px] font-medium text-ink">
                    {row.label}
                  </span>
                  <span className="block truncate text-[9.5px] text-ink-faint">{row.detail}</span>
                </span>
                <span className="text-[10.5px] font-medium text-ink tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-14 shrink-0 items-stretch border-t border-line bg-surface px-1 pb-1.5">
          {tabs.start.map((area, index) => (
            <Tab key={area} area={area} active={index === 0} />
          ))}
          <span className="flex flex-1 items-center justify-center">
            <span className="flex size-9 items-center justify-center rounded-control bg-brand-600 text-white">
              <Icon icon={Plus} size={18} strokeWidth={2} />
            </span>
          </span>
          {tabs.end.map((area) => (
            <Tab key={area} area={area} />
          ))}
          <span className="flex flex-1 flex-col items-center justify-center gap-1 text-[9.5px] font-medium text-ink-muted">
            <Icon icon={Ellipsis} size={18} className="text-ink-faint" />
            More
          </span>
        </div>
      </PhoneFrame>
    </Mockup>
  );
}
