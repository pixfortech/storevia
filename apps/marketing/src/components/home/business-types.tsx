// 05 Business types: one panel per type, each with its line scene and what
// it's for. Only the launch type (the online store) is offered today, with
// what Storevia adapts for it; the others are marked On the roadmap and make
// no promises. Straight from the domain's business-type definitions.
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { BusinessScene } from "@storevia/ui/illustrations";
import { Stagger } from "@storevia/ui/motion";
import { ArrowLink, Section, SectionHeading, StatusPill } from "@/components/marketing";
import { BUSINESS_TYPE_ANCHOR, BUSINESS_TYPE_STATUS } from "@/content/business-types";

const LINK_LABEL = {
  ECOMMERCE: "Explore online stores",
  BUSINESS: "What's planned",
  PUBLISHING: "What's planned",
  PORTFOLIO: "What's planned",
} as const;

export function BusinessTypes() {
  return (
    <Section labelledBy="types-heading">
      <SectionHeading
        id="types-heading"
        eyebrow="Business types"
        title="Built for online stores"
        lead="Every store is set up for selling: its dashboard, navigation and suggested roles are built around orders, products and customers. Business websites, publications and portfolios are on the roadmap."
      />
      <Stagger
        as="ul"
        itemAs="li"
        className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2 sm:gap-y-14 lg:mt-16 xl:grid-cols-4 xl:gap-x-6"
        itemClassName="flex flex-col"
      >
        {BUSINESS_TYPES.map((type) => {
          const definition = BUSINESS_TYPE_DEFINITIONS[type];
          const status = BUSINESS_TYPE_STATUS[type];
          const offered = status === "available";
          return (
            <article key={type} aria-labelledby={`type-${type}`} className="flex flex-1 flex-col">
              {/* Phones: the scene as a thumbnail beside the title, so four
                  types don't take four screens. */}
              <div className="flex items-center gap-5 sm:block">
                <div className="w-28 shrink-0 rounded-card border border-line bg-surface-sunken p-2.5 sm:w-auto sm:rounded-panel sm:px-6 sm:pt-6 sm:pb-4">
                  <BusinessScene type={type} />
                </div>
                <div className="min-w-0 sm:mt-7">
                  <h3 id={`type-${type}`} className="font-display text-h3 text-ink">
                    {definition.label}
                  </h3>
                  <p className="mt-2 text-body-sm text-ink-muted">{definition.tagline}</p>
                  <StatusPill status={status} className="mt-3" />
                </div>
              </div>
              {offered ? (
                <ul className="mt-5 flex-1 space-y-2 border-t border-line pt-5 text-body-sm text-ink-muted">
                  {definition.adapts.map((point) => (
                    <li key={point} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-[0.6rem] h-px w-2.5 shrink-0 bg-neutral-400"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 flex-1 border-t border-line pt-5 text-body-sm text-ink-muted">
                  Not offered yet: you can&apos;t create one today, and we don&apos;t give dates.
                </p>
              )}
              <ArrowLink href={`/solutions#${BUSINESS_TYPE_ANCHOR[type]}`} className="mt-6">
                {LINK_LABEL[type]}
              </ArrowLink>
            </article>
          );
        })}
      </Stagger>
    </Section>
  );
}
