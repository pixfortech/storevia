"use client";

import { buttonClasses, ICON_STROKE } from "@storevia/ui";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "./nav-links";
import type { ShellAction, ShellData } from "./types";

/** Where you are: organisation › store › section. */
export function Breadcrumbs({ data }: { data: ShellData }) {
  const pathname = usePathname();
  const section = [...data.links, ...data.organisationLinks]
    .filter((l) => !l.exact || pathname === l.href)
    .find((l) => isActive(pathname, l) && l.href !== (data.store?.href ?? data.organisation.href));
  const crumbs = [
    { label: data.organisation.name, href: data.organisation.href },
    ...(data.store ? [{ label: data.store.name, href: data.store.href }] : []),
    ...(section ? [{ label: section.label, href: section.href }] : []),
  ];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  strokeWidth={ICON_STROKE}
                  className="size-3.5 shrink-0 text-ink-faint"
                />
              ) : null}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="truncate text-ink-muted hover:text-ink">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The create action that fits this page, or none on the action's own page. */
export function useCreateAction(actions: readonly ShellAction[]): ShellAction | undefined {
  const pathname = usePathname();
  const fitting = actions
    .filter((a) => a.under === undefined || isActive(pathname, { href: a.under }))
    .sort((a, b) => (b.under?.length ?? 0) - (a.under?.length ?? 0))[0];
  if (!fitting || fitting.href.split("#")[0] === pathname) return undefined;
  return fitting;
}

export function CreateActionButton({ data }: { data: ShellData }) {
  const action = useCreateAction(data.createActions);
  if (!action) return null;
  return (
    <Link href={action.href} className={buttonClasses("primary", "sm")}>
      <Plus aria-hidden="true" strokeWidth={2} className="size-4" />
      {action.label}
    </Link>
  );
}
