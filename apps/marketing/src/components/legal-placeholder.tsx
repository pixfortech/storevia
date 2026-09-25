import { Alert, Icon } from "@storevia/ui";
import { Minus } from "lucide-react";
import { ArrowLink, Container, SectionHeading } from "./marketing";

/**
 * Placeholder for a legal document. Deliberately not a draft agreement: the
 * real text is written and approved by counsel before launch.
 */
export function LegalPlaceholder({ title, covers }: { title: string; covers: readonly string[] }) {
  return (
    <section
      aria-labelledby="legal-title"
      className="pt-14 pb-18 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28"
    >
      <Container>
        <div className="mx-auto max-w-(--container-prose)">
          <SectionHeading as="h1" id="legal-title" eyebrow="Legal" title={title} />
          <Alert tone="info" title="Not yet published" className="mt-10">
            Storevia&apos;s {title.toLowerCase()} will be published here before public launch. This
            page is a placeholder and is not a legal agreement.
          </Alert>
          <div className="mt-10 rounded-panel border border-line">
            <h2 className="border-b border-line px-6 py-4 font-display text-h4 text-ink">
              What it will cover
            </h2>
            <ul className="divide-y divide-line">
              {covers.map((item) => (
                <li key={item} className="flex gap-3 px-6 py-4 text-body text-ink-muted">
                  <Icon icon={Minus} size="sm" className="mt-1 text-ink-faint" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 text-body text-ink-muted">Questions in the meantime?</p>
          <ArrowLink href="/contact" className="mt-2">
            Contact us
          </ArrowLink>
        </div>
      </Container>
    </section>
  );
}
