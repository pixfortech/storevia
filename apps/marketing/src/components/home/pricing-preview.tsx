// 13 Pricing preview: plan cards and a short comparison, built from the same
// view of the public plan catalogue as /pricing (lib/pricing.ts), so the two
// can't drift. No plan is singled out (the catalogue has no such flag), and
// no checkout exists, so paid plans lead to a conversation. If the catalogue
// can't be read, the section says so rather than showing invented prices.
import type { PublicCatalogue } from "@storevia/entitlements/catalogue";
import type { FeatureKey } from "@storevia/entitlements/features";
import { Alert, buttonClasses, Icon, Stagger } from "@storevia/ui";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { ArrowLink, Section, SectionHeading, StatusPill } from "@/components/marketing";
import { comparison, pricing, type PricingColumn } from "@/lib/pricing";

/** The comparison rows the preview shows: one per group, mostly not available yet. */
const PREVIEW_FEATURES: readonly FeatureKey[] = [
  "custom_domain",
  "visual_builder",
  "analytics",
  "advanced_permissions",
  "priority_support",
];

function PlanCta({ column }: { column: PricingColumn }) {
  // Same emphasis as /pricing: the free sign-up is the primary action.
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

function Value({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <>
        <Icon icon={Minus} size="sm" className="text-neutral-400" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  if (value === "Included") {
    return (
      <>
        <Icon icon={Check} size="sm" className="text-brand-600" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

export function PricingPreview({
  catalogue,
  signUpHref,
}: {
  catalogue: PublicCatalogue | null;
  signUpHref: string;
}) {
  const view = catalogue ? pricing(catalogue, signUpHref) : null;
  const byKey = new Map(
    (catalogue ? comparison(catalogue) : []).flatMap((group) =>
      group.rows.map((row) => [row.key, row] as const),
    ),
  );
  const rows = PREVIEW_FEATURES.flatMap((key) => {
    const row = byKey.get(key);
    return row ? [row] : [];
  });
  return (
    <Section labelledBy="pricing-heading">
      <SectionHeading
        id="pricing-heading"
        eyebrow="Pricing"
        title="Start free, and grow when you’re ready"
        lead="Every plan covers all the stores in your organisation. Paid plans are set up with our team; online checkout isn’t available yet."
        align="center"
        className="max-w-3xl"
      />
      {view ? (
        <>
          <Stagger
            as="ul"
            itemAs="li"
            className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 xl:grid-cols-4"
            itemClassName="flex"
          >
            {view.columns.map((column) => (
              <article
                key={column.id}
                aria-labelledby={`plan-${column.id}`}
                className="flex w-full flex-col rounded-panel border border-line bg-surface p-6"
              >
                <h3 id={`plan-${column.id}`} className="font-display text-h4 text-ink">
                  {column.name}
                </h3>
                <p className="mt-1.5 text-body-sm text-ink-muted sm:min-h-[3lh]">
                  {column.description}
                </p>
                {/* Room for a price that wraps ("Custom" over its note), so the
                    buttons below line up across the row. */}
                <p className="mt-6 flex flex-wrap content-start items-baseline gap-x-2 gap-y-1 sm:min-h-19">
                  <span className="font-display text-metric-lg text-ink tabular-nums">
                    {column.price.month.amount}
                  </span>
                  <span className="text-body-sm text-ink-muted">{column.price.month.note}</span>
                </p>
                <div className="mt-6">
                  <PlanCta column={column} />
                </div>
                <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-body-sm">
                  {column.limits.map((limit) => (
                    <div key={limit.key} className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink-muted">{limit.name}</dt>
                      <dd className="text-right font-medium text-ink tabular-nums">
                        {limit.value ?? "Not included"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </Stagger>
          {view.hasYearly ? (
            <p className="mt-4 text-center text-caption text-ink-faint">
              Monthly prices shown. Yearly prices are on the pricing page.
            </p>
          ) : null}
          {rows.length > 0 ? (
            <div className="mt-8 hidden overflow-hidden rounded-panel border border-line md:block">
              <table className="w-full table-fixed text-left text-table">
                <caption className="border-b border-line px-6 py-4 text-left">
                  <span className="font-display text-body font-semibold text-ink">
                    A few differences between plans
                  </span>
                  <span className="ml-2 text-caption text-ink-faint">
                    Features that aren’t available yet are marked.
                  </span>
                </caption>
                <thead>
                  <tr className="border-b border-line bg-surface-sunken text-caption text-ink-faint">
                    <th scope="col" className="w-[34%] px-6 py-2.5 font-medium">
                      Feature
                    </th>
                    {view.columns.map((column) => (
                      <th key={column.id} scope="col" className="px-4 py-2.5 font-medium">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-6 py-3.5 font-medium text-ink">
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          {row.name}
                          {row.status ? <StatusPill status={row.status} /> : null}
                        </span>
                      </th>
                      {row.values.map((value, index) => (
                        <td
                          key={view.columns[index]?.id ?? index}
                          className="px-4 py-3.5 text-ink [&_svg]:inline-block"
                        >
                          <Value value={value} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="mt-8 text-center">
            <ArrowLink href="/pricing">Compare every feature</ArrowLink>
          </p>
        </>
      ) : (
        <Alert
          tone="info"
          title="Plan details are temporarily unavailable"
          className="mx-auto mt-12 max-w-xl"
        >
          Please try again shortly, or{" "}
          <Link href="/contact?topic=plans" className="font-medium underline">
            talk to us
          </Link>
          .
        </Alert>
      )}
    </Section>
  );
}
