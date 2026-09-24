import { Alert } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/cta-band";
import { ComparisonTable, PlanCards } from "@/components/pricing";
import { Section, SectionHeading } from "@/components/section";
import { publicCatalogue } from "@/lib/catalogue";
import { appLinks } from "@/lib/env";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Storevia plans and what each includes. Free to start.",
};

export default async function PricingPage() {
  const catalogue = await publicCatalogue();
  const { signUp } = appLinks();
  return (
    <>
      <Section className="pb-10 sm:pb-12 lg:pb-14" labelledBy="pricing-title">
        <SectionHeading
          as="h1"
          id="pricing-title"
          eyebrow="Pricing"
          title="Simple plans for every stage"
          lead="Start free with one store. Paid plans add stores, team members and features, shared across your whole organisation."
          align="center"
        />
      </Section>
      {catalogue ? (
        <>
          <section aria-label="Plans" className="pb-16">
            <div className="mx-auto max-w-(--container-content) px-4 sm:px-6 lg:px-8">
              <PlanCards catalogue={catalogue} signUpHref={signUp} />
              <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-muted">
                Online checkout isn&apos;t available yet, so paid plans are set up by our team.{" "}
                <Link
                  href="/contact?topic=plans"
                  className="font-medium text-brand-700 hover:underline"
                >
                  Talk to us
                </Link>{" "}
                and we&apos;ll help you choose. Prices are in US dollars and exclude any applicable
                taxes.
              </p>
            </div>
          </section>
          <Section tone="tinted" labelledBy="compare-heading">
            <SectionHeading
              id="compare-heading"
              title="Compare every feature"
              lead="Features still being built are marked, so you know what each plan includes today and what it will include."
            />
            <div className="mt-10">
              <ComparisonTable catalogue={catalogue} signUpHref={signUp} />
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
      <CtaBand />
    </>
  );
}
