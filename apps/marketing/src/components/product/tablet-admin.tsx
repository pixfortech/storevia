// The dashboard on a tablet: the icon rail the product ships at 768–1023 px,
// a two-column figure grid and a full-width chart, with the business type's
// example figures.
import {
  BUSINESS_TYPE_DEFINITIONS,
  storeNavigation,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { ROLE_PERMISSIONS } from "@storevia/tenancy/rbac";
import { Avatar, cn, Icon, LogoMark, Sparkline } from "@storevia/ui";
import { ArrowUpRight, Menu, Minus, Search } from "lucide-react";
import { AREA_ICONS } from "./area-icons";
import { Mockup, TabletFrame } from "./frame";
import { SAMPLE_DASHBOARDS, SAMPLE_PERSON } from "./sample-data";

const everything = () => true;

export function TabletAdmin({
  type = "ECOMMERCE",
  className,
}: {
  type?: BusinessType;
  className?: string;
}) {
  const sample = SAMPLE_DASHBOARDS[type];
  const nav = storeNavigation(type, ROLE_PERMISSIONS.OWNER, everything).slice(0, 7);
  return (
    <Mockup
      label={`Illustration: the Storevia dashboard on a tablet for ${BUSINESS_TYPE_DEFINITIONS[type].label.toLowerCase()}, with an icon rail and example figures.`}
      className={className}
    >
      <TabletFrame>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2.5">
            <LogoMark size={16} className="mb-2" />
            {nav.map((item, index) => (
              <span
                key={item.key}
                className={cn(
                  "flex size-7 items-center justify-center rounded-sm",
                  index === 0 ? "bg-subtle text-brand-600" : "text-ink-faint",
                )}
              >
                <Icon icon={AREA_ICONS[item.key]} size="xs" />
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
              <Icon icon={Menu} size="xs" className="text-ink-faint" />
              <span className="truncate text-[10.5px] font-semibold text-ink">{sample.store}</span>
              <span className="ml-auto flex h-5.5 w-24 items-center gap-1 rounded-sm border border-line-strong px-1.5 text-[9px] text-ink-faint">
                <Icon icon={Search} size="xs" className="size-2.5" />
                Search
              </span>
              <Avatar name={SAMPLE_PERSON.name} size="xs" className="size-5 text-[8px]" />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-hidden bg-surface-sunken p-2.5">
              <p className="px-0.5 font-display text-[12px] font-semibold text-ink">
                Good morning, {SAMPLE_PERSON.firstName}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {sample.kpis.map((kpi) => (
                  <div key={kpi.label} className="rounded-sm border border-line bg-surface p-2">
                    <p className="truncate text-[8.5px] font-medium text-ink-muted">{kpi.label}</p>
                    <div className="mt-0.5 flex items-end justify-between gap-2">
                      <p className="font-display text-[13px] font-semibold tracking-[-0.02em] text-ink tabular-nums">
                        {kpi.value}
                      </p>
                      <span
                        className={cn(
                          "flex items-center text-[8.5px] font-medium tabular-nums",
                          kpi.delta > 0 ? "text-success-700" : "text-ink-muted",
                        )}
                      >
                        <Icon
                          icon={kpi.delta > 0 ? ArrowUpRight : Minus}
                          size="xs"
                          className="size-2.5"
                        />
                        {kpi.delta > 0 ? (kpi.deltaLabel ?? `${String(kpi.delta)}%`) : "0%"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-sm border border-line bg-surface p-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-[9.5px] font-semibold text-ink">{sample.chart.title}</p>
                  <p className="text-[9.5px] font-semibold text-ink tabular-nums">
                    {sample.chart.headline}
                  </p>
                </div>
                <Sparkline data={sample.chart.data} height={48} area decorative className="mt-1" />
              </div>
            </div>
          </div>
        </div>
      </TabletFrame>
    </Mockup>
  );
}
