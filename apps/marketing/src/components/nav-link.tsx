"use client";

import { cn } from "@storevia/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-control px-3 text-sm font-medium transition-colors",
        active ? "text-ink" : "text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
