"use client";

import { cn } from "@storevia/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "./icons";
import type { ShellLink } from "./types";

export function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Vertical navigation. `compact` renders the tablet icon rail. */
export function NavLinks({
  links,
  compact = false,
}: {
  links: readonly ShellLink[];
  compact?: boolean;
}) {
  const pathname = usePathname();
  return (
    <ul className={cn("space-y-0.5", compact && "flex flex-col items-center")}>
      {links.map((link, index) => {
        const Icon = NAV_ICONS[link.icon];
        const active = isActive(pathname, link.href, index === 0);
        return (
          <li key={link.key} className={cn(compact && "w-full")}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              title={compact ? link.label : undefined}
              className={cn(
                "group flex items-center rounded-control text-sm font-medium transition-colors",
                compact ? "mx-auto size-11 justify-center" : "gap-3 px-3 py-2",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-muted hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              {compact ? (
                <span className="sr-only">{link.label}</span>
              ) : (
                <span className="truncate">{link.label}</span>
              )}
              {!compact && link.badge ? (
                <span className="ml-auto rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                  {link.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
