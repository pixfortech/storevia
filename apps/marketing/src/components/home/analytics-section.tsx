// 12 Analytics: the report as a live preview on example data. Analytics is
// on the roadmap; the heading says so and every chart carries the "Example
// data" marker. What plans already decide (history kept) is real.
import { Section, SectionHeading } from "@/components/marketing";
import { capability } from "@/content/capabilities";
import { AnalyticsPreview } from "@/components/product/analytics";

export function AnalyticsSection() {
  return (
    <Section labelledBy="analytics-heading" tone="tinted">
      <div className="grid items-end gap-6 lg:grid-cols-2 lg:gap-16">
        <SectionHeading
          id="analytics-heading"
          eyebrow="Analytics"
          status={capability("analytics").status}
          title="See what’s working, at a glance"
        />
        <p className="max-w-xl text-body-lg text-ink-muted lg:justify-self-end">
          Traffic, engagement and sales in one report, with how much history you keep set by your
          plan. This is a preview on example data: explore the charts, or switch any of them to a
          table.
        </p>
      </div>
      <AnalyticsPreview className="mt-12 lg:mt-14" />
    </Section>
  );
}
