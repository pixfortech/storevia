import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { Reveal } from "@storevia/ui/motion";
import {
  BookOpen,
  CircleHelp,
  Database,
  FileCode2,
  KeyRound,
  ListChecks,
  Map as MapIcon,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLink,
  CTASection,
  PageHero,
  Section,
  SectionHeading,
  StatusPill,
} from "@/components/marketing";
import { RELEASES } from "@/content/changelog";
import type { Status } from "@/content/capabilities";
import { ROADMAP } from "@/content/roadmap";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Storevia's roadmap, how we keep your data safe, release notes and answers to common questions.",
};

interface Entry {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Absent for resources that don't exist yet. */
  href?: string;
  status?: Status;
  statusLabel?: string;
}

const ENTRIES: readonly Entry[] = [
  {
    icon: MapIcon,
    title: "Roadmap",
    description: "What's ready today, what's up next and what comes after, in order.",
    href: "#roadmap",
  },
  {
    icon: ScrollText,
    title: "Changelog",
    description: "Every release so far, from our repository's history.",
    href: "/changelog",
  },
  {
    icon: ShieldCheck,
    title: "Security",
    description: "How your data is isolated, checked and recorded.",
    href: "#security",
  },
  {
    icon: CircleHelp,
    title: "Questions and answers",
    description: "Straight answers about the product today, and about plans.",
    href: "/#faq",
  },
  {
    icon: BookOpen,
    title: "Guides and help centre",
    description: "Step-by-step guides for running your store, arriving with the storefront.",
    status: "roadmap",
    statusLabel: "Coming with the storefront",
  },
  {
    icon: FileCode2,
    title: "API documentation",
    description: "Reference for the Storevia API, published alongside the API itself.",
    status: "roadmap",
    statusLabel: "Coming with the API",
  },
];

const SECURITY: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Database,
    title: "Isolation in the database",
    body: "Each organisation's rows are protected by row-level security in PostgreSQL, so one business can't read another's data even if application code makes a mistake.",
  },
  {
    icon: KeyRound,
    title: "Access checked on every request",
    body: "Your membership and role are verified for every page and action. An organisation or store ID in a URL is only ever a request, never proof of access.",
  },
  {
    icon: ListChecks,
    title: "Confirmation for sensitive changes",
    body: "Granting admin rights and other sensitive actions ask you to confirm your password first.",
  },
  {
    icon: ScrollText,
    title: "An audit trail",
    body: "Changes to members, roles, stores and plans are recorded with who made them and when.",
  },
  {
    icon: Timer,
    title: "Rate limits",
    body: "Sign-in, sign-up and public forms are rate limited, so repeated attempts are slowed down.",
  },
  {
    icon: MonitorSmartphone,
    title: "Your signed-in devices",
    body: "See where your account is signed in and sign out of the devices you don't recognise.",
  },
];

function EntryCard({ entry }: { entry: Entry }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-card border border-line bg-surface">
          <Icon icon={entry.icon} size="md" className="text-ink" />
        </span>
        {entry.status ? (
          <StatusPill
            status={entry.status}
            {...(entry.statusLabel ? { label: entry.statusLabel } : {})}
          />
        ) : null}
      </div>
      <h2 className="mt-5 font-display text-h4 text-ink group-hover/entry:text-brand-700">
        {entry.title}
      </h2>
      <p className="mt-1.5 text-body-sm text-ink-muted">{entry.description}</p>
    </>
  );
  const box = "flex h-full flex-col rounded-panel p-6";
  if (!entry.href) {
    return <div className={cn(box, "border border-dashed border-line-strong")}>{body}</div>;
  }
  const className = cn(
    box,
    "group/entry border border-line bg-surface transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-line-strong hover:shadow-raised",
  );
  return entry.href.startsWith("#") ? (
    <a href={entry.href} className={className}>
      {body}
    </a>
  ) : (
    <Link href={entry.href} className={className}>
      {body}
    </Link>
  );
}

