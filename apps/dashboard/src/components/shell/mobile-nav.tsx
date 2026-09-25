"use client";

import { cn, Dialog, Icon, LogoMark } from "@storevia/ui";
import { Ellipsis, Plus, Store, UserPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountMenu } from "./account-menu";
import { CommandTrigger } from "./command";
import { NAV_ICONS } from "./icons";
import { GroupedNavigation } from "./nav-links";
import { bottomBarTabs, isActive } from "./navigation";
import { PlanIndicator } from "./plan-indicator";
import { StoreSwitcher } from "./switchers";
import type { ShellAction, ShellData, ShellLink } from "./types";

/** Phones (<768 px): the mark, the store selector, search and the account. */
export function MobileTopBar({ data }: { data: ShellData }) {
  return (
    <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-canvas pt-[env(safe-area-inset-top)] md:hidden">
      <div className="flex h-14 items-center gap-1 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <LogoMark size={24} className="mr-1.5" />
        <div className="flex min-w-0 flex-1">
          <StoreSwitcher data={data} variant="compact" />
        </div>
        <CommandTrigger variant="icon" />
        <AccountMenu user={data.user} variant="icon" align="end" />
      </div>
    </header>
  );
}

/** A sheet that closes itself after any navigation. */
function useSheet(): [boolean, (open: boolean) => void] {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  return [open, setOpen];
}

// 64 px tall slots; the whole slot is the target (at least 48 px, as the plan asks).
const SLOT = cn(
  "relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] leading-none font-medium",
  "transition-colors duration-(--duration-fast)",
  "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus",
);

/** A short bar over the active tab: a second, non-colour cue for "you are here". */
function ActiveMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-b-pill bg-brand-600 transition-[scale] duration-(--duration-base) ease-(--ease-emphasised) starting:scale-x-0"
    />
  );
}

function Tab({ link, active }: { link: ShellLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(SLOT, active ? "text-brand-700" : "text-ink-muted hover:text-ink")}
    >
      {active ? <ActiveMark /> : null}
      <Icon
        icon={NAV_ICONS[link.icon]}
        size={24}
        className={active ? "text-brand-600" : "text-ink-faint"}
      />
      <span className="max-w-full truncate px-1">
        {link.label}
        {link.soon ? <span className="sr-only"> Soon</span> : null}
        {link.locked ? <span className="sr-only"> (not included in your plan)</span> : null}
      </span>
    </Link>
  );
}

const ACTION_ICONS: Record<ShellAction["key"], LucideIcon> = {
  "invite-member": UserPlus,
  "create-store": Store,
};

/** The centre button: every real create action the member has, in a sheet. */
function CreateSheet({ actions }: { actions: readonly ShellAction[] }) {
  const [open, setOpen] = useSheet();
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      title="Create"
      trigger={
        <button type="button" aria-label="Create" className={SLOT}>
          <span className="flex size-11 items-center justify-center rounded-card bg-brand-600 text-white shadow-xs transition-colors duration-(--duration-fast) hover:bg-brand-700 active:bg-brand-800">
            <Icon icon={Plus} size={24} strokeWidth={2} />
          </span>
        </button>
      }
    >
      <ul className="-mx-2 flex flex-col gap-1">
        {actions.map((action) => (
          <li key={action.key}>
            <Link
              href={action.href}
              onClick={() => {
                // Hash links (#invite) may stay on the same page.
                setOpen(false);
              }}
              className="flex min-h-16 items-center gap-4 rounded-card px-2 py-2.5 transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-700 ring-1 ring-brand-100 ring-inset">
                <Icon icon={ACTION_ICONS[action.key]} size="md" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium text-ink">{action.label}</span>
                <span className="mt-0.5 block text-caption text-ink-muted">
                  {action.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Everything else: every section, grouped as in the sidebar, and the plan. */
function MoreSheet({ data, active }: { data: ShellData; active: boolean }) {
  const [open, setOpen] = useSheet();
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      title="More"
      trigger={
        <button
          type="button"
          aria-current={active ? "page" : undefined}
          className={cn(SLOT, active ? "text-brand-700" : "text-ink-muted hover:text-ink")}
        >
          {active ? <ActiveMark /> : null}
          <Icon
            icon={Ellipsis}
            size={24}
            className={active ? "text-brand-600" : "text-ink-faint"}
          />
          More
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        <nav aria-label="All sections" className="-mx-1">
          <GroupedNavigation
            data={data}
            density="sheet"
            onNavigate={() => {
              setOpen(false);
            }}
          />
        </nav>
        {data.plan ? <PlanIndicator plan={data.plan} /> : null}
      </div>
    </Dialog>
  );
}

/**
 * The phone's bottom bar (design plan §12): Home, the business type's
 * primary area, Create (centre), Website and More. Every destination is also
 * in the More sheet; Create lists only real actions and is left out when the
 * member has none.
 */
export function MobileTabBar({ data }: { data: ShellData }) {
  const pathname = usePathname();
  const { start, end } = bottomBarTabs(data.links);
  const inBar = [...start, ...end];
  const moreActive = [...data.links, ...data.organisationLinks]
    .filter((link) => !inBar.includes(link))
    .some((link) => isActive(pathname, link));
  const tab = (link: ShellLink) => (
    <li key={link.key} className="min-w-0 flex-1">
      <Tab link={link} active={isActive(pathname, link)} />
    </li>
  );
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-line bg-canvas pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-stretch">
        {start.map(tab)}
        {data.createActions.length > 0 ? (
          <li className="min-w-0 flex-1">
            <CreateSheet actions={data.createActions} />
          </li>
        ) : null}
        {end.map(tab)}
        <li className="min-w-0 flex-1">
          <MoreSheet data={data} active={moreActive} />
        </li>
      </ul>
    </nav>
  );
}
