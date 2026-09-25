"use client";

import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { Activity, Building2, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type AdminNavId, type AdminNavItem } from "@/lib/navigation";

const ICONS: Record<AdminNavId, LucideIcon> = {
  organisations: Building2,
  jobs: Activity,
  account: UserRound,
};

/**
 * The staff sections. In the header row on desktop; a full-width tab row
 * under it on tablets and phones. The current section carries a brand
 * underline and aria-current.
 */
export function AdminNav({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="min-w-0">
      <ul className="-mb-px flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none] lg:gap-0.5">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex h-11 items-center gap-1.5 rounded-control px-2 text-body-sm font-medium whitespace-nowrap sm:gap-2 sm:px-3 lg:h-14",
                  "transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                  // The underline sits on the header's hairline.
                  "after:absolute after:inset-x-2 after:bottom-0 sm:after:inset-x-3 after:h-0.5 after:rounded-pill after:transition-colors after:duration-(--duration-fast)",
                  active
                    ? "text-ink after:bg-brand-600"
                    : "text-ink-muted hover:text-ink hover:after:bg-line-strong",
                )}
              >
                <Icon
                  icon={ICONS[item.id]}
                  size="sm"
                  className={
                    active ? "text-brand-600" : "text-ink-faint group-hover:text-ink-muted"
                  }
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
