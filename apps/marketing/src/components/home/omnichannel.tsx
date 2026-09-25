// 14 Future omnichannel: one restrained band. In-person selling is a future
// direction only: Storevia has no point of sale, and OmniPOS appears here as
// ecosystem direction, never as something that exists today.
import { BusinessScene } from "@storevia/ui/illustrations";
import { Reveal } from "@storevia/ui/motion";
import { Section, SectionHeading } from "@/components/marketing";
import { capability } from "@/content/capabilities";

export function Omnichannel() {
  const retail = capability("retail");
  return (
    <Section labelledBy="retail-heading">
      <Reveal className="grid items-center gap-10 rounded-panel border border-dashed border-line-strong px-6 py-10 sm:px-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16 lg:px-14 lg:py-14">
        <div className="mx-auto w-full max-w-xs md:max-w-sm">
          <BusinessScene type="retail-outlet" accent="violet" />
        </div>
        <div>
          {/* The status pill sits in the heading's own block: the "Future" label travels with it. */}
          <SectionHeading
            id="retail-heading"
            eyebrow="Future direction"
            status={retail.status}
            title="Selling in person too?"
            className="max-w-xl"
          />
          <div className="mt-5 max-w-xl space-y-3 text-body text-ink-muted">
            <p>
              Physical retail is a future direction for the Storevia ecosystem: a connection with
              OmniPOS point of sale, so shops that sell online and in store could keep one catalogue
              and one view of stock.
            </p>
            <p>
              It isn&apos;t part of Storevia today and there&apos;s no date yet. We&apos;ll share
              details when there&apos;s something real to show.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
