import { cn } from "@storevia/ui/cn";
import type { ReactNode } from "react";

/**
 * The dashboard's one support destination (DB-3): /support redirects to the
 * configured SUPPORT_URL (or the marketing site's contact page), so every
 * help link, in server or client components, signed in or out, leads to the
 * same place. A plain anchor: the route redirects off the dashboard.
 */
export const SUPPORT_PATH = "/support";

export function SupportLink({
  children = "contact support",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={SUPPORT_PATH}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-medium text-brand-700 underline-offset-2 hover:underline", className)}
      data-testid="support-link"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
