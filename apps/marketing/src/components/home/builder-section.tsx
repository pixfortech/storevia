// 06 Website builder: the editor as a concept, full width, with numbered
// captions for its parts. The builder is on the roadmap, and the section
// says so before anything else.
import { ScaleIn, Stagger } from "@storevia/ui/motion";
import { ArrowLink, Section, SectionHeading } from "@/components/marketing";
import { capability } from "@/content/capabilities";
import { EditorWindow } from "@/components/product/builder";
import { IllustrativeNote } from "@/components/product/frame";
import { BUILDER_PARTS } from "./content";

export function BuilderSection() {
  const builder = capability("builder");
  return (
    <Section labelledBy="builder-heading">
      <div className="grid items-end gap-6 lg:grid-cols-2 lg:gap-16">
        <SectionHeading
          id="builder-heading"
          eyebrow="Website builder"
          status={builder.status}
          title="Design every page visually, for every screen"
        />
        <div className="max-w-xl lg:justify-self-end">
          <p className="text-body-lg text-ink-muted">
            The builder follows the product catalogue on the roadmap. Here is where it&apos;s
            heading: sections you arrange, words you edit in place and a preview for each screen,
            with drafts and safe publishing.
          </p>
          <ArrowLink href="/resources#roadmap" className="mt-4">
            See the roadmap
          </ArrowLink>
        </div>
      </div>
      <ScaleIn className="mt-12 lg:mt-16">
        <EditorWindow markers className="h-[26rem] sm:h-[30rem] lg:h-[36rem]" />
      </ScaleIn>
      <IllustrativeNote className="mt-5">
        A concept of a feature on the roadmap, not a shipped screen.
      </IllustrativeNote>
      <Stagger
        as="ol"
        itemAs="li"
        className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-5"
      >
        {BUILDER_PARTS.map((part, index) => (
          <div key={part.title} className="flex gap-3.5 border-t border-line pt-5">
            <span
              aria-hidden="true"
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10.5px] font-semibold text-white tabular-nums"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="text-body font-semibold text-ink">{part.title}</h3>
              <p className="mt-1 text-body-sm text-ink-muted">{part.description}</p>
            </div>
          </div>
        ))}
      </Stagger>
    </Section>
  );
}
