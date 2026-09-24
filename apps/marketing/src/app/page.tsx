import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { MEMBER_ROLES, ROLE_LABELS } from "@storevia/tenancy/rbac";
import { Alert, buttonClasses, GlyphTile, ICON_STROKE } from "@storevia/ui";
import { ArrowRight, Check, Layers, Monitor, ShieldCheck, Smartphone, Tablet } from "lucide-react";
import Link from "next/link";
import { CtaBand } from "@/components/cta-band";
import { DashboardPreview, PhonePreview } from "@/components/dashboard-preview";
import { FaqList } from "@/components/faq-list";
import { PlanCards } from "@/components/pricing";
import { Container, Section, SectionHeading } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { BUSINESS_TYPE_ANCHOR, BUSINESS_TYPE_GLYPH } from "@/content/business-types";
import { capability } from "@/content/capabilities";
import { publicCatalogue } from "@/lib/catalogue";
import { appLinks } from "@/lib/env";

// Product facts derived from the code, never invented. Customer proof (logos,
// quotes, figures) goes here only once it exists and is permitted.
const FACTS = [
  { value: String(BUSINESS_TYPES.length), label: "business types, each with its own setup" },
  { value: String(MEMBER_ROLES.length), label: "team roles mapped to precise permissions" },
  { value: "3", label: "layouts: desktop, tablet and phone" },
  { value: "1", label: "plan shared by every store you run" },
];

const PRINCIPLES = [
  {
    icon: Layers,
    title: "One place for everything you run",
    body: "An organisation holds your stores, sites and team. Switch between them in a click, and share one plan across all of them.",
  },
  {
    icon: ShieldCheck,
    title: "Safe by design",
    body: "Each business's data is isolated in the database itself. Every request is checked against your role, and sensitive changes ask you to confirm it's you.",
  },
  {
    icon: Monitor,
    title: "Made for every screen",
    body: "The dashboard is designed three times: a full workspace on desktop, a touch-first rail on tablet and an app-style layout on your phone.",
  },
];

