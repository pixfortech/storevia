"use client";

import { cn, Dialog, ICON_STROKE } from "@storevia/ui";
import { LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ICONS } from "./icons";
import { isActive, NavLinks, NavSection } from "./nav-links";
import { useCreateAction } from "./top-bar";
import type { ShellAction, ShellLink } from "./types";

const MAX_PRIMARY = 3;

/**
 * Mobile navigation: an app-style bottom bar with the business type's most
 * used areas and a "More" sheet for everything else. Not a shrunken sidebar.
 */
export function MobileTabBar({
  links,
  organisationLinks,
  organisationLabel,
}: {
  links: readonly ShellLink[];
  organisationLinks: readonly ShellLink[];
  organisationLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  const primary = links.filter((l) => l.primaryOnMobile).slice(0, MAX_PRIMARY);
  const rest = links.filter((l) => !primary.includes(l));
  const moreActive = [...rest, ...organisationLinks].some((l) => isActive(pathname, l));
  const close = () => {
    setOpen(false);
  };
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {primary.map((link) => {
          const Icon = NAV_ICONS[link.icon];
          const active = isActive(pathname, link);
          return (
            <li key={link.key}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-brand-700" : "text-ink-muted",
                )}
              >
                <Icon aria-hidden="true" strokeWidth={ICON_STROKE} className="size-[22px]" />
                <span className="max-w-full truncate px-1">{link.label}</span>
              </Link>
            </li>
          );
        })}
        <li className={cn(primary.length < MAX_PRIMARY && "col-start-4")}>
          <Dialog
            open={open}
            onOpenChange={setOpen}
            side="bottom"
            title="More"
            trigger={
              <button
                type="button"
                aria-current={moreActive ? "page" : undefined}
                className={cn(
                  "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  moreActive ? "text-brand-700" : "text-ink-muted",
                )}
              >
                <LayoutGrid aria-hidden="true" strokeWidth={ICON_STROKE} className="size-[22px]" />
                More
              </button>
            }
          >
            <nav aria-label="More sections" className="px-3">
              <NavLinks links={rest} onNavigate={close} />
              <NavSection label={organisationLabel} links={organisationLinks} onNavigate={close} />
            </nav>
          </Dialog>
        </li>
      </ul>
    </nav>
  );
}

/** The page's create action, floating above the bottom bar on phones. */
export function MobileCreateButton({ actions }: { actions: readonly ShellAction[] }) {
  const action = useCreateAction(actions);
  if (!action) return null;
  return (
    <Link
      href={action.href}
      aria-label={action.label}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-pill bg-brand-600 text-white shadow-[var(--shadow-raised)] transition-colors hover:bg-brand-700 active:translate-y-px md:hidden"
    >
      <Plus aria-hidden="true" strokeWidth={2} className="size-6" />
    </Link>
  );
}
