// 07 Commerce: copy and a part-by-part status list beside the product
// editor. Catalogue, checkout, orders and customers are live; the list marks
// the parts that are planned, so nothing unfinished reads as live.
import { Reveal, SlideReveal } from "@storevia/ui/motion";
import { Section, SectionHeading, StatusPill } from "@/components/marketing";
import { capability } from "@/content/capabilities";
import { IllustrativeNote } from "@/components/product/frame";
import { ProductEditor } from "@/components/product/product-editor";
import { COMMERCE_PARTS } from "./content";

export function CommerceSection() {
  const commerce = capability("commerce");
  return (
    <Section labelledBy="commerce-heading" tone="tinted">
      <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-16">
        <Reveal className="min-w-0">
          <SectionHeading
            id="commerce-heading"
            eyebrow="Commerce"
            status={commerce.status}
            title="From catalogue to delivered order"
            lead="Products with options and variants, stock tracked by location, a checkout paid through your own Razorpay account, and orders, fulfilment and customers in one place."
          />
          <ul className="mt-9 divide-y divide-line border-y border-line">
            {COMMERCE_PARTS.map((part) => (
              <li
                key={part.title}
                className="flex min-h-12 items-center justify-between gap-4 py-2.5"
              >
                <span className="text-body-sm font-medium text-ink">{part.title}</span>
                <StatusPill status={part.status} />
              </li>
            ))}
          </ul>
        </Reveal>
        <SlideReveal direction="left" className="min-w-0 lg:sticky lg:top-28 lg:mt-10">
          <ProductEditor className="h-[28rem] sm:h-[30rem]" />
          <IllustrativeNote className="mt-4">
            An illustration of the product editor, with sample products.
          </IllustrativeNote>
        </SlideReveal>
      </div>
    </Section>
  );
}