export default async function HomePage() {
  const catalogue = await publicCatalogue();
  const links = appLinks();
  const teams = capability("teams");
  const platform = [capability("commerce"), capability("builder"), capability("content")];
  const retail = capability("retail");
  const presets = BUSINESS_TYPE_DEFINITIONS.PUBLISHING.rolePresets;

  return (
    <>
      {/* Hero */}
      <section
        aria-labelledby="hero-heading"
        className="overflow-hidden border-b border-line bg-canvas"
      >
        <Container className="pb-0 pt-14 sm:pt-20 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <Link
              href="/resources#roadmap"
              className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1 text-sm text-ink-muted shadow-xs hover:text-ink"
            >
              <span className="size-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              In development · See what&apos;s ready today
              <ArrowRight aria-hidden="true" strokeWidth={ICON_STROKE} className="size-3.5" />
            </Link>
            <h1
              id="hero-heading"
              className="mt-6 text-4xl font-semibold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl"
            >
              Build your online presence, run it as a team.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted sm:text-xl">
              Storevia brings your online store, business website, publication or portfolio into one
              calm workspace, shaped around what you&apos;re building and who you build it with.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <a href={links.signUp} className={buttonClasses("primary", "lg")}>
                Start free
              </a>
              <Link href="/products" className={buttonClasses("secondary", "lg")}>
                Explore the product
              </Link>
            </div>
          </div>
          <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
            <DashboardPreview type="ECOMMERCE" className="rounded-b-none border-b-0" />
            <PhonePreview
              type="ECOMMERCE"
              className="absolute -bottom-10 -right-6 hidden origin-bottom-right scale-[0.8] lg:block xl:-right-16"
            />
          </div>
        </Container>
      </section>

      {/* Credibility: product facts now; customer proof when it exists. */}
      <section aria-label="Storevia at a glance" className="border-b border-line">
        <Container>
          <dl className="grid grid-cols-2 divide-line py-10 lg:grid-cols-4 lg:divide-x">
            {FACTS.map((fact) => (
              <div key={fact.label} className="px-2 py-3 lg:px-8">
                <dt className="sr-only">{fact.label}</dt>
                <dd>
                  <span className="block text-3xl font-semibold tracking-tight text-ink tabular">
                    {fact.value}
                  </span>
                  <span className="mt-1 block text-sm text-ink-muted">{fact.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Business types */}
      <Section labelledBy="types-heading">
        <SectionHeading
          id="types-heading"
          eyebrow="Build your online presence"
          title="Start from what you're building"
          lead="Tell Storevia what kind of site you run. Navigation, your store's home and suggested team roles adapt to it, and you can change it whenever you like."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BUSINESS_TYPES.map((type) => {
            const definition = BUSINESS_TYPE_DEFINITIONS[type];
            return (
              <li key={type}>
                <Link
                  href={`/solutions#${BUSINESS_TYPE_ANCHOR[type]}`}
                  className="group flex h-full flex-col rounded-panel border border-line bg-surface p-6 shadow-card transition-colors hover:border-line-strong"
                >
                  <GlyphTile name={BUSINESS_TYPE_GLYPH[type]} size="lg" />
                  <h3 className="mt-5 text-lg font-semibold text-ink">{definition.label}</h3>
                  <p className="mt-2 flex-1 text-sm text-ink-muted">{definition.tagline}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
                    How Storevia adapts
                    <ArrowRight
                      aria-hidden="true"
                      strokeWidth={ICON_STROKE}
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Why Storevia */}
      <Section tone="tinted" labelledBy="why-heading">
        <SectionHeading
          id="why-heading"
          eyebrow="Why Storevia"
          title="Calm software for serious work"
          lead="Storevia is built carefully, in the open about what's ready. The foundations come first: security, teams and a workspace that fits every screen."
        />
        <ul className="mt-12 grid gap-8 md:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <li key={principle.title}>
              <span className="flex size-11 items-center justify-center rounded-card bg-surface text-brand-700 ring-1 ring-line ring-inset">
                <principle.icon aria-hidden="true" strokeWidth={ICON_STROKE} className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-ink">{principle.title}</h3>
              <p className="mt-2 text-ink-muted">{principle.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* Commerce, builder, content */}
      <Section labelledBy="platform-heading">
        <SectionHeading
          id="platform-heading"
          eyebrow="The platform"
          title="Commerce, a visual builder and publishing tools"
          lead="These are being built now, in this order. Each one is labelled with its real status."
        />
        <ul className="mt-12 grid gap-4 lg:grid-cols-3">
          {platform.map((item) => (
            <li
              key={item.id}
              id={item.id}
              className="flex flex-col rounded-panel border border-line bg-surface p-6 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <GlyphTile name={item.glyph} tone="neutral" />
                <StatusBadge status={item.status} />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{item.summary}</p>
              <ul className="mt-5 space-y-2 border-t border-line pt-5 text-sm text-ink-muted">
                {item.points.map((point) => (
                  <li key={point} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-stone-400"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      {/* Teams and roles */}
      <Section tone="tinted" labelledBy="teams-heading">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <StatusBadge status={teams.status} />
            <SectionHeading
              id="teams-heading"
              title="Give everyone the right access"
              lead={teams.summary}
            />
            <ul className="mt-8 space-y-3">
              {teams.points.map((point) => (
                <li key={point} className="flex gap-3 text-ink-muted">
                  <Check
                    aria-hidden="true"
                    strokeWidth={2}
                    className="mt-1 size-4 shrink-0 text-brand-600"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-panel border border-line bg-surface p-6 shadow-card">
            <p className="text-sm font-semibold text-ink">Suggested roles for a publication</p>
            <p className="mt-1 text-sm text-ink-muted">
              Straight from the invitation screen. Each suggestion is a standard role with fixed
              permissions.
            </p>
            <ul className="mt-5 divide-y divide-line">
              {presets.map((preset) => (
                <li key={preset.role} className="flex items-start justify-between gap-4 py-3">
                  <span>
                    <span className="block text-sm font-medium text-ink">{preset.label}</span>
                    <span className="block text-sm text-ink-muted">{preset.description}</span>
                  </span>
                  <span className="shrink-0 rounded-pill bg-subtle px-2.5 py-0.5 text-xs text-ink-muted">
                    {ROLE_LABELS[preset.role]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Responsive administration */}
      <Section labelledBy="responsive-heading">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
          <div>
            <StatusBadge status="available" />
            <SectionHeading
              id="responsive-heading"
              title="Run it from any screen"
              lead="Not a shrunken desktop. Each device gets a layout designed for how you hold it."
            />
            <ul className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: Monitor,
                  title: "Desktop",
                  body: "Sidebar, breadcrumbs and a ⌘K command menu.",
                },
                {
                  icon: Tablet,
                  title: "Tablet",
                  body: "An icon rail and a drawer, with larger targets.",
                },
                {
                  icon: Smartphone,
                  title: "Phone",
                  body: "A bottom bar with your key areas and a More sheet.",
                },
              ].map((item) => (
                <li key={item.title}>
                  <item.icon
                    aria-hidden="true"
                    strokeWidth={ICON_STROKE}
                    className="size-5 text-brand-700"
                  />
                  <p className="mt-3 font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <PhonePreview type="PUBLISHING" className="mx-auto" />
        </div>
      </Section>

      {/* Physical retail: future */}
      <section aria-labelledby="retail-heading" className="border-y border-line bg-canvas py-12">
        <Container>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <GlyphTile name={retail.glyph} tone="neutral" size="lg" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="retail-heading" className="text-lg font-semibold text-ink">
                  Selling in person too?
                </h2>
                <StatusBadge status={retail.status} />
              </div>
              <p className="mt-1.5 max-w-2xl text-ink-muted">
                A connection with OmniPOS point of sale is planned for shops that sell online and in
                store. It isn&apos;t part of Storevia today, and we&apos;ll share details when it
                is.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Pricing from the plan catalogue */}
      <Section labelledBy="pricing-heading">
        <SectionHeading
          id="pricing-heading"
          eyebrow="Pricing"
          title="Start free. Grow when you're ready."
          lead="Every plan covers all the stores in your organisation."
          align="center"
        />
        <div className="mt-12">
          {catalogue ? (
            <PlanCards catalogue={catalogue} signUpHref={links.signUp} />
          ) : (
            <Alert tone="info" className="mx-auto max-w-xl">
              Plan details are temporarily unavailable. Please try again shortly.
            </Alert>
          )}
        </div>
        <p className="mt-8 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
          >
            Compare every feature
            <ArrowRight aria-hidden="true" strokeWidth={ICON_STROKE} className="size-4" />
          </Link>
        </p>
      </Section>

      {/* FAQ */}
      <Section id="faq" tone="tinted" labelledBy="faq-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <SectionHeading
            id="faq-heading"
            title="Questions, answered honestly"
            lead={
              <>
                Something else?{" "}
                <Link href="/contact" className="font-medium text-brand-700 hover:underline">
                  Get in touch
                </Link>
                .
              </>
            }
          />
          <FaqList />
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
