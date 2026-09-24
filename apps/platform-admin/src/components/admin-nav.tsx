"use client";

import { cn } from "@storevia/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminNavItem {
  readonly href: string;
  readonly label: string;
}

/** Top navigation on the dark staff bar. */
export function AdminNav({ items, label }: { items: readonly AdminNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-control px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-stone-300 hover:bg-white/5 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
