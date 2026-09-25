"use client";

import { Icon, Logo, LogoMark } from "@storevia/ui/icons";
import { Dialog } from "@storevia/ui/overlays";
import { PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AccountMenu } from "./account-menu";
import { GroupedNavigation, RailNavigation } from "./nav-links";
import { PlanIndicator } from "./plan-indicator";
import { StoreSwitcher } from "./switchers";
import type { ShellData } from "./types";

/** Tablet: the rail's menu button opens the full navigation as a drawer. */
function NavigationDrawer({ data }: { data: ShellData }) {
  const [open, setOpen] = useState(false);
  // Close after any navigation, including the store selector's links.
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
      title={<Logo size="sm" />}
      trigger={
        <button
          type="button"
          aria-label="Open navigation"
          className="flex size-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <Icon icon={PanelLeftOpen} size="md" />
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        <StoreSwitcher data={data} />
        <nav aria-label="All sections">
          <GroupedNavigation data={data} density="panel" onNavigate={close} />
        </nav>
        <div className="space-y-2 border-t border-line pt-4">
          {data.plan ? <PlanIndicator plan={data.plan} /> : null}
          <AccountMenu user={data.user} side="top" />
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Which edges of a scroll box have more content beyond them. On short
 * laptop screens the sidebar's list scrolls; the fade this drives says so.
 */
function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const update = () => {
      const top = box.scrollTop > 1;
      const bottom = box.scrollTop + box.clientHeight < box.scrollHeight - 1;
      setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    // The box resizes with the window; its content with the rail/sidebar switch.
    const observer = new ResizeObserver(update);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    return () => {
      box.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  return [ref, edges] as const;
}

// Fades the list out where it continues past an edge: a mask, not a painted
// overlay, so it works on any background. The nav's scroll padding matches the
// fade, so keyboard focus never lands in it.
function edgeMask({ top, bottom }: { top: boolean; bottom: boolean }): CSSProperties | undefined {
  if (!top && !bottom) return undefined;
  const mask = `linear-gradient(to bottom, ${top ? "transparent, #000 1.5rem" : "#000"}, ${
    bottom ? "#000 calc(100% - 3rem), transparent" : "#000"
  })`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/**
 * Desktop (≥1024 px): the 264 px sidebar with the logo, the store selector,
 * grouped navigation, the plan indicator and the account. Tablet
 * (768–1023 px): the same column as a 72 px icon rail, with the full
 * navigation in a drawer. One complementary landmark and one "Primary"
 * navigation at either width; the other layout's copy is display:none.
 */
export function Sidebar({ data }: { data: ShellData }) {
  const [navRef, edges] = useScrollEdges<HTMLElement>();
  const pathname = usePathname();
  // Keep the current page's item clear of the faded edges when the list scrolls.
  useEffect(() => {
    const box = navRef.current;
    const item = [...(box?.querySelectorAll<HTMLElement>('[aria-current="page"]') ?? [])].find(
      (el) => el.offsetParent !== null,
    );
    if (!box || !item) return;
    const bounds = box.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const clearance = 56;
    if (rect.bottom > bounds.bottom - clearance) {
      box.scrollTop += rect.bottom - (bounds.bottom - clearance);
    } else if (rect.top < bounds.top + clearance) {
      box.scrollTop -= bounds.top + clearance - rect.top;
    }
  }, [navRef, pathname]);
  return (
    <aside className="sticky top-0 hidden h-dvh w-18 shrink-0 flex-col border-r border-line bg-surface md:flex lg:w-66">
      <div className="flex h-14 shrink-0 items-center justify-center lg:justify-start lg:px-5">
        <Link
          href={data.organisation.href}
          aria-label={`${data.organisation.name}: all stores`}
          className="flex items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <Logo size="sm" className="hidden lg:inline-flex" />
          <LogoMark size={26} className="lg:hidden" />
        </Link>
      </div>

      <div className="hidden px-3 pb-2 lg:block">
        <StoreSwitcher data={data} />
      </div>
      <div className="flex justify-center pb-2 lg:hidden">
        <NavigationDrawer data={data} />
      </div>

      <nav
        ref={navRef}
        aria-label="Primary"
        style={edgeMask(edges)}
        className="min-h-0 flex-1 scroll-pt-6 scroll-pb-12 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
      >
        <div className="hidden px-3 pt-1 pb-2 lg:block">
          <GroupedNavigation data={data} density="sidebar" />
        </div>
        <div className="border-t border-line pt-3 pb-4 lg:hidden">
          <RailNavigation data={data} />
        </div>
      </nav>

      <div className="hidden space-y-1.5 border-t border-line p-2.5 lg:block">
        {data.plan ? <PlanIndicator plan={data.plan} /> : null}
        <AccountMenu user={data.user} side="top" />
      </div>
      <div className="flex justify-center border-t border-line py-2 lg:hidden">
        <AccountMenu user={data.user} variant="icon" side="right" align="end" />
      </div>
    </aside>
  );
}
