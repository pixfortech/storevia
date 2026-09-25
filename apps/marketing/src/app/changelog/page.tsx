import { Icon, Reveal } from "@storevia/ui";
import { Check, Tag } from "lucide-react";
import type { Metadata } from "next";
import { ArrowLink, CTASection, PageHero, Section, StatusPill } from "@/components/marketing";
import { formatReleaseDate, releasesByDay } from "@/content/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Every Storevia release so far, from its repository history: milestones, dates and what changed.",
};

export default function ChangelogPage() {
  return (
    <>
      <PageHero
        eyebrow="Changelog"
        title="What’s new in Storevia"
        lead="Every release so far, taken from our repository's history and dated by its commits. Storevia hasn't launched publicly yet, so these are its development milestones, newest first."
      >
        <ArrowLink href="/resources#roadmap">See what comes next</ArrowLink>
      </PageHero>

      <Section space="none" labelledBy="releases-heading" className="pb-18 md:pb-24 lg:pb-28">
        <h2 id="releases-heading" className="sr-only">
          Releases
        </h2>
        <ol>
          {releasesByDay().map((day) => (
            <li key={day.date}>
              {/* One date per day: several releases can land together. */}
              <div className="flex items-baseline justify-between gap-4 border-y border-line bg-surface-sunken px-4 py-3 sm:px-6">
                <p className="text-label text-ink">
                  <time dateTime={day.date}>{formatReleaseDate(day.date)}</time>
                </p>
                <p className="text-caption text-ink-faint">
                  {day.releases.length === 1
                    ? "1 release"
                    : `${String(day.releases.length)} releases`}
                </p>
              </div>
              <ol>
                {day.releases.map((release) => (
                  <Reveal
                    as="li"
                    key={release.id}
                    id={release.id}
                    className="grid scroll-mt-24 gap-6 border-b border-line py-12 last:border-b-0 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16 lg:py-16"
                  >
                    <div className="lg:sticky lg:top-28 lg:self-start">
                      <p className="text-overline text-brand-700 uppercase">{release.label}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {release.status === "in-progress" ? (
                          <StatusPill status="in-development" label="In progress" />
                        ) : (
                          <StatusPill status="available" label="Released" />
                        )}
                        {release.tag ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-caption text-ink-faint">
                            <Icon icon={Tag} size="xs" />
                            {release.tag}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-w-0 max-w-(--container-prose)">
                      <h3 className="font-display text-h3 text-ink">{release.title}</h3>
                      <p className="mt-3 text-body-lg text-ink-muted">{release.summary}</p>
                      <ul className="mt-6 space-y-3">
                        {release.changes.map((change) => (
                          <li key={change} className="flex gap-3 text-body text-ink-muted">
                            <Icon icon={Check} size="sm" className="mt-1 text-brand-600" />
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                      {release.status === "in-progress" ? (
                        <p className="mt-6 text-body-sm text-ink-faint">
                          This work is under way. The rest of the redesign will be listed here when
                          it ships.
                        </p>
                      ) : null}
                    </div>
                  </Reveal>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </Section>

      <CTASection
        title="Start with what's released"
        lead="Everything listed as released is in the dashboard today, free to start."
        secondary={{ label: "See the roadmap", href: "/resources#roadmap" }}
      />
    </>
  );
}
