// The plan cards: Free, then every public plan, straight from the catalogue
// (lib/pricing.ts). Each card carries its monthly and yearly price; the
// IntervalSwitch around them decides which one shows. No card is singled out
// as recommended (the catalogue has no such flag), and paid plans lead to a
// conversation because there is no checkout.
import { buttonClasses, cn, Icon } from "@storevia/ui";
import { Check } from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "@/content/capabilities";
import type { Interval, PlanFeatureValue, PriceView, PricingColumn } from "@/lib/pricing";

// Literal class names (Tailwind reads them verbatim): which price view shows
// for the interval on the IntervalSwitch wrapper. Monthly until it says yearly.
const SHOW: Record<Interval, string> = {
  month: "group-data-[interval=year]/pricing:hidden",
  year: "hidden group-data-[interval=year]/pricing:block",
};

function Price({ view, className }: { view: PriceView; className?: string }) {
  return (
    <div className={className}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-metric-lg text-ink tabular-nums">{view.amount}</span>
        <span className="text-body-sm text-ink-muted">{view.note}</span>
      </p>
      {view.saving ? <p className="mt-2 text-caption text-success-700">{view.saving}</p> : null}
    </div>
  );
}

function Prices({ column }: { column: PricingColumn }) {
  const { month, year } = column.price;
  const same =
    month.amount === year.amount && month.note === year.note && month.saving === year.saving;
  if (same) return <Price view={month} />;
  return (
    <>
      <Price view={month} className={SHOW.month} />
      <Price view={year} className={SHOW.year} />
    </>
  );
}

function Cta({ column }: { column: PricingColumn }) {
  const className = buttonClasses(column.paid ? "secondary" : "primary", "md", "w-full");
  return column.cta.external ? (
    <a href={column.cta.href} className={className}>
      {column.cta.label}
    </a>
  ) : (
    <Link href={column.cta.href} className={className}>
      {column.cta.label}
    </Link>
  );
}

function Highlight({ item }: { item: PlanFeatureValue }) {
  return (
    <li className="flex gap-2.5">
      <Icon icon={Check} size="sm" className="mt-0.5 text-brand-600" />
      <span className="min-w-0">
        <span className="text-ink">
          {item.name}
          {item.value && item.value !== "Included" ? (
            <span className="text-ink-muted">: {item.value}</span>
          ) : null}
        </span>
        {item.status ? (
          <span className="block text-caption text-ink-faint">{STATUS_LABELS[item.status]}</span>
        ) : null}
      </span>
    </li>
  );
}

export function PlanCards({ columns }: { columns: readonly PricingColumn[] }) {
  return (
    // Each card spans five rows of a shared subgrid, so names, prices, buttons
    // and lists line up across a row of cards whatever their text length.
    <ul
      data-testid="plan-cards"
      className="grid gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6 xl:grid-cols-4"
    >
      {columns.map((column) => (
        <li
          key={column.id}
          data-testid={`plan-${column.id}`}
          className={cn(
            "flex flex-col rounded-panel border border-line bg-surface shadow-card",
            "sm:row-span-5 sm:grid sm:grid-rows-subgrid sm:gap-y-0",
          )}
        >
          <div className="px-6 pt-6">
            <h3 className="font-display text-h4 text-ink">{column.name}</h3>
            <p className="mt-1.5 text-body-sm text-ink-muted">{column.description}</p>
          </div>
          <div className="px-6 pt-6">
            <Prices column={column} />
          </div>
          <div className="px-6 pt-6 pb-6">
            <Cta column={column} />
            <p className="mt-3 min-h-[1lh] text-center text-caption text-ink-faint">
              {column.trialDays > 0
                ? `${String(column.trialDays)}-day trial, arranged with our team`
                : column.paid
                  ? ""
                  : "No card needed"}
            </p>
          </div>
          <div className="border-t border-line px-6 py-5">
            <p className="text-overline text-ink-faint uppercase">Limits</p>
            <dl className="mt-3 space-y-2.5 text-body-sm">
              {column.limits.map((limit) => (
                <div key={limit.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">{limit.name}</dt>
                  <dd className="text-right font-medium text-ink tabular-nums">
                    {limit.value ?? "Not included"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="border-t border-line px-6 pt-5 pb-6">
            <p className="text-overline text-ink-faint uppercase">
              {column.buildsOn ? `Everything in ${column.buildsOn}, plus` : "Includes"}
            </p>
            {column.highlights.length > 0 ? (
              <ul className="mt-3 space-y-3 text-body-sm">
                {column.highlights.map((item) => (
                  <Highlight key={item.key} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-body-sm text-ink-muted">Higher limits, same features.</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
