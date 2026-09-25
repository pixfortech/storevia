import { BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { MEMBER_ROLES } from "@storevia/tenancy/rbac";
import { Icon, LogoMark } from "@storevia/ui/icons";
import { BusinessScene } from "@storevia/ui/illustrations";
import { Reveal } from "@storevia/ui/motion";
import { Accessibility, FileCheck2, RefreshCw, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLink,
  CTASection,
  FeatureRail,
  PageHero,
  Section,
  SectionHeading,
  StatusPill,
} from "@/components/marketing";
import { BUSINESS_TYPE_PLURAL } from "@/content/business-types";
import { formatReleaseDate, releasesByDay, taggedMilestones } from "@/content/changelog";
import { ALL_FEATURES, statusCounts } from "@/content/features";
import { publicCatalogue } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why we're building Storevia, how we build it and where it stands today, from the product itself.",
};

/** "Milestones 0, 1 and 2": the releases marked by a git tag. */
const TAGGED = `Milestones ${new Intl.ListFormat("en-GB", { type: "conjunction" }).format(
  taggedMilestones().map((label) => label.replace(/^Milestone /, "")),
)}`;

const BELIEFS = [
  {
    title: "Security before features",
    description:
      "Every business's data is isolated in the database, every request is checked against a role, and sensitive actions are confirmed and recorded. We build that first.",
  },
  {
    title: "Honest about what's ready",
    description:
      "Every capability carries its real status. We don't show numbers, reviews or logos we don't have, or buttons for things that don't work yet.",
  },
  {
    title: "Built for the whole team",
    description:
      "Owners, managers, editors and authors each get access that fits their job, on whatever screen they're using.",
  },
  {
    title: "Plans are data, not code",
    description:
      "What each plan includes lives in one catalogue. The product enforces it and this site displays it, so they always agree.",
  },
] as const;

const PRACTICES = [
  {
    icon: ShieldCheck,
    title: "Isolation tested on every change",
    description:
      "A suite of tenant-isolation tests runs on every change, and each milestone ends with a security review whose findings get regression tests.",
  },
  {
    icon: Accessibility,
    title: "Accessible by default",
    description:
      "We design to WCAG 2.2 AA: colour contrast is checked by automated tests, and screens are built to work with a keyboard.",
  },
  {
    icon: FileCheck2,
    title: "Decisions written down",
    description:
      "Every foundational choice is recorded as an architecture decision, with the reasons and the alternatives we turned down.",
  },
  {
    icon: RefreshCw,
    title: "Current tools, updated carefully",
    description:
      "A written policy keeps the runtime and dependencies up to date, and every update passes the full test suite before it lands.",
  },
] as const;

