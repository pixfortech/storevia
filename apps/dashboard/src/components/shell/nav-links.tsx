"use client";

import { cn, ICON_STROKE } from "@storevia/ui";
import { Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "./icons";
import type { ShellLink } from "./types";

export function isActive(pathname: string, link: Pick<ShellLink, "href" | "exact">): boolean {
  return link.exact
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

/** Status after a label: "Soon" for unreleased areas, a lock for areas outside the plan. */
function LinkStatus({ link }: { link: ShellLink }) {
  if (!link.soon && !link.locked) return null;
  return (
    <span className="ml-auto flex items-center gap-1.5 text-ink-faint">
      {link.soon ? <span className="text-[11px] font-medium">Soon</span> : null}
      {link.locked ? (
        <>
          <Lock aria-hidden="true" strokeWidth={ICON_STROKE} className="size-3.5" />
          <span className="sr-only">(not included in your plan)</span>
        </>
      ) : null}
    </span>
  );
}

/** Vertical navigation. `compact` renders the tablet icon rail. */
export function NavLinks({
  links,
  compact = false,
  onNavigate,
}: {
  links: readonly ShellLink[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul className={cn("space-y-0.5", compact && "flex flex-col items-center gap-1 space-y-0")}>
      {links.map((link) => {
        const Icon = NAV_ICONS[link.icon];
        const active = isActive(pathname, link);
        return (
          <li key={link.key} className={cn(compact && "w-full")}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              title={compact ? link.label : undefined}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              className={cn(
                "group relative flex items-center rounded-control text-sm font-medium transition-colors duration-(--duration-fast)",
                compact ? "mx-auto size-11 justify-center" : "h-9 gap-3 px-2.5",
                active ? "bg-subtle text-ink" : "text-ink-muted hover:bg-subtle/70 hover:text-ink",
                !active && link.soon && "text-ink-faint",
              )}
            >
              <Icon
                aria-hidden="true"
                strokeWidth={ICON_STROKE}
                className={cn(
                  "size-[18px] shrink-0",
                  active ? "text-brand-700" : "text-ink-faint group-hover:text-ink-muted",
                )}
              />
              {compact ? (
                <span className="sr-only">{link.label}</span>
              ) : (
                <>
                  <span className="truncate">{link.label}</span>
                  <LinkStatus link={link} />
                </>
              )}
              {active && !compact ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 -left-3 w-0.5 rounded-pill bg-brand-600"
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled group of links (e.g. "Organisation" under store navigation). */
export function NavSection({
  label,
  links,
  onNavigate,
}: {
  label: string;
  links: readonly ShellLink[];
  onNavigate?: () => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="mb-1.5 px-2.5 text-xs font-medium text-ink-faint">{label}</p>
      <NavLinks links={links} {...(onNavigate ? { onNavigate } : {})} />
    </div>
  );
}
