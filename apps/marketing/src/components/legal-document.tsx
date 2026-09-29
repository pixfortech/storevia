import type { Metadata } from "next";
import { legalDocument, type LegalDocumentKey } from "@/content/legal";
import { LEGAL_BODIES } from "@/content/legal-bodies";
import { LegalPlaceholder } from "./legal-placeholder";
import { Container, SectionHeading } from "./marketing";

/**
 * A platform legal page from content/legal.ts: the marked placeholder until
 * the document is final, then counsel's approved text with its version and
 * effective date. Placeholders are never indexed.
 */
export function legalMetadata(key: LegalDocumentKey): Metadata {
  const document = legalDocument(key);
  return {
    title: document.title,
    ...(document.status === "final" ? {} : { robots: { index: false } }),
  };
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const document = legalDocument(documentKey);
  if (document.status === "placeholder") {
    return <LegalPlaceholder title={document.title} covers={document.covers} />;
  }
  const Body = LEGAL_BODIES[document.key];
  // A final document without its text is a release mistake: fail loudly.
  if (!Body) throw new Error(`${document.title} is final but has no approved text`);
  return (
    <section
      aria-labelledby="legal-title"
      data-legal-status="final"
      className="pt-14 pb-18 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28"
    >
      <Container>
        <div className="mx-auto max-w-(--container-prose)">
          <SectionHeading as="h1" id="legal-title" eyebrow="Legal" title={document.title} />
          <p className="mt-4 text-body-sm text-ink-muted">
            Version {document.version}, effective {formatDate(document.effectiveDate)}
          </p>
          <div className="mt-10">
            <Body />
          </div>
        </div>
      </Container>
    </section>
  );
}
