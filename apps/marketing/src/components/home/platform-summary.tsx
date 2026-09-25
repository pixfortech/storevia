// 03 Platform summary: the six parts of Storevia in one hairline grid, each
// with its glyph, one line and its real status.
import { Glyph } from "@storevia/ui/icons";
import { Section, SectionHeading, StatusPill } from "@/components/marketing";
import { PLATFORM } from "./content";

export function PlatformSummary() {
  return (
    <Section labelledBy="platform-heading" space="compact">
      <div className="grid items-end gap-6 lg:grid-cols-2 lg:gap-16">
        <SectionHeading
          id="platform-heading"
          eyebrow="One platform"
          title="Everything your business runs online, in one place"
        />
        <p className="max-w-xl text-body-lg text-ink-muted lg:justify-self-end">
          Some of it is ready today and the rest is on a public roadmap. Every part shows its
          status, so you know exactly what you&apos;re getting.
        </p>
      </div>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 xl:grid-cols-6">
        {PLATFORM.map((item) => (
          <li
            key={item.title}
            className="grid grid-cols-[auto_1fr] gap-x-4 bg-surface p-5 sm:flex sm:flex-col sm:p-6 xl:p-5 2xl:p-6"
          >
            <Glyph name={item.glyph} className="row-span-3 size-7 text-ink" />
            <h3 className="font-display text-h4 text-ink sm:mt-6">{item.title}</h3>
            <p className="mt-1.5 flex-1 text-body-sm text-ink-muted sm:mt-2">{item.description}</p>
            <StatusPill
              status={item.status}
              className="mt-4 self-start justify-self-start sm:mt-5"
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
