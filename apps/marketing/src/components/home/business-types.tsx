// 05 Business types: four panels, one per type, each with its line scene,
// what it's for, what Storevia adapts for it and a link to its solution
// page. Straight from the domain's business-type definitions.
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { BusinessScene } from "@storevia/ui/illustrations";
import { Stagger } from "@storevia/ui/motion";
import { ArrowLink, Section, SectionHeading } from "@/components/marketing";
import { BUSINESS_TYPE_ANCHOR } from "@/content/business-types";

const LINK_LABEL = {
  ECOMMERCE: "Explore online stores",
  BUSINESS: "Explore business websites",
  PUBLISHING: "Explore publishing",
  PORTFOLIO: "Explore portfolios",
} as const;

export function BusinessTypes() {
  return (
    <Section labelledBy="types-heading">
      <SectionHeading
        id="types-heading"
        eyebrow="Business types"
        title="Start from what you’re building"
        lead="Choose a type for each store. Its dashboard, navigation and suggested roles are built around it, and you can change it at any time without losing anything."
      />
      <Stagger
        as="ul"
        itemAs="li"
        className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2 sm:gap-y-14 lg:mt-16 xl:grid-cols-4 xl:gap-x-6"
        itemClassName="flex flex-col"
      >
        {BUSINESS_TYPES.map((type) => {
          const definition = BUSINESS_TYPE_DEFINITIONS[type];
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
                </div>
              </div>
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
