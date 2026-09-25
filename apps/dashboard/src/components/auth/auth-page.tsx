import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { Reveal } from "@storevia/ui/motion";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode, Ref } from "react";

/**
 * One auth screen: a heading, its content and an optional footer line.
 * Moving between auth screens eases the new one in; the first server render
 * is never hidden (Reveal only animates client-side mounts).
 */
export function AuthPage({
  title,
  headingRef,
  description,
  icon,
  iconTone = "brand",
  children,
  footer,
}: {
  title: string;
  /** Lets a client view move focus to its heading when it replaces another. */
  headingRef?: Ref<HTMLHeadingElement>;
  description?: ReactNode;
  /** A status icon on a soft tile above the heading (confirmation and link states). */
  icon?: LucideIcon;
  /** brand for good news (a sent email), neutral for a dead end (a used link). */
  iconTone?: "brand" | "neutral";
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Reveal appear>
      {icon ? (
        <span
          className={cn(
            "mb-6 flex size-12 items-center justify-center rounded-card ring-1 ring-inset",
            iconTone === "brand"
              ? "bg-brand-50 text-brand-700 ring-brand-100"
              : "bg-subtle text-ink-muted ring-line",
          )}
        >
          <Icon icon={icon} size="lg" />
        </span>
      ) : null}
      <h1
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="font-display text-h3 text-ink text-balance outline-none sm:text-h2"
      >
        {title}
      </h1>
      {description ? <div className="mt-2 text-body text-ink-muted">{description}</div> : null}
      {children ? <div className="mt-8">{children}</div> : null}
      {footer ? (
        <p className="mt-8 border-t border-line pt-6 text-body-sm text-ink-muted">{footer}</p>
      ) : null}
    </Reveal>
  );
}

/** An inline text link in auth copy. */
export function AuthLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xs font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      {children}
    </Link>
  );
}
