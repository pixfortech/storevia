// 15 FAQ: commercial questions, answered as the product is today.
import { FaqList } from "@/components/faq-list";
import { ArrowLink, Section, SectionHeading } from "@/components/marketing";

export function FaqSection() {
  return (
    <Section id="faq" labelledBy="faq-heading" tone="tinted">
      <div className="grid gap-10 lg:grid-cols-[4fr_7fr] lg:gap-16">
        <div>
          <SectionHeading
            id="faq-heading"
            eyebrow="FAQ"
            title="Questions, answered honestly"
            lead="What Storevia does today, what it costs and what comes next."
          />
          <ArrowLink href="/contact" className="mt-6">
            Ask us something else
          </ArrowLink>
        </div>
        <FaqList />
      </div>
    </Section>
  );
}
