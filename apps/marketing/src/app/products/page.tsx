import { GlyphTile, ICON_STROKE } from "@storevia/ui";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand } from "@/components/cta-band";
import { Section, SectionHeading } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { CAPABILITIES, STATUS_LABELS, type Status } from "@/content/capabilities";

export const metadata: Metadata = {
  title: "Product",
  description: "What Storevia does today, and what is being built next.",
};

const ORDER: readonly Status[] = ["available", "in-development", "roadmap", "future"];

export default function ProductsPage() {
  return (
    <>
      <Section className="pb-8 sm:pb-10" labelledBy="products-title">
        <SectionHeading
          as="h1"
          id="products-title"
          eyebrow="Product"
          title="Everything in one workspace, labelled honestly"
          lead="Storevia is being built in stages. Here is what you can use today, and what comes next."
        />
      </Section>
      {ORDER.map((status) => {
        const items = CAPABILITIES.filter((c) => c.status === status);
        if (items.length === 0) return null;
        return (
          <Section key={status} className="py-10 sm:py-12 lg:py-14" labelledBy={`group-${status}`}>
            <h2
              id={`group-${status}`}
              className="flex items-center gap-3 text-xl font-semibold text-ink"
            >
              {STATUS_LABELS[status]}
            </h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  id={item.id}
                  className="scroll-mt-24 rounded-panel border border-line bg-surface p-6 shadow-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <GlyphTile
                      name={item.glyph}
                      tone={status === "available" ? "brand" : "neutral"}
                    />
                    <StatusBadge status={item.status} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-ink-muted">{item.summary}</p>
                  {item.points.length > 0 ? (
                    <ul className="mt-5 space-y-2 text-sm text-ink-muted">
                      {item.points.map((point) => (
                        <li key={point} className="flex gap-2.5">
                          <Check
                            aria-hidden="true"
                            strokeWidth={ICON_STROKE}
                            className="mt-0.5 size-4 shrink-0 text-ink-faint"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
      <CtaBand />
    </>
  );
}
