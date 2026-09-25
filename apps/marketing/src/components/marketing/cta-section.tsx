import { buttonClasses } from "@storevia/ui/button";
import { LogoMark } from "@storevia/ui/icons";
import { Reveal } from "@storevia/ui/motion";
import Link from "next/link";
import type { ReactNode } from "react";
import { appLinks } from "@/lib/env";
import { Section } from "./section";

export interface CTASectionProps {
  /** Id of the heading (the section is labelled by it). */
  id?: string;
  title?: ReactNode;
  lead?: ReactNode;
  /** Secondary action; defaults to "Talk to us" (contact). */
  secondary?: { label: string; href: string };
}

/**
 * The closing call to action: a quiet, hairline-framed panel with the mark,
 * a heading and Start free. White-first: no dark band, no gradient.
 */
export function CTASection({
  id = "cta-heading",
  title = "Start building your online presence",
  lead = "Create your organisation and first store in a few minutes. Free to start, no card needed.",
  secondary = { label: "Talk to us", href: "/contact" },
}: CTASectionProps) {
  return (
    <Section labelledBy={id}>
      <Reveal className="rounded-panel border border-line bg-surface-sunken px-6 py-16 text-center sm:px-12 lg:py-24">
        <LogoMark size={40} className="mx-auto" />
        <h2
          id={id}
          className="mx-auto mt-8 max-w-3xl font-display text-h2 text-ink lg:text-display-l"
        >
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-body-lg text-ink-muted">{lead}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={appLinks().signUp} className={buttonClasses("primary", "lg")}>
            Start free
          </a>
          <Link href={secondary.href} className={buttonClasses("secondary", "lg")}>
            {secondary.label}
          </Link>
        </div>
      </Reveal>
    </Section>
  );
}
