import type { PublicCatalogue } from "@storevia/entitlements/catalogue";
import { cn } from "@storevia/ui/cn";
import { Glyph, GlyphTile, Icon } from "@storevia/ui/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLink, CTASection, PageHero, StatusPill } from "@/components/marketing";
import { StatusLegend } from "@/components/status-badge";
import { comingLabel, STATUS_LABELS, STATUSES, type Status } from "@/content/capabilities";
import { ALL_FEATURES, FEATURE_AREAS, statusCounts, type FeatureArea } from "@/content/features";
import { publicCatalogue } from "@/lib/catalogue";
import { planAvailability } from "@/lib/pricing";
import { StatusFilter } from "./status-filter";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Every Storevia capability, area by area, each labelled Available now, Up next, On the roadmap or Future.",
};

// Literal class names (Tailwind reads them verbatim) that hide a row, or a
// whole area, when the StatusFilter around the matrix shows another status.
const HIDE_ROW: Record<Status, string> = {
  available:
    "group-data-[filter=in-development]/features:hidden group-data-[filter=roadmap]/features:hidden group-data-[filter=future]/features:hidden",
  "in-development":
    "group-data-[filter=available]/features:hidden group-data-[filter=roadmap]/features:hidden group-data-[filter=future]/features:hidden",
  roadmap:
    "group-data-[filter=available]/features:hidden group-data-[filter=in-development]/features:hidden group-data-[filter=future]/features:hidden",
  future:
    "group-data-[filter=available]/features:hidden group-data-[filter=in-development]/features:hidden group-data-[filter=roadmap]/features:hidden",
};
const HIDE_AREA_WHEN: Record<Status, string> = {
  available: "group-data-[filter=available]/features:hidden",
  "in-development": "group-data-[filter=in-development]/features:hidden",
  roadmap: "group-data-[filter=roadmap]/features:hidden",
  future: "group-data-[filter=future]/features:hidden",
};

/** Hides an area (or its link) under any filter it has no features for. */
function hideArea(area: FeatureArea): string {
  const present = new Set(area.items.map((item) => item.status));
  return STATUSES.filter((status) => !present.has(status))
    .map((status) => HIDE_AREA_WHEN[status])
    .join(" ");
}

function AreaIcon({ area, className }: { area: FeatureArea; className?: string }) {
  if (area.glyph) return <Glyph name={area.glyph} className={className} />;
  if (area.icon) return <Icon icon={area.icon} size="md" className={className} />;
  return null;
}

/** Links to every area: a scrolling row on phones and tablets, a column on desktop. */
function AreaNav({ layout }: { layout: "row" | "column" }) {
  const row = layout === "row";
  return (
    <nav aria-label="Feature areas">
      {row ? null : <p className="mb-2 text-overline text-ink-faint uppercase">Areas</p>}
      <ul
        className={
          row
            ? "-mx-1 flex gap-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "-mx-2 space-y-0.5"
        }
      >
        {FEATURE_AREAS.map((area) => (
          <li key={area.id} className={cn(row && "shrink-0", hideArea(area))}>
            <a
              href={`#${area.id}`}
              className={cn(
                "flex items-center gap-2.5 text-body-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-(--duration-fast) hover:bg-subtle hover:text-ink",
                row
                  ? "h-9 rounded-pill px-3 pointer-coarse:h-11"
                  : "min-h-9 rounded-control px-2 py-1.5",
              )}
            >
              <AreaIcon area={area} className="size-4 shrink-0 text-ink-faint" />
              <span className={row ? undefined : "truncate"}>{area.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Area({ area, catalogue }: { area: FeatureArea; catalogue: PublicCatalogue | null }) {
  const counts = statusCounts(area.items);
  const summary = STATUSES.filter((status) => counts[status] > 0)
    .map((status) => `${String(counts[status])} ${STATUS_LABELS[status].toLowerCase()}`)
    .join(" · ");
  return (
    <section
      id={area.id}
      aria-labelledby={`${area.id}-heading`}
      className={cn(
        "scroll-mt-36 border-t border-line pt-10 pb-4 first-of-type:border-t-0 lg:scroll-mt-20 lg:pt-12",
        hideArea(area),
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="flex min-w-0 gap-4">
          {area.glyph ? (
            <GlyphTile name={area.glyph} tone="neutral" />
          ) : (
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-card bg-subtle ring-1 ring-line ring-inset">
              <AreaIcon area={area} className="text-ink" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={`${area.id}-heading`} className="font-display text-h3 text-ink">
              {area.title}
            </h2>
            <p className="mt-1 text-body text-ink-muted">{area.summary}</p>
            <p className="mt-2 text-caption text-ink-faint">{summary}</p>
          </div>
        </div>
        {area.capability ? (
          <ArrowLink href={`/products#${area.capability}`} className="shrink-0 sm:mt-1.5">
            On the products page
          </ArrowLink>
        ) : null}
      </div>
      <ul className="mt-6 border-t border-line">
        {area.items.map((item) => {
          const plans =
            item.planFeature && catalogue ? planAvailability(catalogue, item.planFeature) : null;
          return (
            <li
              key={item.title}
              className={cn(
                "grid gap-x-8 gap-y-3 border-b border-line py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_13rem]",
                HIDE_ROW[item.status],
              )}
            >
              <div className="min-w-0">
                <h3 className="text-body font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-body-sm text-ink-muted">{item.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-col sm:items-end sm:text-right">
                <StatusPill status={item.status} />
                {item.milestone ? (
                  <span className="text-caption text-ink-faint">{comingLabel(item.milestone)}</span>
                ) : null}
                {plans ? (
                  <Link
                    href="/pricing#compare"
                    className="text-caption text-ink-muted underline-offset-4 hover:text-brand-700 hover:underline"
                  >
                    {plans}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function FeaturesPage() {
  const catalogue = await publicCatalogue();
  const counts = statusCounts(ALL_FEATURES);
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Every capability, with its real status"
        lead="The full list of what Storevia does today and what it will do, area by area. Nothing here is live unless it says Available now, and plan names show which plans include each feature."
      >
        <StatusLegend counts={counts} noun={["feature", "features"]} />
      </PageHero>

      <StatusFilter
        counts={counts}
        navBar={<AreaNav layout="row" />}
        navSide={<AreaNav layout="column" />}
      >
        <section aria-labelledby="matrix-heading" className="pb-16 lg:pb-24">
          <h2 id="matrix-heading" className="sr-only">
            Features by area
          </h2>
          {FEATURE_AREAS.map((area) => (
            <Area key={area.id} area={area} catalogue={catalogue} />
          ))}
          <p className="mt-8 border-t border-line pt-8 text-body-sm text-ink-muted">
            Order and timing may change, and no dates are promised.{" "}
            <Link
              href="/resources#roadmap"
              className="font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              See the roadmap
            </Link>{" "}
            or{" "}
            <Link
              href="/changelog"
              className="font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              what changed recently
            </Link>
            .
          </p>
        </section>
      </StatusFilter>

      <CTASection
        title="Use what’s ready today"
        lead="Organisations, stores, teams, roles and the dashboard are available now, free to start."
        secondary={{ label: "Compare plans", href: "/pricing" }}
      />
    </>
  );
}
