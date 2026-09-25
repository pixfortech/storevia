import {
  BUSINESS_TYPE_DEFINITIONS,
  BUSINESS_TYPES,
  STORE_AREAS,
  type AreaKey,
} from "@storevia/tenancy/business-types";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { BusinessScene } from "@storevia/ui/illustrations";
import { Reveal } from "@storevia/ui/motion";
import { Check, CreditCard, KeyRound, LayoutDashboard, Minus } from "lucide-react";
import type { Metadata } from "next";
import {
  ArrowLink,
  Container,
  CTASection,
  FeatureRail,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/marketing";
import { AREA_ICONS } from "@/components/product/area-icons";
import { areaTiming, BUSINESS_TYPE_ANCHOR, BUSINESS_TYPE_PLURAL } from "@/content/business-types";
import { capability } from "@/content/capabilities";
import { TypeSection } from "./type-section";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Storevia for online stores, business websites, publications and portfolios: what each business type puts first, and the roles it suggests.",
};

/** Every area some business type puts in its navigation, in the domain's order. */
const COMPARED_AREAS = (Object.keys(STORE_AREAS) as AreaKey[]).filter((key) =>
  BUSINESS_TYPES.some((type) => BUSINESS_TYPE_DEFINITIONS[type].navigation.includes(key)),
);

const DIMENSIONS = [
  {
    icon: LayoutDashboard,
    title: "Business type decides what’s shown",
    description:
      "Navigation, the store's home and suggested roles. Change it at any time: nothing is deleted.",
  },
  {
    icon: CreditCard,
    title: "Your plan decides what you can use",
    description:
      "Stores, team members and features, from the same plan catalogue whatever each store's type.",
  },
  {
    icon: KeyRound,
    title: "Each person's role decides what they may do",
    description:
      "Permissions are checked on every request. A business type never grants or removes access.",
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
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CompareTypes() {
  return (
    // overflow-hidden: the cells' white backgrounds would square off the rounded corners.
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <Table className="min-w-[40rem]">
        <TableCaption>Store navigation by business type</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-(--z-raised) bg-surface lg:static">
              Area
            </TableHead>
            {BUSINESS_TYPES.map((type) => (
              <TableHead key={type} className="text-center">
                {BUSINESS_TYPE_DEFINITIONS[type].label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {COMPARED_AREAS.map((key) => {
            const area = STORE_AREAS[key];
            return (
              <TableRow key={key}>
                {/* The area column stays in view while phones scroll the types sideways. */}
                <th
                  scope="row"
                  className="sticky left-0 z-(--z-raised) h-13 bg-surface pr-4 pl-5 text-left align-middle font-normal sm:pl-6 lg:static"
                >
                  <span className="flex items-center gap-3">
                    <Icon icon={AREA_ICONS[key]} size="sm" className="shrink-0 text-ink-faint" />
                    <span className="min-w-0">
                      <span className="block text-body-sm font-medium text-ink">{area.label}</span>
                      <span className="block text-caption whitespace-nowrap text-ink-faint">
                        {areaTiming(area.availability)}
                      </span>
                    </span>
                  </span>
                </th>
                {BUSINESS_TYPES.map((type) => {
                  const shown = BUSINESS_TYPE_DEFINITIONS[type].navigation.includes(key);
                  return (
                    // relative: keeps the sr-only text inside the table's scroll area.
                    <TableCell key={type} className="relative text-center">
                      <Icon
                        icon={shown ? Check : Minus}
                        size="sm"
                        className={
                          shown ? "inline-block text-brand-600" : "inline-block text-neutral-300"
                        }
                      />
                      <span className="sr-only">{shown ? "In the navigation" : "Not shown"}</span>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function SolutionsPage() {
  const retail = capability("retail");
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Shaped around what you’re building"
        lead="Tell Storevia what each store is. It decides what the dashboard puts first and which roles it suggests. It never limits what your plan includes or what your team may do, and you can change it at any time without losing anything."
      >
        <TypeIndex />
      </PageHero>

      {BUSINESS_TYPES.map((type, index) => (
        <TypeSection key={type} type={type} index={index} />
      ))}

      <Section labelledBy="compare-heading" id="compare">
        <div className="grid gap-12 lg:grid-cols-[4fr_8fr] lg:gap-16">
          <div>
            <SectionHeading
              id="compare-heading"
              eyebrow="Compare"
              title="What each type puts in your navigation"
              lead="Every store has a home and settings. The rest follows what you're building, and areas not built yet say when they arrive."
            />
            <ArrowLink href="/features" className="mt-6">
              Every feature and its status
            </ArrowLink>
          </div>
          <Reveal className="min-w-0">
            <CompareTypes />
          </Reveal>
        </div>
      </Section>

      <Section tone="tinted" labelledBy="dimensions-heading">
        <SectionHeading
          id="dimensions-heading"
          eyebrow="How it fits together"
          title="One organisation, every type, one plan"
          lead="Run an online store and a portfolio side by side. Three things stay independent of each other, so a store's type is only ever about presentation."
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
                Storevia is for selling and publishing online today, and there&apos;s no point of
                sale. A connection with OmniPOS point of sale is a direction we&apos;re exploring
                for the wider Storevia ecosystem, with no date yet.
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
        title="Start with the type that fits"
        lead="Create your organisation and your first store in a few minutes. Add stores of other types whenever you need them."
      />
    </>
  );
}
