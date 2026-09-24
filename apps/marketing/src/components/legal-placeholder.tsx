import { Alert } from "@storevia/ui";
import Link from "next/link";
import { Section, SectionHeading } from "./section";

/**
 * Placeholder for a legal document. Deliberately not a draft agreement: the
 * real text is written and approved by counsel before launch.
 */
export function LegalPlaceholder({ title, covers }: { title: string; covers: readonly string[] }) {
  return (
    <Section labelledBy="legal-title">
      <div className="max-w-(--container-prose)">
        <SectionHeading as="h1" id="legal-title" eyebrow="Legal" title={title} />
        <Alert tone="info" title="Not yet published" className="mt-8">
          Storevia&apos;s {title.toLowerCase()} will be published here before public launch. This
          page is a placeholder and is not a legal agreement.
        </Alert>
        <h2 className="mt-10 text-lg font-semibold text-ink">What it will cover</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-muted">
          {covers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-8 text-ink-muted">
          Questions in the meantime?{" "}
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Contact us
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}
