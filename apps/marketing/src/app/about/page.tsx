import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/cta-band";
import { Section, SectionHeading } from "@/components/section";

export const metadata: Metadata = {
  title: "About",
  description: "Why we're building Storevia, and how.",
};

const BELIEFS = [
  {
    title: "Security before features",
    body: "Every business's data is isolated in the database, every request is checked against a role, and sensitive actions are confirmed and recorded. We build that first, and test it on every change.",
  },
  {
    title: "Honest about what's ready",
    body: "We label every capability with its real status. We don't show numbers, reviews or logos we don't have, and we don't add buttons for things that don't work yet.",
  },
  {
    title: "Built for the whole team",
    body: "Owners, managers, editors and authors each get access that fits their job, on whatever screen they're using.",
  },
  {
    title: "Plans are data, not code",
    body: "What each plan includes is defined in one catalogue. The product enforces it and this site displays it, so they always agree.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Section labelledBy="about-title">
        <SectionHeading
          as="h1"
          id="about-title"
          eyebrow="About Storevia"
          title="Software that helps businesses show up online, properly"
          lead="Storevia is a platform for online stores, business websites, publications and portfolios, designed to be run by a team. We're building it in stages, starting with the foundations that are hardest to add later."
        />
      </Section>
      <Section tone="tinted" labelledBy="beliefs-heading">
        <SectionHeading id="beliefs-heading" title="What we believe" />
        <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {BELIEFS.map((belief) => (
            <li key={belief.title} className="border-t border-line-strong pt-5">
              <h3 className="text-lg font-semibold text-ink">{belief.title}</h3>
              <p className="mt-2 text-ink-muted">{belief.body}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section labelledBy="stage-heading">
        <div className="max-w-(--container-prose)">
          <h2 id="stage-heading" className="text-2xl font-semibold tracking-tight text-ink">
            Where we are
          </h2>
          <p className="mt-4 text-ink-muted">
            Accounts, organisations, stores, teams and roles, plans and the dashboard are available
            today. The product catalogue and storefront come next, followed by the visual builder,
            checkout and custom domains. You can follow progress on our{" "}
            <Link href="/resources#roadmap" className="font-medium text-brand-700 hover:underline">
              roadmap
            </Link>
            .
          </p>
        </div>
      </Section>
      <CtaBand title="Build with us from the start" />
    </>
  );
}
