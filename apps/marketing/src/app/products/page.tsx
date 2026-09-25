import type { PublicCatalogue } from "@storevia/entitlements/catalogue";
import { formatEntitlement } from "@storevia/entitlements/format";
import type { MemberRole } from "@storevia/tenancy/rbac";
import {
  BusinessScene,
  buttonClasses,
  cn,
  Glyph,
  GlyphTile,
  Icon,
  Reveal,
  Stagger,
} from "@storevia/ui";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowLink,
  CTASection,
  PageHero,
  Section,
  SectionHeading,
  SplitFeature,
  StatusPill,
} from "@/components/marketing";
import { AnalyticsCard, ChannelsCard } from "@/components/product/analytics";
import { IllustrativeNote } from "@/components/product/frame";
import {
  CAPABILITIES,
  capability,
  comingLabel,
  STATUS_DESCRIPTIONS,
  STATUSES,
  type Capability,
} from "@/content/capabilities";
import { FEATURE_AREAS } from "@/content/features";
import { roleSummaries } from "@/content/roles";
import { publicCatalogue } from "@/lib/catalogue";
import { appLinks } from "@/lib/env";
import {
  AdministrationVisual,
  CatalogueModelVisual,
  CustomersVignette,
  DomainsVignette,
  EditorialFlowVisual,
  IntegrationsVignette,
  MediaPipelineVisual,
  OrganisationVisual,
  PublishingVisual,
  StockLedgerVisual,
  ThemesVignette,
} from "./visuals";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Every part of Storevia, from organisations and teams to commerce, the website builder and analytics, each with its real status.",
};

/** "On the roadmap · Coming in Milestone 5": the status and, when planned, the milestone. */
function Timing({ item, className }: { item: Capability; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <StatusPill status={item.status} size="md" />
      {item.milestone ? (
        <span className="text-caption text-ink-muted">{comingLabel(item.milestone)}</span>
      ) : null}
    </p>
  );
}

