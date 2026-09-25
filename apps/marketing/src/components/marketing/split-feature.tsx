import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { Reveal, SlideReveal } from "@storevia/ui/motion";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { Status } from "@/content/capabilities";
import { SectionHeading } from "./section";

export interface SplitFeaturePoint {
  title: string;
  description: ReactNode;
}

export interface SplitFeatureProps {
  /** Id for the heading (label the surrounding Section with it). */
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  status?: Status;
  /** Titled points under the lead… */
  points?: readonly SplitFeaturePoint[];
  /** …or a plain checklist. */
  checklist?: readonly ReactNode[];
  /** Links or buttons under the copy. */
  actions?: ReactNode;
  /** The product visual (a mockup from components/product, or any composition). */
  visual: ReactNode;
  /** Put the visual first on wide screens (alternate rows with it). */
  reverse?: boolean;
  /** Heading level: h2 when the split is the section, h3 inside a larger section. */
  as?: "h2" | "h3";
  /** Share of the width the copy takes on wide screens. Default "balanced". */
  weight?: "balanced" | "visual";
  className?: string;
}

/**
 * Copy on one side, a product visual on the other; stacked (copy first) below
 * 1024 px. Alternate `reverse` between consecutive rows for rhythm.
 */
export function SplitFeature({
  id,
  eyebrow,
  title,
  lead,
  status,
  points,
  checklist,
  actions,
  visual,
  reverse = false,
  as = "h2",
  weight = "balanced",
  className,
}: SplitFeatureProps) {
  return (
    <div
      className={cn(
        "grid items-center gap-12 lg:gap-16",
        weight === "visual" ? "lg:grid-cols-[5fr_7fr]" : "lg:grid-cols-2",
        reverse && weight === "visual" && "lg:grid-cols-[7fr_5fr]",
        className,
      )}
    >
      <Reveal className={cn("min-w-0", reverse && "lg:order-2")}>
        <SectionHeading
          as={as}
          eyebrow={eyebrow}
          title={title}
          lead={lead}
          {...(id ? { id } : {})}
          {...(status ? { status } : {})}
        />
        {points ? (
          <dl className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {points.map((point) => (
              <div key={point.title} className="border-l border-line pl-4">
                <dt className="font-display text-body font-semibold text-ink">{point.title}</dt>
                <dd className="mt-1.5 text-body-sm text-ink-muted">{point.description}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {checklist ? (
          <ul className="mt-8 space-y-3">
            {checklist.map((line, index) => (
              <li key={index} className="flex gap-3 text-body text-ink-muted">
                <Icon icon={Check} size="sm" className="mt-1 text-brand-600" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {actions ? (
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">{actions}</div>
        ) : null}
      </Reveal>
      <SlideReveal
        direction={reverse ? "right" : "left"}
        className={cn("min-w-0", reverse && "lg:order-1")}
      >
        {visual}
      </SlideReveal>
    </div>
  );
}
