import { Alert } from "@storevia/ui";
import { Building2, ListChecks, ShieldCheck, Shapes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import {
  ArrowLink,
  CTASection,
  FeatureRail,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/marketing";
import { PRICING_FAQ } from "@/content/faq";
import { publicCatalogue } from "@/lib/catalogue";
import { appLinks } from "@/lib/env";
import { comparison, pricing } from "@/lib/pricing";
import { ComparisonTable, MobileComparison } from "./comparison";
import { IntervalSwitch } from "./interval-switch";
import { PlanCards } from "./plan-cards";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Storevia plans and what each includes, read from our live plan catalogue. Free to start.",
};

const HOW_PLANS_WORK = [
  {
    icon: Building2,
    title: "One plan for your organisation",
    description:
      "Limits are shared by every store and team member in it, not charged store by store.",
  },
  {
    icon: Shapes,
    title: "Business type never changes it",
    description:
      "An online store and a portfolio on the same plan get the same features and limits.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing is lost when plans change",
    description: "Everything you have keeps working. Only adding more waits until there's room.",
  },
  {
    icon: ListChecks,
    title: "Every status is shown",
    description: "Features not built yet are marked, so you know what each plan gives you today.",
  },
] as const;

export default async function PricingPage() {
  const catalogue = await publicCatalogue();
  const { signUp } = appLinks();
  const view = catalogue ? pricing(catalogue, signUp) : null;
  const groups = catalogue ? comparison(catalogue) : [];
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Plans that grow with your business"
        lead="Start free with the essentials. Paid plans add stores, team members and features, shared across your whole organisation."
        align="center"
        className="pb-10 md:pb-12 lg:pb-14"
      />
      {view ? (
        <>
          <section
            aria-labelledby="plans-heading"
            id="plans"
            className="scroll-mt-16 pb-18 md:pb-24"
          >
            <div className="mx-auto w-full max-w-(--container-content) px-4 sm:px-6">
              {/* Keeps the outline h1 → h2 → h3 (plan names are h3). */}
              <h2 id="plans-heading" className="sr-only">
                Plans
              </h2>
              {view.hasYearly ? (
                <IntervalSwitch bestSaving={view.bestYearlySaving}>
                  <PlanCards columns={view.columns} />
                </IntervalSwitch>
              ) : (
                <PlanCards columns={view.columns} />
              )}
              <p className="mx-auto mt-10 max-w-2xl text-center text-body-sm text-ink-muted">
                Online checkout isn&apos;t available yet, so our team sets up paid plans and trials.{" "}
                <Link
                  href="/contact?topic=plans"
                  className="font-medium text-brand-700 underline-offset-4 hover:underline"
                >
                  Talk to us
                </Link>{" "}
                and we&apos;ll help you choose.
                {view.currency
                  ? ` Prices are in ${view.currency} and exclude any applicable taxes.`
                  : null}
              </p>
            </div>
          </section>

          <Section tone="tinted" space="compact" labelledBy="how-heading">
            <h2 id="how-heading" className="sr-only">
              How plans work
            </h2>
            <FeatureRail items={HOW_PLANS_WORK} columns={4} />
          </Section>

          <Section id="compare" labelledBy="compare-heading">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading
                id="compare-heading"
                eyebrow="Compare plans"
                title="Every feature, plan by plan"
                lead="Every limit and inclusion, read from the same plan catalogue the product enforces. Features not built yet are marked."
              />
              <ArrowLink href="/features" className="shrink-0 lg:mb-1">
                What every feature does
              </ArrowLink>
            </div>
            <div className="mt-10 lg:mt-14">
              <ComparisonTable columns={view.columns} groups={groups} />
              <MobileComparison columns={view.columns} groups={groups} />
            </div>
          </Section>
        </>
      ) : (
        <div className="mx-auto max-w-xl px-4 pb-20">
          <Alert tone="info" title="Plan details are temporarily unavailable">
            Please try again shortly, or{" "}
            <Link href="/contact?topic=plans" className="font-medium underline">
              contact us
            </Link>
            .
          </Alert>
        </div>
      )}

      <Section id="faq" tone="tinted" labelledBy="pricing-faq-heading">
        <div className="grid gap-10 lg:grid-cols-[4fr_7fr] lg:gap-16">
          <div>
            <SectionHeading
              id="pricing-faq-heading"
              eyebrow="FAQ"
              title="Questions about plans"
              lead="How plans, limits and changes work today."
            />
            <ArrowLink href="/contact?topic=plans" className="mt-6">
              Ask us about plans
            </ArrowLink>
          </div>
          <FaqList items={PRICING_FAQ} />
        </div>
      </Section>

      <CTASection
        title="Not sure which plan fits?"
        lead="Start free and decide later, or tell us about your stores and team and we'll help you choose."
        secondary={{ label: "Talk to us", href: "/contact?topic=plans" }}
      />
    </>
  );
}
