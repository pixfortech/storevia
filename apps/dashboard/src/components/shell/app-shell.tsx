import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { AccountMenu } from "./account-menu";
import { MobileTabBar } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { ContextSwitcher } from "./switchers";
import type { ShellData } from "./types";

/**
 * Responsive application shell.
 * - Desktop (≥1024px): full sidebar with switcher, navigation and account.
 * - Tablet (768–1023px): icon rail; labels available to assistive tech and as tooltips.
 * - Mobile (<768px): top app bar + bottom tab bar with a "More" sheet.
 */
export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      {/* Tablet rail + desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[76px] lg:w-64">
        <div className="flex h-14 items-center justify-center border-b border-line lg:justify-start lg:px-5">
          <span className="hidden lg:inline">
            <Logo />
          </span>
          <span className="lg:hidden" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-7">
              <rect width="24" height="24" rx="7" className="fill-brand-600" />
            </svg>
          </span>
        </div>
        <div className="p-2 lg:p-3">
          <div className="hidden lg:block">
            <ContextSwitcher data={data} />
          </div>
          <div className="flex justify-center lg:hidden">
            <ContextSwitcher data={data} compact />
          </div>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 pb-4 lg:px-3">
          <div className="hidden lg:block">
            <NavLinks links={data.links} />
          </div>
          <div className="lg:hidden">
            <NavLinks links={data.links} compact />
          </div>
        </nav>
        <div className="border-t border-line p-2 lg:p-3">
          <div className="hidden lg:block">
            <AccountMenu user={data.user} />
          </div>
          <div className="flex justify-center lg:hidden">
            <AccountMenu user={data.user} compact />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top app bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <div className="min-w-0 flex-1">
            <ContextSwitcher data={data} />
          </div>
          <AccountMenu user={data.user} compact align="end" />
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-10 lg:pt-10"
        >
          {children}
        </main>
        <MobileTabBar links={data.links} />
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
