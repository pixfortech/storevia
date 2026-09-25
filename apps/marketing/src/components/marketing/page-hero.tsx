import { cn } from "@storevia/ui/cn";
import { ScaleIn } from "@storevia/ui/motion";
import type { ReactNode } from "react";
import type { Status } from "@/content/capabilities";
import { Container, SectionHeading } from "./section";

export interface PageHeroProps {
  /** Id of the h1 (the hero section is labelled by it). Default "page-title". */
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  status?: Status;
  /** Buttons or links under the lead. */
  actions?: ReactNode;
  /** Anything else under the copy, e.g. anchor chips. */
  children?: ReactNode;
  /** A product visual: under the copy (stack) or beside it (split, from 1024 px). */
  visual?: ReactNode;
  layout?: "stack" | "split";
  align?: "start" | "center";
  className?: string;
}

/**
 * The top of an inner marketing page: the page's one h1 with its eyebrow,
 * lead and actions, and an optional product visual. The home page has its
 * own hero; every other page starts with this.
 */
export function PageHero({
  id = "page-title",
  eyebrow,
  title,
  lead,
  status,
  actions,
  children,
  visual,
  layout = "stack",
  align = "start",
  className,
}: PageHeroProps) {
  const split = layout === "split" && visual;
  return (
    <section
      aria-labelledby={id}
      className={cn("pt-14 pb-14 md:pt-20 md:pb-18 lg:pt-24 lg:pb-20", className)}
    >
      <Container
        className={cn(split && "grid items-center gap-12 lg:grid-cols-[5fr_6fr] lg:gap-16")}
      >
        <div className="min-w-0">
          <SectionHeading
            as="h1"
            id={id}
            eyebrow={eyebrow}
            title={title}
            lead={lead}
            align={split ? "start" : align}
            {...(status ? { status } : {})}
          >
            {actions}
          </SectionHeading>
          {children ? (
            <div className={cn("mt-8", !split && align === "center" && "flex justify-center")}>
              {children}
            </div>
          ) : null}
        </div>
        {visual ? (
          <ScaleIn className={cn("min-w-0", !split && "mt-14 md:mt-16")}>{visual}</ScaleIn>
        ) : null}
      </Container>
    </section>
  );
}
