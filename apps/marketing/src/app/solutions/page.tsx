import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { BusinessScene } from "@storevia/ui/illustrations";
import { Reveal, Stagger } from "@storevia/ui/motion";
import { CreditCard, KeyRound, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import {
  ArrowLink,
  Container,
  CTASection,
  FeatureRail,
  PageHero,
  Section,
  SectionHeading,
  StatusPill,
} from "@/components/marketing";
import {
  BUSINESS_TYPE_ANCHOR,
  BUSINESS_TYPE_PLURAL,
  BUSINESS_TYPE_STATUS,
  OFFERED_BUSINESS_TYPES,
  PLANNED_BUSINESS_TYPES,
  SOLUTION_COPY,
} from "@/content/business-types";
import { capability } from "@/content/capabilities";
import { TypeSection } from "./type-section";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Storevia is built for online stores today: what it puts first for selling, and the roles it suggests. Business websites, publications and portfolios are on the roadmap.",
};

const DIMENSIONS = [
  {
    icon: LayoutDashboard,
    title: "Each store is set up for selling",
    description:
      "Navigation, the store's home and suggested roles are built around orders, products and customers.",
  },
  {
    icon: CreditCard,
    title: "Your plan decides what you can use",
    description: "Stores, team members and features, from one plan catalogue for every store.",
  },
  {
    icon: KeyRound,
    title: "Each person's role decides what they may do",
    description:
      "Permissions are checked on every request. A store's setup never grants or removes access.",
  },
] as const;

function TypeIndex() {
  return (
    <nav aria-label="Business types">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BUSINESS_TYPES.map((type) => (
          <li key={type} className="flex">
            <a
              href={`#${BUSINESS_TYPE_ANCHOR[type]}`}
              className="group/type flex w-full flex-col rounded-panel border border-line bg-surface p-3 transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-line-strong hover:shadow-raised"
            >
              <span className="block rounded-card bg-surface-sunken px-6 pt-4 pb-2">
                <BusinessScene type={type} className="mx-auto max-w-[13rem]" />
              </span>
              <span className="flex flex-1 flex-col px-2 pt-4 pb-2">
                <span className="font-display text-h4 text-ink group-hover/type:text-brand-700">
                  {BUSINESS_TYPE_PLURAL[type]}
                </span>
                <span className="mt-1 text-body-sm text-ink-muted">
                  {BUSINESS_TYPE_DEFINITIONS[type].tagline}
                </span>
                <StatusPill status={BUSINESS_TYPE_STATUS[type]} className="mt-3 self-start" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The business types that aren't offered yet: what they are, and that they're planned. */
function PlannedTypes() {
  return (
    <Stagger
      as="ul"
      itemAs="li"
      className="mt-12 grid gap-4 md:grid-cols-3"
      itemClassName="flex min-w-0"
    >
      {PLANNED_BUSINESS_TYPES.map((type) => {
        const anchor = BUSINESS_TYPE_ANCHOR[type];
        return (
          <article
            key={type}
            id={anchor}
            aria-labelledby={`${anchor}-heading`}
            className="flex w-full scroll-mt-24 flex-col overflow-hidden rounded-panel border border-dashed border-line-strong bg-surface"
          >
            <div className="border-b border-line bg-surface-sunken px-8 pt-6 pb-3">
              <BusinessScene type={type} className="mx-auto max-w-[12rem]" />
            </div>
            <div className="flex flex-1 flex-col p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id={`${anchor}-heading`} className="font-display text-h4 text-ink">
                  {SOLUTION_COPY[type].headline}
                </h3>
                <StatusPill status={BUSINESS_TYPE_STATUS[type]} />
              </div>
              <p className="mt-3 text-body-sm text-ink-muted">{SOLUTION_COPY[type].lead}</p>
            </div>
          </article>
        );
      })}
    </Stagger>
  );
}

export default function SolutionsPage() {
  const retail = capability("retail");
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Built for online stores"
        lead="Storevia is for selling online today. Each store's dashboard, navigation and suggested team roles are built around orders, products and customers. Business websites, publications and portfolios are on the roadmap, and you can't create them yet."
      >
        <TypeIndex />
      </PageHero>

      {OFFERED_BUSINESS_TYPES.map((type, index) => (
        <TypeSection key={type} type={type} index={index} />
      ))}

      <Section tone="tinted" labelledBy="planned-heading" id="planned">
        <SectionHeading
          id="planned-heading"
          eyebrow="On the roadmap"
          title="Other kinds of site"
          lead="Planned, but not built yet. We don't give dates, and nothing here is part of Storevia today."
        />
        <PlannedTypes />
        <ArrowLink href="/features" className="mt-8">
          Every feature and its status
        </ArrowLink>
      </Section>

      <Section labelledBy="dimensions-heading">
        <SectionHeading
          id="dimensions-heading"
          eyebrow="How it fits together"
          title="One organisation, every store, one plan"
          lead="Run several online stores side by side. Your plan and each person's role apply across all of them."
        />
        <FeatureRail items={DIMENSIONS} columns={3} className="mt-12 lg:mt-14" />
      </Section>

      <section
        id="in-person"
        aria-labelledby="in-person-heading"
        className="scroll-mt-16 py-18 md:py-24"
      >
        <Container>
          <Reveal className="grid items-center gap-10 rounded-panel border border-dashed border-line-strong px-6 py-10 sm:px-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16 lg:px-14">
            <div>
              <SectionHeading
                id="in-person-heading"
                eyebrow="Future direction"
                status={retail.status}
                title="Also selling in person?"
                className="max-w-xl"
              />
              <p className="mt-5 max-w-xl text-body text-ink-muted">
                Storevia is for selling online today, and there&apos;s no point of sale. A
                connection with OmniPOS point of sale is a direction we&apos;re exploring for the
                wider Storevia ecosystem, with no date yet.
              </p>
              <ArrowLink href="/products#retail" className="mt-6">
                Read about in-person retail
              </ArrowLink>
            </div>
            <div className="mx-auto w-full max-w-[16rem] md:max-w-xs">
              <BusinessScene type="retail-outlet" accent="violet" />
            </div>
          </Reveal>
        </Container>
      </section>

      <CTASection
        title="Start your online store"
        lead="Create your organisation and your first store in a few minutes."
      />
    </>
  );
}
