import {
  BUSINESS_TYPE_DEFINITIONS,
  BUSINESS_TYPES,
  STORE_AREAS,
} from "@storevia/tenancy/business-types";
import { GlyphTile } from "@storevia/ui";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand } from "@/components/cta-band";
import { DashboardPreview } from "@/components/dashboard-preview";
import { Section, SectionHeading } from "@/components/section";
import { BUSINESS_TYPE_ANCHOR, BUSINESS_TYPE_GLYPH } from "@/content/business-types";

export const metadata: Metadata = {
  title: "Solutions",
  description: "Storevia for online stores, business websites, publications and portfolios.",
};

export default function SolutionsPage() {
  return (
    <>
      <Section className="pb-6 sm:pb-8" labelledBy="solutions-title">
        <SectionHeading
          as="h1"
          id="solutions-title"
          eyebrow="Solutions"
          title="Shaped around what you're building"
          lead="Choose a business type when you create a store. It decides what Storevia puts first. It never limits what your plan includes or what your team may do, and you can change it at any time without losing anything."
        />
        <nav aria-label="Business types" className="mt-8 flex flex-wrap gap-2">
          {BUSINESS_TYPES.map((type) => (
            <a
              key={type}
              href={`#${BUSINESS_TYPE_ANCHOR[type]}`}
              className="inline-flex h-10 items-center rounded-pill border border-line px-4 text-sm font-medium text-ink-muted hover:border-line-strong hover:text-ink"
            >
              {BUSINESS_TYPE_DEFINITIONS[type].label}
            </a>
          ))}
        </nav>
      </Section>
      {BUSINESS_TYPES.map((type, index) => {
        const definition = BUSINESS_TYPE_DEFINITIONS[type];
        const areas = definition.navigation.map((key) => STORE_AREAS[key]);
        return (
          <Section
            key={type}
            id={BUSINESS_TYPE_ANCHOR[type]}
            tone={index % 2 === 0 ? "tinted" : "plain"}
            labelledBy={`${BUSINESS_TYPE_ANCHOR[type]}-heading`}
          >
            <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.15fr]">
              <div>
                <GlyphTile name={BUSINESS_TYPE_GLYPH[type]} size="lg" />
                <h2
                  id={`${BUSINESS_TYPE_ANCHOR[type]}-heading`}
                  className="mt-5 text-3xl font-semibold tracking-tight text-ink"
                >
                  {definition.label}
                </h2>
                <p className="mt-3 text-lg text-ink-muted">{definition.tagline}</p>
                <ul className="mt-6 space-y-2.5">
                  {definition.adapts.map((line) => (
                    <li key={line} className="flex gap-3 text-ink-muted">
                      <Check
                        aria-hidden="true"
                        strokeWidth={2}
                        className="mt-1 size-4 shrink-0 text-brand-600"
                      />
                      {line}
                    </li>
                  ))}
                </ul>
                <h3 className="mt-8 text-sm font-semibold text-ink">Your navigation</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {areas.map((area) => (
                    <li
                      key={area.key}
                      className="rounded-pill border border-line bg-surface px-3 py-1 text-sm text-ink-muted"
                    >
                      {area.label}
                      {area.availability ? <span className="text-ink-faint"> · coming</span> : null}
                    </li>
                  ))}
                </ul>
                <h3 className="mt-8 text-sm font-semibold text-ink">Suggested team roles</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {definition.rolePresets.map((preset) => (
                    <li key={preset.label} className="text-sm">
                      <span className="font-medium text-ink">{preset.label}</span>
                      <span className="block text-ink-muted">{preset.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <DashboardPreview type={type} className="lg:sticky lg:top-24" />
            </div>
          </Section>
        );
      })}
      <CtaBand />
    </>
  );
}
