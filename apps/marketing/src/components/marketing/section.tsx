import { cn } from "@storevia/ui/cn";
import type { ReactNode } from "react";
import type { Status } from "@/content/capabilities";
import { StatusPill } from "./status-pill";

/**
 * The one marketing container: 1216 px wide at most (container-content), with
 * 16 px side padding on phones and 24 px from 640 px. The header, the footer
 * and every section use it, so their edges line up at every width.
 */
export const CONTAINER_CLASS = "mx-auto w-full max-w-(--container-content) px-4 sm:px-6";

export function Container({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  return <div className={cn(CONTAINER_CLASS, className)}>{children}</div>;
}

export type SectionTone = "plain" | "tinted";
export type SectionSpace = "default" | "compact" | "none";

// Vertical rhythm from the design plan: 72 px on phones, 96 on tablets and
// 112 on desktop.
const SPACE: Record<SectionSpace, string> = {
  default: "py-18 md:py-24 lg:py-28",
  compact: "py-14 md:py-16 lg:py-20",
  none: "",
};

// A plain section straight after another plain one drops its top padding:
// with no band change to mark the boundary, the two paddings would otherwise
// stack into a 224 px gap that reads as a missing section.
const FOLLOWS_PLAIN = "[[data-tone=plain]+&]:pt-0";

const TONE: Record<SectionTone, string> = {
  plain: FOLLOWS_PLAIN,
  // The quiet cool grey: the only "coloured" band the white-first site uses.
  tinted: "border-y border-line bg-surface-sunken",
};

export interface SectionProps {
  id?: string;
  /** plain (white) or tinted (a very light cool grey band with hairlines). */
  tone?: SectionTone;
  space?: SectionSpace;
  /** Id of the heading that names the section. */
  labelledBy?: string;
  className?: string;
  /** Classes for the inner container. */
  containerClassName?: string;
  children: ReactNode;
}

/** A page section: a named region with the standard rhythm, holding a Container. */
export function Section({
  id,
  tone = "plain",
  space = "default",
  labelledBy,
  className,
  containerClassName,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-tone={tone}
      className={cn("scroll-mt-16", SPACE[space], TONE[tone], className)}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

const TITLE_SIZE = {
  h1: "text-h1 lg:text-display-l",
  h2: "text-h2 lg:text-h1",
  h3: "text-h3",
} as const;

export interface SectionHeadingProps {
  /** Id for the heading, so a Section can be labelled by it. */
  id?: string;
  /** A short label above the title, e.g. "Pricing". */
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** A capability status beside the eyebrow (from content/capabilities.ts). */
  status?: Status;
  align?: "start" | "center";
  /** h1 for a page title, h2 (default) for a section, h3 inside one. */
  as?: "h1" | "h2" | "h3";
  className?: string;
  /** Actions or links under the lead. */
  children?: ReactNode;
}

/** Eyebrow, title, lead and optional status or actions: the head of every section. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  status,
  align = "start",
  as: Heading = "h2",
  className,
  children,
}: SectionHeadingProps) {
  const center = align === "center";
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center", className)}>
      {eyebrow || status ? (
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center gap-x-3 gap-y-2",
            center && "justify-center",
          )}
        >
          {eyebrow ? <p className="text-overline text-brand-700 uppercase">{eyebrow}</p> : null}
          {status ? <StatusPill status={status} /> : null}
        </div>
      ) : null}
      <Heading id={id} className={cn("font-display text-ink", TITLE_SIZE[Heading])}>
        {title}
      </Heading>
      {lead ? (
        <p className={cn("mt-5 max-w-[40rem] text-body-lg text-ink-muted", center && "mx-auto")}>
          {lead}
        </p>
      ) : null}
      {children ? (
        <div
          className={cn(
            "mt-8 flex flex-wrap items-center gap-x-6 gap-y-3",
            center && "justify-center",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
