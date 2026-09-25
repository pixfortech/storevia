import { cn } from "@storevia/ui/cn";
import { Glyph, Icon, type GlyphName } from "@storevia/ui/icons";
import { Stagger } from "@storevia/ui/motion";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Status } from "@/content/capabilities";
import { StatusPill } from "./status-pill";

export interface FeatureRailItem {
  title: string;
  description: ReactNode;
  /** A Storevia product glyph (preferred for product concepts)… */
  glyph?: GlyphName;
  /** …or a Lucide icon for everything else. */
  icon?: LucideIcon;
  status?: Status;
  /** Replaces the status wording, e.g. "Milestone 6" (still shown in the status's look). */
  statusLabel?: string;
  /** Makes the whole item a link. */
  href?: string;
  /** Extra detail under the description. */
  meta?: ReactNode;
}

const COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  6: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
} as const;

export interface FeatureRailProps {
  items: readonly FeatureRailItem[];
  columns?: keyof typeof COLUMNS;
  /** Prefix each item with its index (01, 02, …). */
  numbered?: boolean;
  /** Heading level of each item's title. Default h3. */
  titleAs?: "h3" | "h4";
  className?: string;
}

/**
 * A row of features, each under a hairline rule rather than in a box: a
 * glyph or icon, a title, one or two lines and an optional status. Staggers
 * in on first view.
 */
export function FeatureRail({
  items,
  columns = 3,
  numbered = false,
  titleAs: Title = "h3",
  className,
}: FeatureRailProps) {
  return (
    <Stagger
      as="ul"
      itemAs="li"
      className={cn("grid gap-x-8 gap-y-10", COLUMNS[columns], className)}
    >
      {items.map((item, index) => {
        const body = (
          <>
            <div className="flex min-h-7 items-center justify-between gap-3">
              {numbered ? (
                <span className="text-caption font-medium text-ink-faint tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
              ) : item.glyph ? (
                <Glyph name={item.glyph} className="size-7 text-ink" />
              ) : item.icon ? (
                <Icon icon={item.icon} size="lg" className="text-ink" />
              ) : (
                <span />
              )}
              {item.status ? (
                <StatusPill
                  status={item.status}
                  {...(item.statusLabel ? { label: item.statusLabel } : {})}
                />
              ) : null}
            </div>
            <Title
              className={cn(
                "mt-5 font-display text-h4 text-ink",
                item.href &&
                  "transition-colors duration-(--duration-fast) group-hover/rail:text-brand-700",
              )}
            >
              {item.title}
            </Title>
            <p className="mt-2 text-body-sm text-ink-muted">{item.description}</p>
            {item.meta ? <div className="mt-4">{item.meta}</div> : null}
          </>
        );
        return (
          <div key={item.title} className="h-full border-t border-line pt-6">
            {item.href ? (
              <Link
                href={item.href}
                className="group/rail block h-full rounded-xs focus-visible:outline-offset-4"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </div>
        );
      })}
    </Stagger>
  );
}
