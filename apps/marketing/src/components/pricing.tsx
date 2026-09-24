// Pricing from the plan catalogue (ADR-0025). Every number and name comes
// from the database; this file only lays it out.
import type { EntitlementValue } from "@storevia/entitlements";
import type { PublicCatalogue } from "@storevia/entitlements/catalogue";
import { formatEntitlement } from "@storevia/entitlements/format";
import type { FeatureKey } from "@storevia/entitlements/features";
import { buttonClasses, cn, ICON_STROKE } from "@storevia/ui";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { FEATURE_GROUPS, FEATURE_STATUS, HEADLINE_FEATURES } from "@/content/plan-features";
import { formatPrice } from "@/lib/money";
import { StatusBadge } from "./status-badge";

interface Column {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly values: Readonly<Record<FeatureKey, EntitlementValue>>;
  readonly price: { primary: string; secondary?: string | undefined };
  readonly cta: { label: string; href: string; external: boolean };
  readonly featured: boolean;
}

function columns(catalogue: PublicCatalogue, signUpHref: string): Column[] {
  const free: Column = {
    id: "free",
    name: "Free",
    description: "Start building with one store, on your own.",
    values: catalogue.freeAllowance,
    price: { primary: "Free" },
    cta: { label: "Start free", href: signUpHref, external: true },
    featured: false,
  };
  const plans = catalogue.plans.map((plan, index): Column => {
    const monthly = plan.prices.find((p) => p.interval === "MONTH");
    const yearly = plan.prices.find((p) => p.interval === "YEAR");
    return {
      id: plan.key,
      name: plan.name,
      description: plan.description ?? "",
      values: plan.values,
      price: monthly
        ? {
            primary: formatPrice(monthly.amount, monthly.currency),
            secondary: yearly
              ? `per month, or ${formatPrice(yearly.amount, yearly.currency)} per year`
              : "per month",
          }
        : { primary: "Custom", secondary: "Priced by agreement" },
      cta: {
        label: "Talk to us",
        href: `/contact?topic=plans&plan=${encodeURIComponent(plan.name)}`,
        external: false,
      },
      // The middle paid plan carries the emphasis, whatever it's called.
      featured:
        catalogue.plans.length > 1 && index === Math.floor((catalogue.plans.length - 1) / 2),
    };
  });
  return [free, ...plans];
}

function Value({ featureKey, value }: { featureKey: FeatureKey; value: EntitlementValue }) {
  const label = formatEntitlement(featureKey, value);
  if (label === null) {
    return (
      <>
        <Minus
          aria-hidden="true"
          strokeWidth={ICON_STROKE}
          className="mx-auto size-4 text-ink-faint"
        />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  if (label === "Included") {
    return (
      <>
        <Check aria-hidden="true" strokeWidth={2} className="mx-auto size-4 text-brand-600" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  return <span className="tabular">{label}</span>;
}

function CtaLink({ cta, featured }: { cta: Column["cta"]; featured: boolean }) {
  const className = buttonClasses(featured ? "primary" : "secondary", "md", "w-full");
  return cta.external ? (
    <a href={cta.href} className={className}>
      {cta.label}
    </a>
  ) : (
    <Link href={cta.href} className={className}>
      {cta.label}
    </Link>
  );
}

export function PlanCards({
  catalogue,
  signUpHref,
}: {
  catalogue: PublicCatalogue;
  signUpHref: string;
}) {
  const cols = columns(catalogue, signUpHref);
  const names = new Map(catalogue.features.map((f) => [f.key, f.name]));
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="plan-cards">
      {cols.map((col) => (
        <li
          key={col.id}
          data-testid={`plan-${col.id}`}
          className={cn(
            "flex flex-col rounded-panel border bg-surface p-6 shadow-card",
            col.featured ? "border-brand-600 ring-1 ring-brand-600" : "border-line",
          )}
        >
          <div className="flex min-h-7 items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-ink">{col.name}</h3>
            {col.featured ? (
              <span className="whitespace-nowrap rounded-pill bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                For growing teams
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 min-h-15 text-sm text-ink-muted">{col.description}</p>
          <p className="mt-5">
            <span className="text-4xl font-semibold tracking-tight text-ink tabular">
              {col.price.primary}
            </span>
          </p>
          <p className="mt-1 min-h-5 text-sm text-ink-muted">{col.price.secondary}</p>
          <div className="mt-6">
            <CtaLink cta={col.cta} featured={col.featured} />
          </div>
          <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
            {HEADLINE_FEATURES.map((key) => {
              const label = formatEntitlement(key, col.values[key]);
              return (
                <li key={key} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-muted">{names.get(key) ?? key}</span>
                  <span className="text-right font-medium text-ink tabular">
                    {label ?? "Not included"}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Full comparison: a table from tablet up, one list per plan on phones. */
export function ComparisonTable({
  catalogue,
  signUpHref,
}: {
  catalogue: PublicCatalogue;
  signUpHref: string;
}) {
  const cols = columns(catalogue, signUpHref);
  const features = new Map(catalogue.features.map((f) => [f.key, f]));
  const groups = FEATURE_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter((key) => features.has(key)),
  }));
  return (
    <>
      <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface md:block">
        <table className="w-full min-w-[720px] text-sm" data-testid="comparison-table">
          <caption className="sr-only">Plan comparison</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-[34%] px-5 py-4 text-left font-medium text-ink-muted">
                Feature
              </th>
              {cols.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className="px-4 py-4 text-center font-semibold text-ink"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.title} className="border-b border-line last:border-b-0">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={cols.length + 1}
                  className="bg-canvas px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint"
                >
                  {group.title}
                </th>
              </tr>
              {group.keys.map((key) => {
                const feature = features.get(key);
                return (
                  <tr key={key} className="border-t border-line first:border-t-0">
                    <th scope="row" className="px-5 py-3.5 text-left font-normal">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{feature?.name}</span>
                        {FEATURE_STATUS[key] !== "available" ? (
                          <StatusBadge status={FEATURE_STATUS[key]} />
                        ) : null}
                      </span>
                      {feature?.description ? (
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {feature.description}
                        </span>
                      ) : null}
                    </th>
                    {cols.map((col) => (
                      <td key={col.id} className="px-4 py-3.5 text-center text-ink">
                        <Value featureKey={key} value={col.values[key]} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {cols.map((col) => (
          <details
            key={col.id}
            className="group rounded-card border border-line bg-surface open:shadow-card"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-semibold text-ink">
              {col.name}: every feature
              <span
                aria-hidden="true"
                className="text-ink-faint transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="border-t border-line px-4 pb-2">
              {groups.map((group) => (
                <div key={group.title} className="pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {group.title}
                  </p>
                  <dl className="mt-1 divide-y divide-line">
                    {group.keys.map((key) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-4 py-2.5 text-sm"
                      >
                        <dt className="text-ink-muted">
                          {features.get(key)?.name}
                          {FEATURE_STATUS[key] !== "available" ? (
                            <span className="block text-xs text-ink-faint">
                              {FEATURE_STATUS[key] === "in-development"
                                ? "In development"
                                : "On the roadmap"}
                            </span>
                          ) : null}
                        </dt>
                        <dd className="shrink-0 text-right font-medium text-ink">
                          <Value featureKey={key} value={col.values[key]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
