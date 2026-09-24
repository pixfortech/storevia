import { cn } from "@storevia/ui";
import type { ReactNode } from "react";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-(--container-content) px-4 sm:px-6 lg:px-8", className)}
    >
      {children}
    </div>
  );
}

export function Section({
  id,
  tone = "plain",
  className,
  children,
  labelledBy,
}: {
  id?: string;
  tone?: "plain" | "tinted";
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "scroll-mt-20 py-16 sm:py-20 lg:py-24",
        tone === "tinted" && "border-y border-line bg-canvas",
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "start",
  as: Heading = "h2",
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "start" | "center";
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <p className="text-sm font-semibold text-brand-700">{eyebrow}</p> : null}
      <Heading
        id={id}
        className={cn(
          "mt-3 font-semibold tracking-tight text-balance text-ink",
          Heading === "h1" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
        )}
      >
        {title}
      </Heading>
      {lead ? <p className="mt-4 text-lg text-ink-muted">{lead}</p> : null}
    </div>
  );
}