export default function ResourcesPage() {
  const latest = RELEASES.slice(0, 3);
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Roadmap, security and release notes"
        lead="Everything we can tell you about how Storevia is built and where it's going. Guides and documentation arrive as the product grows, and they're marked until then."
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENTRIES.map((entry) => (
            <li key={entry.title} className="flex">
              <EntryCard entry={entry} />
            </li>
          ))}
        </ul>
      </PageHero>

      <Section id="roadmap" tone="tinted" labelledBy="roadmap-heading">
        <div className="grid gap-12 lg:grid-cols-[4fr_8fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              id="roadmap-heading"
              eyebrow="Roadmap"
              title="Built in order, one milestone at a time"
              lead="The order reflects our plan today and may change. We don't promise dates."
            />
            <ArrowLink href="/features" className="mt-6">
              Every feature and its status
            </ArrowLink>
          </div>
          <ol className="relative">
            {ROADMAP.map((stage, index) => {
              const upNext = stage.status === "in-development";
              return (
                <Reveal as="li" key={stage.id} className="relative flex gap-5 sm:gap-8">
                  <div className="flex w-5 shrink-0 flex-col items-center">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 size-3 shrink-0 rounded-full",
                        stage.status === "available" && "bg-success-500",
                        upNext && "bg-brand-600 ring-4 ring-brand-100",
                        stage.status === "roadmap" && "border-2 border-neutral-300 bg-surface",
                      )}
                    />
                    {index < ROADMAP.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="mt-2 -mb-1.5 w-px flex-1 bg-line-strong"
                      />
                    ) : null}
                  </div>
                  {/* The spacing lives inside the row, so the rail runs unbroken to the next dot. */}
                  <div className={cn("min-w-0 flex-1", index < ROADMAP.length - 1 && "pb-10")}>
                    <div
                      className={cn(
                        "rounded-panel border bg-surface p-5 sm:p-6",
                        upNext ? "border-brand-200 shadow-card" : "border-line",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-caption font-medium text-ink-faint">{stage.milestone}</p>
                        <StatusPill status={stage.status} />
                      </div>
                      <h3 className="mt-2 font-display text-h4 text-ink">{stage.title}</h3>
                      <p className="mt-1 text-body-sm text-ink-muted">{stage.summary}</p>
                      <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-body-sm text-ink-muted">
                        {stage.items.map((item) => (
                          <li key={item} className="flex gap-2.5">
                            <span
                              aria-hidden="true"
                              className="mt-[0.6rem] h-px w-2.5 shrink-0 bg-neutral-400"
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </Section>

      <Section id="security" labelledBy="security-heading">
        <SectionHeading
          id="security-heading"
          eyebrow="Security"
          title="How we keep your data safe"
          lead="Security and separation between businesses are the first things we build and the last things we compromise."
        />
        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
          {SECURITY.map((item) => (
            <li key={item.title} className="border-t border-line pt-6">
              <Icon icon={item.icon} size="lg" className="text-ink" />
              <h3 className="mt-5 font-display text-h4 text-ink">{item.title}</h3>
              <p className="mt-2 text-body-sm text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-14 flex flex-col gap-4 rounded-panel border border-line bg-surface-sunken p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h3 className="font-display text-h4 text-ink">Found a security issue?</h3>
            <p className="mt-1 text-body-sm text-ink-muted">
              Tell us privately. Please don&apos;t include personal data or passwords.
            </p>
          </div>
          <ArrowLink href="/contact?topic=security" className="shrink-0">
            Report a security issue
          </ArrowLink>
        </div>
      </Section>

      <Section tone="tinted" labelledBy="latest-heading">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            id="latest-heading"
            eyebrow="Changelog"
            title="Recent releases"
            lead="Newest first, from our repository's history. The changelog has every release and its date."
          />
          <ArrowLink href="/changelog" className="shrink-0 sm:mb-1">
            Every release
          </ArrowLink>
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {latest.map((release) => (
            <li key={release.id} className="flex">
              <Link
                href={`/changelog#${release.id}`}
                className="group/release flex w-full flex-col rounded-panel border border-line bg-surface p-6 transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-line-strong hover:shadow-raised"
              >
                <p className="text-caption font-medium text-ink-muted">{release.label}</p>
                <h3 className="mt-3 font-display text-h4 text-ink group-hover/release:text-brand-700">
                  {release.title}
                </h3>
                <p className="mt-1.5 text-body-sm text-ink-muted">{release.summary}</p>
                {release.status === "in-progress" ? (
                  <StatusPill
                    status="in-development"
                    label="In progress"
                    className="mt-4 self-start"
                  />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <CTASection
        title="Questions we haven't answered?"
        lead="Ask us about plans, the roadmap or security, and a person will reply by email."
        secondary={{ label: "Contact us", href: "/contact" }}
      />
    </>
  );
}
