"use client";

import { cn, Dialog } from "@storevia/ui";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ICONS } from "./icons";
import { isActive, NavLinks } from "./nav-links";
import type { ShellLink } from "./types";

/**
 * Mobile navigation: an app-style bottom tab bar with the most used areas and
 * a "More" sheet for the rest. Not a shrunken desktop sidebar.
 */
export function MobileTabBar({ links }: { links: readonly ShellLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = links.filter((l) => l.primaryOnMobile).slice(0, 4);
  const rest = links.filter((l) => !primary.includes(l));
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${String(primary.length + (rest.length ? 1 : 0))}, minmax(0, 1fr))`,
        }}
      >
        {primary.map((link) => {
          const Icon = NAV_ICONS[link.icon];
          const active = isActive(pathname, link.href, link === links[0]);
          return (
            <li key={link.key}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-brand-700" : "text-ink-muted",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {link.label}
              </Link>
            </li>
          );
        })}
        {rest.length ? (
          <li>
            <Dialog
              open={open}
              onOpenChange={setOpen}
              side="bottom"
              title="More"
              trigger={
                <button
                  type="button"
                  className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-muted"
                >
                  <Menu aria-hidden="true" className="size-5" />
                  More
                </button>
              }
            >
              <div
                onClick={() => {
                  setOpen(false);
                }}
              >
                <NavLinks links={rest} />
              </div>
            </Dialog>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
