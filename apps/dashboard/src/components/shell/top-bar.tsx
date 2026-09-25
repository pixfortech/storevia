"use client";

import { buttonClasses } from "@storevia/ui/button";
import { Icon } from "@storevia/ui/icons";
import { Breadcrumb } from "@storevia/ui/navigation";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandTrigger } from "./command";
import { breadcrumbTrail, fittingCreateAction } from "./navigation";
import { StoreSwitcher } from "./switchers";
import type { ShellData } from "./types";

/** Where you are: organisation › store › section. */
function Breadcrumbs({ data }: { data: ShellData }) {
  const pathname = usePathname();
  return <Breadcrumb items={breadcrumbTrail(data, pathname)} linkAs={Link} />;
}

/** The page's primary create action, or none on the action's own page. */
function CreateActionButton({ data }: { data: ShellData }) {
  const pathname = usePathname();
  const action = fittingCreateAction(data.createActions, pathname);
  if (!action) return null;
  return (
    <Link href={action.href} className={buttonClasses("primary", "sm")}>
      <Icon icon={Plus} size="sm" strokeWidth={2} />
      {action.label}
    </Link>
  );
}

/**
 * The 56 px context bar above the workspace (tablet and desktop). Desktop
 * shows the breadcrumb trail; the tablet rail has no store selector, so the
 * bar carries it instead. Search (⌘K) and the page's create action sit on
 * the right. No notifications until notifications exist.
 */
export function TopBar({ data }: { data: ShellData }) {
  return (
    <header className="sticky top-0 z-(--z-sticky) hidden h-14 shrink-0 items-center gap-4 border-b border-line bg-canvas px-6 md:flex lg:px-8">
      <div className="hidden min-w-0 flex-1 lg:block">
        <Breadcrumbs data={data} />
      </div>
      <div className="flex max-w-72 min-w-0 lg:hidden">
        <StoreSwitcher data={data} variant="bar" />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <CommandTrigger />
        <CreateActionButton data={data} />
      </div>
    </header>
  );
}