/** A checklist of what a capability does (or will do). */
function Points({ points }: { points: readonly string[] }) {
  return (
    <ul className="space-y-3">
      {points.map((point) => (
        <li key={point} className="flex gap-3 text-body text-ink-muted">
          <Icon icon={Check} size="sm" className="mt-1 text-brand-600" />
          <span>{point}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every part of an area, as on /features. A part shows its own status only
 * where it differs from the area's, and when it's planned for, so a list
 * of eight parts doesn't repeat one label eight times.
 */
function Parts({
  item,
  title = "Part by part",
  columns = 1,
}: {
  item: Capability;
  title?: string;
  columns?: 1 | 2;
}) {
  const parts = FEATURE_AREAS.find((area) => area.capability === item.id)?.items ?? [];
  if (parts.length === 0) return null;
  return (
    <div>
      <p className="text-overline text-ink-faint uppercase">{title}</p>
      <ul
        className={cn(
          "mt-3 grid border-t border-line",
          columns === 2 && "md:grid-cols-2 md:gap-x-10",
        )}
      >
        {parts.map((part) => (
          <li
            key={part.title}
            className="flex min-h-12 items-center justify-between gap-4 border-b border-line py-2.5"
          >
            <span className="text-body-sm font-medium text-ink">{part.title}</span>
            <span className="flex shrink-0 items-center gap-2.5">
              {part.status !== item.status ? <StatusPill status={part.status} /> : null}
              {part.milestone && part.milestone !== item.milestone ? (
                <span className="text-caption text-ink-faint">{part.milestone}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The product map under the hero: every area under its status, each a jump
 * link to its section. The roadmap column is twice as wide (it holds most).
 */
function ProductMap() {
  return (
    <nav aria-label="Product areas" className="mt-14 lg:mt-16">
      <div className="grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_1fr]">
        {STATUSES.map((status) => {
          const items = CAPABILITIES.filter((item) => item.status === status);
          return (
            <div key={status} className="flex flex-col bg-surface p-5 sm:p-6">
              <StatusPill status={status} size="md" className="self-start" />
              <p className="mt-3 text-caption text-ink-muted">{STATUS_DESCRIPTIONS[status]}</p>
              <ul
                className={cn(
                  "mt-5 grid gap-x-6 gap-y-1",
                  status === "roadmap" && "lg:grid-cols-2",
                )}
              >
                {items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="-mx-2 flex min-h-11 items-center gap-3 rounded-control px-2 py-1.5 text-body-sm font-medium text-ink transition-colors duration-(--duration-fast) hover:bg-subtle hover:text-brand-700"
                    >
                      <Glyph name={item.glyph} className="size-5 text-ink" />
                      <span className="min-w-0">{item.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** A chapter opener: a quiet rule, a number and what the chapter covers. */
function Chapter({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-baseline sm:gap-8">
      <p className="w-24 shrink-0 text-caption font-medium text-ink-faint tabular-nums">{n}</p>
      <div className="min-w-0">
        <p className="text-overline text-brand-700 uppercase">{title}</p>
        <p className="mt-2 max-w-2xl text-body text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

/** One part of an area, in depth: a small heading and what it does. */
function DeepDive({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-xl">
      <h3 className="font-display text-h4 text-ink">{title}</h3>
      <p className="mt-2 text-body text-ink-muted">{children}</p>
    </div>
  );
}

/** How much analytics history each plan keeps, from the catalogue. */
function HistoryByPlan({ catalogue }: { catalogue: PublicCatalogue }) {
  const rows = [
    { name: "Free", value: catalogue.freeAllowance.analytics },
    ...catalogue.plans.map((plan) => ({ name: plan.name, value: plan.values.analytics })),
  ].map((row) => ({ name: row.name, label: formatEntitlement("analytics", row.value) }));
  return (
    <div>
      <p className="text-overline text-ink-faint uppercase">History each plan keeps</p>
      <dl className="mt-3 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <div key={row.name} className="flex min-h-11 items-center justify-between gap-4 py-2">
            <dt className="text-body-sm text-ink-muted">{row.name}</dt>
            <dd className="text-body-sm font-medium text-ink tabular-nums">
              {row.label ?? "Not included"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-caption text-ink-faint">From our live plan catalogue.</p>
    </div>
  );
}

/** The roles publishing is designed around, in the order a post meets them. */
const PUBLISHING_ROLES: readonly MemberRole[] = ["AUTHOR", "EDITOR", "CONTENT_MANAGER"];

/**
 * The smaller roadmap areas. `parts`: list the area's features with their
 * own statuses instead of summary points (integrations' parts land in
 * different milestones).
 */
const ROADMAP_CARDS: readonly { id: string; visual: ReactNode; parts?: boolean }[] = [
  { id: "customers", visual: <CustomersVignette /> },
  { id: "domains", visual: <DomainsVignette /> },
  { id: "themes", visual: <ThemesVignette /> },
  { id: "integrations", visual: <IntegrationsVignette />, parts: true },
];

export default async function ProductsPage() {
  const catalogue = await publicCatalogue();
  const { signUp } = appLinks();
  const organisations = capability("organisations");
  const teams = capability("teams");
  const administration = capability("administration");
  const commerce = capability("commerce");
  const builder = capability("builder");
  const content = capability("content");
  const analytics = capability("analytics");
  const retail = capability("retail");
  const roles = roleSummaries();
  const publishingRoles = PUBLISHING_ROLES.flatMap((key) => roles.filter((r) => r.role === key));
  return (
    <>
      <PageHero
        eyebrow="Products"
        title="Everything you run online, in one workspace"
        lead="Storevia is built in stages, and every part of it says where it stands. Here is what you can use today, what's up next and what comes after."
        actions={
          <>
            <a href={signUp} className={buttonClasses("primary", "lg")}>
              Start free
            </a>
            <ArrowLink href="/features">See every feature</ArrowLink>
          </>
        }
      >
        <ProductMap />
      </PageHero>

      {/* Chapter 1: available today. */}
      <Section
        labelledBy="organisations-heading"
        id="organisations"
        className="pt-4 md:pt-8 lg:pt-10"
      >
        <Chapter n="01" title="Available today">
          The foundations every business needs before it sells: an account, stores, a team and a
          dashboard that works on every screen.
        </Chapter>
        <SplitFeature
          className="mt-14 lg:mt-20"
          id="organisations-heading"
          eyebrow={organisations.title}
          status={organisations.status}
          title="One organisation, every store you run"
          lead="Your organisation holds every store and site you run, of any type, on one plan. Each store is set up for what it is and reserves its own web address."
          checklist={organisations.points}
          visual={<OrganisationVisual />}
        />
      </Section>

      <Section tone="tinted" labelledBy="teams-heading" id="teams">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
          <Reveal className="min-w-0">
            <SectionHeading
              id="teams-heading"
              eyebrow={teams.title}
              status={teams.status}
              title="The right access for every person"
              lead={`Invite staff, freelancers and writers with one of ${String(roles.length)} standard roles. Each maps to precise permissions, checked on every request.`}
            />
            <div className="mt-9">
              <Points points={teams.points} />
            </div>
          </Reveal>
          <Reveal className="min-w-0">
            <div className="rounded-panel border border-line bg-surface">
              <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
                <h3 className="font-display text-h4 text-ink">Standard roles</h3>
                <p className="text-caption text-ink-faint">
                  From the product&apos;s role definitions
                </p>
              </div>
              <dl className="grid sm:grid-cols-2">
                {roles.map((role) => (
                  <div
                    key={role.role}
                    className="border-b border-line px-5 py-3.5 sm:px-6 sm:odd:border-r"
                  >
                    <dt className="text-body-sm font-semibold text-ink">{role.label}</dt>
                    <dd className="mt-0.5 text-caption text-ink-muted">{role.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section labelledBy="administration-heading" id="administration">
        <SplitFeature
          reverse
          id="administration-heading"
          eyebrow={administration.title}
          status={administration.status}
          title="A dashboard designed for every screen"
          lead="Not a shrunken desktop: the dashboard is laid out separately for desktop, tablet and phone, and a command menu takes you anywhere in a keystroke."
          checklist={administration.points}
          weight="visual"
          visual={<AdministrationVisual />}
        />
      </Section>

      {/* Chapter 2: up next. Deeper than the homepage: how each part works. */}
      <Section tone="tinted" labelledBy="commerce-heading" id="commerce">
        <Chapter n="02" title="Up next">
          Designed and scheduled as the next milestone: a catalogue built for real stock. Checkout,
          orders and customers follow it.
        </Chapter>
        <div className="mt-14 lg:mt-20">
          <SectionHeading
            id="commerce-heading"
            eyebrow={commerce.title}
            title="Products modelled the way you stock them"
            lead="Options, variants, stock and media each get a proper structure of their own, so a catalogue stays accurate at four products or four thousand."
          />
          <Timing item={commerce} className="mt-6" />
        </div>
        <div className="mt-12 grid gap-8 lg:mt-16 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] xl:items-center xl:gap-16">
          <DeepDive title="Options make the variants">
            Add options such as colour and size once, and each combination becomes a variant with
            its own SKU, price and stock.
          </DeepDive>
          <Reveal className="min-w-0">
            <CatalogueModelVisual />
          </Reveal>
        </div>
        <div className="mt-12 grid gap-12 md:grid-cols-2 lg:mt-16 lg:gap-16">
          <Reveal className="flex min-w-0 flex-col gap-6">
            <DeepDive title="Every stock change on the record">
              Stock is counted per location. Each change, from a delivery to a stock count, is
              recorded with its reason, so the number on hand always adds up.
            </DeepDive>
            <StockLedgerVisual />
          </Reveal>
          <Reveal className="flex min-w-0 flex-col gap-6">
            <DeepDive title="One media library, checked and resized">
              Uploads are checked to be the kind of file they claim to be, then resized for every
              screen. One image can serve many products and pages.
            </DeepDive>
            <MediaPipelineVisual />
          </Reveal>
        </div>
        <IllustrativeNote className="mt-8">
          Illustrative, with a sample product: commerce is designed but not built yet.
        </IllustrativeNote>
        <div className="mt-14 lg:mt-16">
          <Parts item={commerce} title="Commerce, part by part" columns={2} />
        </div>
      </Section>

      {/* Chapter 3: on the roadmap. */}
      <Section labelledBy="builder-heading" id="builder">
        <Chapter n="03" title="On the roadmap">
          Designed into the platform from the start, and built in order after the catalogue.
          Concepts below show the direction, not shipped screens.
        </Chapter>
        <div className="mt-14 lg:mt-20">
          <SectionHeading
            id="builder-heading"
            eyebrow={builder.title}
            title="Draft freely, publish when it's right"
            lead="Every page keeps a draft apart from what's live. Autosave keeps your work, publishing is a deliberate step, and any earlier version can be restored."
          />
          <Timing item={builder} className="mt-6" />
        </div>
        <Reveal className="mt-12 lg:mt-14">
          <PublishingVisual />
          <IllustrativeNote className="mt-4">
            A concept of a feature on the roadmap, with a sample store.
          </IllustrativeNote>
        </Reveal>
        <div className="mt-12 lg:mt-14">
          <Parts item={builder} title="Website and storefront, part by part" columns={2} />
        </div>
      </Section>

      <Section tone="tinted" labelledBy="content-heading" id="content">
        <div>
          <SectionHeading
            id="content-heading"
            eyebrow={content.title}
            title="The right hands at every step"
            lead="Authors write drafts, editors review and publish them, and content managers run the whole publication. The roles exist in Storevia today; the writing tools that use them are on the roadmap."
          />
          <Timing item={content} className="mt-6" />
        </div>
        <Reveal className="mt-12 lg:mt-14">
          <EditorialFlowVisual />
          <IllustrativeNote className="mt-4">
            A concept of publishing on the roadmap, with sample posts and people.
          </IllustrativeNote>
        </Reveal>
        <div className="mt-12 grid gap-12 lg:mt-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-overline text-ink-faint uppercase">Roles ready today</p>
              <StatusPill status="available" />
            </div>
            <dl className="mt-3 divide-y divide-line border-y border-line">
              {publishingRoles.map((role) => (
                <div key={role.role} className="py-3">
                  <dt className="text-body-sm font-medium text-ink">{role.label}</dt>
                  <dd className="mt-0.5 text-caption text-ink-muted">{role.description}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Parts item={content} />
        </div>
      </Section>

      <Section labelledBy="analytics-heading" id="analytics">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-16">
          <Reveal className="min-w-0">
            <SectionHeading
              id="analytics-heading"
              eyebrow={analytics.title}
              title="See what's working"
              lead={analytics.summary}
            />
            <Timing item={analytics} className="mt-6" />
            <div className="mt-9">
              {catalogue ? (
                <HistoryByPlan catalogue={catalogue} />
              ) : (
                <Points points={analytics.points} />
              )}
            </div>
          </Reveal>
          <Reveal className="min-w-0">
            <div className="grid gap-4 rounded-panel border border-line bg-surface-sunken p-5 sm:grid-cols-2 sm:p-8">
              <AnalyticsCard kpi={0} />
              <AnalyticsCard kpi={2} className="hidden sm:block" />
              <ChannelsCard className="sm:col-span-2" />
            </div>
            <IllustrativeNote className="mt-4">
              A concept of analytics on the roadmap, with example figures.
            </IllustrativeNote>
          </Reveal>
        </div>
      </Section>

      <Section tone="tinted" labelledBy="more-heading">
        <SectionHeading
          id="more-heading"
          eyebrow="Also on the roadmap"
          title="Customers, domains, themes and integrations"
          lead="Each arrives with the part of Storevia it belongs to."
        />
        <Stagger
          as="ul"
          itemAs="li"
          className="mt-12 grid gap-4 md:grid-cols-2"
          itemClassName="flex min-w-0"
        >
          {ROADMAP_CARDS.map(({ id, visual, parts = false }) => {
            const item = capability(id);
            return (
              <article
                key={id}
                id={id}
                aria-labelledby={`${id}-heading`}
                className="flex w-full scroll-mt-24 flex-col overflow-hidden rounded-panel border border-line bg-surface"
              >
                <div className="flex h-36 items-center justify-center border-b border-line bg-surface-sunken px-6">
                  {visual}
                </div>
                <div className="flex flex-1 flex-col p-6 lg:p-7">
                  <div className="flex items-center gap-3">
                    <GlyphTile name={item.glyph} tone="neutral" size="sm" />
                    <h3 id={`${id}-heading`} className="font-display text-h4 text-ink">
                      {item.title}
                    </h3>
                  </div>
                  <p className="mt-4 text-body-sm text-ink-muted">{item.summary}</p>
                  {parts ? (
                    <div className="mt-5 flex-1">
                      <Parts item={item} title="Part by part" />
                    </div>
                  ) : (
                    <ul className="mt-4 flex-1 space-y-2 text-body-sm text-ink-muted">
                      {item.points.map((point) => (
                        <li key={point} className="flex gap-2.5">
                          <span
                            aria-hidden="true"
                            className="mt-[0.6rem] h-px w-2.5 shrink-0 bg-neutral-400"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Timing item={item} className="mt-6" />
                </div>
              </article>
            );
          })}
        </Stagger>
      </Section>

      {/* Future: in-person selling, restrained and clearly labelled. */}
      <Section id="retail" labelledBy="retail-future-heading">
        <Reveal className="grid items-center gap-10 rounded-panel border border-dashed border-line-strong px-6 py-10 sm:px-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16 lg:px-14 lg:py-14">
          <div>
            <SectionHeading
              id="retail-future-heading"
              eyebrow="Future direction"
              status={retail.status}
              title="In-person retail"
              className="max-w-xl"
            />
            <div className="mt-5 max-w-xl space-y-3 text-body text-ink-muted">
              <p>
                Storevia doesn&apos;t include point of sale. For shops that also sell in person, a
                connection with OmniPOS point of sale is a direction we&apos;re exploring for the
                wider Storevia ecosystem, so one catalogue and one view of stock could serve both.
              </p>
              <p>
                There&apos;s no date and no promise yet. We&apos;ll share more when there&apos;s
                something real.
              </p>
            </div>
          </div>
          <div className="mx-auto w-full max-w-xs md:order-first md:max-w-sm">
            <BusinessScene type="retail-outlet" accent="violet" />
          </div>
        </Reveal>
      </Section>

      <CTASection
        title="Start with what’s ready today"
        lead="Set up your organisation, your stores and your team now. Everything else arrives in the same workspace as it ships."
        secondary={{ label: "See the roadmap", href: "/resources#roadmap" }}
      />
    </>
  );
}
