import { cn } from "@storevia/ui/cn";
import { PageHeader as UiPageHeader, type PageHeaderProps } from "@storevia/ui/surfaces";
import type { ReactNode } from "react";
import { CommandProvider } from "./command";
import { MobileTabBar, MobileTopBar } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import type { ShellData } from "./types";

/**
 * Responsive application shell (design plan §9–§12). Three deliberate
 * layouts from one component tree:
 * - Desktop (≥1024px): a 264 px sidebar (logo, store selector, grouped
 *   navigation, plan and account) and a 56 px context bar with breadcrumbs,
 *   search (⌘K) and the page's create action.
 * - Tablet (768–1023px): a 72 px icon rail with tooltips and a drawer for the
 *   full navigation; the context bar carries the store selector. 44 px targets.
 * - Phones (<768px): a compact top bar, and a bottom bar with Home, the
 *   business type's primary area, Create, Website and More.
 */
export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  return (
    <CommandProvider data={data}>
      <div className="min-h-dvh bg-canvas md:flex">
        <Sidebar data={data} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar data={data} />
          <MobileTopBar data={data} />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-(--container-app) flex-1 px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none sm:px-6 md:pt-8 md:pb-16 lg:px-8 lg:pt-10 xl:px-10"
          >
            {children}
          </main>
          <MobileTabBar data={data} />
        </div>
      </div>
    </CommandProvider>
  );
}

/**
 * The top of every dashboard page: one h1 in the display face, an optional
 * eyebrow, description, status meta and actions (primary last). The shell's
 * context bar already shows the breadcrumb trail on desktop, so pages pass
 * `breadcrumb` only for levels the trail doesn't know.
 */
export function PageHeader({ className, ...props }: PageHeaderProps) {
  return <UiPageHeader {...props} className={cn("mb-8 lg:mb-10", className)} />;
}