export default async function AboutPage() {
  const catalogue = await publicCatalogue();
  const available = statusCounts(ALL_FEATURES).available;
  // Figures about the product itself, counted from its own definitions.
  const facts = [
    { value: String(BUSINESS_TYPES.length), label: "business types, each with its own dashboard" },
    { value: String(MEMBER_ROLES.length), label: "team roles, mapped to precise permissions" },
    { value: String(available), label: "features available today" },
    ...(catalogue
      ? [
          {
            value: String(catalogue.plans.length + 1),
            label: "plans, including Free, from the live catalogue",
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHero
        eyebrow="About Storevia"
        title="Software that helps businesses show up online, properly"
        lead="Storevia is one platform for online stores, business websites, publications and portfolios, designed to be run by a team. We're building it in stages, starting with the foundations that are hardest to add later."
        layout="split"
        visual={
          <ul className="grid grid-cols-2 gap-3">
            {BUSINESS_TYPES.map((type) => (
              <li
                key={type}
                className="rounded-panel border border-line bg-surface-sunken px-4 pt-4 pb-3 sm:px-6 sm:pt-6"
              >
                <BusinessScene type={type} />
                <p className="mt-2 text-caption text-ink-muted sm:mt-3">
                  {BUSINESS_TYPE_PLURAL[type]}
                </p>
              </li>
            ))}
          </ul>
        }
      />

      <Section tone="tinted" labelledBy="building-heading">
        <div className="grid gap-12 lg:grid-cols-[7fr_5fr] lg:gap-16">
          <Reveal className="min-w-0">
            <SectionHeading
              id="building-heading"
              eyebrow="What we're building"
              title="One place to build and run a business online"
            />
            <div className="mt-6 max-w-(--container-prose) space-y-4 text-body-lg text-ink-muted">
              <p>
                Running a business online usually means stitching tools together: one for the
                website, one for the shop, another for the blog, and a spreadsheet for who can
                change what. Storevia brings them into one workspace, shaped around the kind of
                business you run.
              </p>
              <p>
                We&apos;re doing it in the open. The foundations (accounts, organisations, stores,
                teams, roles and plans) and the catalogue are available today. The storefront,
                builder and checkout follow, and every part of this site says exactly where each one
                stands.
              </p>
            </div>
          </Reveal>
          <Reveal className="min-w-0">
            <div className="rounded-panel border border-line bg-surface">
              <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
                <p className="text-label text-ink">Storevia at a glance</p>
                <LogoMark size={20} />
              </div>
              <dl className="grid grid-cols-2">
                {facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex flex-col-reverse justify-end gap-2 border-b border-line p-6 odd:border-r [&:nth-last-child(-n+2)]:border-b-0"
                  >
                    <dt className="text-body-sm text-ink-muted">{fact.label}</dt>
                    <dd className="font-display text-metric-lg text-ink tabular-nums">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-line px-6 py-3.5 text-caption text-ink-faint">
                Counted from the product&apos;s own definitions and plan catalogue.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section labelledBy="beliefs-heading">
        <SectionHeading id="beliefs-heading" eyebrow="What we believe" title="Four principles" />
        <FeatureRail items={BELIEFS} columns={4} numbered className="mt-12 lg:mt-14" />
      </Section>

      <Section tone="tinted" labelledBy="practice-heading">
        <div className="grid gap-12 lg:grid-cols-[4fr_8fr] lg:gap-16">
          <SectionHeading
            id="practice-heading"
            eyebrow="How we build"
            title="Careful by habit"
            lead="The practices behind every release, visible in how the product works."
          />
          <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {PRACTICES.map((practice) => (
              <li key={practice.title} className="border-t border-line pt-6">
                <Icon icon={practice.icon} size="lg" className="text-ink" />
                <h3 className="mt-5 font-display text-h4 text-ink">{practice.title}</h3>
                <p className="mt-2 text-body-sm text-ink-muted">{practice.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section labelledBy="stage-heading">
        <div className="grid gap-12 lg:grid-cols-[4fr_8fr] lg:gap-16">
          <div>
            <SectionHeading
              id="stage-heading"
              eyebrow="Where we are"
              title="Built in stages"
              lead={`A release is listed once it's complete and its tests pass. ${TAGGED} are also tagged in our repository.`}
            />
            <div className="mt-8 flex flex-col items-start gap-3">
              <ArrowLink href="/changelog">Read the changelog</ArrowLink>
              <ArrowLink href="/resources#roadmap">See what comes next</ArrowLink>
            </div>
          </div>
          <div className="space-y-10">
            {releasesByDay().map((day) => (
              <div key={day.date}>
                {/* The date once per day: several releases landed together. */}
                <p className="text-caption font-medium text-ink-muted">
                  <time dateTime={day.date}>{formatReleaseDate(day.date)}</time>
                </p>
                <ol className="mt-4 border-l border-line">
                  {day.releases.map((release) => (
                    <li key={release.id} className="relative pb-8 pl-8 last:pb-0">
                      <span
                        aria-hidden="true"
                        className={
                          release.status === "released"
                            ? "absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-brand-600"
                            : "absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-brand-600 bg-surface"
                        }
                      />
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
                        <span className="font-medium text-ink-muted">{release.label}</span>
                        {release.tag ? <span className="font-mono">{release.tag}</span> : null}
                        {release.status === "in-progress" ? (
                          <StatusPill status="in-development" label="In progress" />
                        ) : null}
                      </p>
                      <h3 className="mt-1.5 font-display text-h4 text-ink">
                        <Link
                          href={`/changelog#${release.id}`}
                          className="transition-colors duration-(--duration-fast) hover:text-brand-700"
                        >
                          {release.title}
                        </Link>
                      </h3>
                      <p className="mt-1 max-w-xl text-body-sm text-ink-muted">{release.summary}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <CTASection
        title="Build with us from the start"
        lead="Set up your organisation and first store today, and get each new part of Storevia as it ships."
      />
    </>
  );
}
