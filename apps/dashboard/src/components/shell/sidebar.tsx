"use client";

import { Dialog, ICON_STROKE, Logo } from "@storevia/ui";
import { PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountMenu } from "./account-menu";
import { NavLinks, NavSection } from "./nav-links";
import { ContextSwitcher } from "./switchers";
import type { ShellData } from "./types";

/** Full navigation column: desktop sidebar and the tablet drawer share it. */
export function SidebarNavigation({
  data,
  onNavigate,
}: {
  data: ShellData;
  onNavigate?: () => void;
}) {
  const nav = onNavigate ? { onNavigate } : {};
  return (
    <>
      <NavLinks links={data.links} {...nav} />
      <NavSection label="Organisation" links={data.organisationLinks} {...nav} />
    </>
  );
}

/** Tablet: the rail's menu button opens the full navigation as a drawer. */
export function NavigationDrawer({ data }: { data: ShellData }) {
  const [open, setOpen] = useState(false);
  // Close after any navigation, including the context switcher's links.
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  const close = () => {
    setOpen(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      side="left"
      title={<Logo />}
      trigger={
        <button
          type="button"
          aria-label="Open navigation"
          className="flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink"
        >
          <PanelLeftOpen aria-hidden="true" strokeWidth={ICON_STROKE} className="size-5" />
        </button>
      }
    >
      <div className="-mx-1 space-y-4">
        <ContextSwitcher data={data} />
        <nav aria-label="All sections" className="px-3">
          <SidebarNavigation data={data} onNavigate={close} />
        </nav>
        <div className="border-t border-line pt-3">
          <AccountMenu user={data.user} />
        </div>
      </div>
    </Dialog>
  );
}
