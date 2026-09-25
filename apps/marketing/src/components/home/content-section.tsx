// 09 Content and publishing: the post editor beside the parts of publishing,
// each with its status. Content tools are on the roadmap; the roles for
// authors and editors already exist. The copy comes first in the DOM so it
// leads when stacked; the editor moves left only from lg.
import { Reveal, SlideReveal } from "@storevia/ui/motion";
import { Section, SectionHeading, StatusPill } from "@/components/marketing";
import { capability } from "@/content/capabilities";
import { IllustrativeNote } from "@/components/product/frame";
import { PostEditor } from "@/components/product/post-editor";
import { CONTENT_PARTS } from "./content";

export function ContentSection() {
  const content = capability("content");
  return (
    <Section labelledBy="content-heading">
      <div className="grid gap-12 lg:grid-cols-[7fr_5fr] lg:items-start lg:gap-16">
        <Reveal className="min-w-0">
          <SectionHeading
            id="content-heading"
            eyebrow="Content and publishing"
            status={content.status}
            title="Write, edit and publish as a team"
            lead="For publications, and for any business that shares news. Drafts move from author to editor to published, and every post is ready for search."
          />
          <dl className="mt-9 space-y-5">
            {CONTENT_PARTS.map((part) => (
              <div key={part.title} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                <dt className="text-body font-semibold text-ink">{part.title}</dt>
                <dd className="row-span-2 self-start">
                  <StatusPill status={part.status} />
                </dd>
                <dd className="text-body-sm text-ink-muted">{part.description}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <SlideReveal
          direction="right"
          className="min-w-0 lg:sticky lg:top-28 lg:order-first lg:mt-10"
        >
          <PostEditor className="h-[28rem] sm:h-[30rem]" />
          <IllustrativeNote className="mt-4">
            A concept of publishing on the roadmap, with a sample post.
          </IllustrativeNote>
        </SlideReveal>
      </div>
    </Section>
  );
}
