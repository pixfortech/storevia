import { Logo } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./account-menu";
import { CommandProvider, CommandTrigger } from "./command";
import { MobileCreateButton, MobileTabBar } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { NavigationDrawer, SidebarNavigation } from "./sidebar";
import { ContextSwitcher } from "./switchers";
import { Breadcrumbs, CreateActionButton } from "./top-bar";
import type { ShellData } from "./types";

/**
 * Responsive application shell (docs/architecture/12-design-system.md §8).
 * Three deliberate layouts from one component tree:
 * - Desktop (≥1024px): sidebar with context switcher, grouped navigation and
 *   account; a top bar with breadcrumbs, search (⌘K) and the create action.
 * - Tablet (768–1023px): icon rail with a drawer for the full navigation;
 *   the top bar carries the switcher and search. Touch-sized targets.
 * - Mobile (<768px): compact header, bottom bar with the business type's key
 *   areas, a "More" sheet and a floating create action.
 */
export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  return (
    <CommandProvider data={data}>
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className="min-h-dvh md:flex">
        {/* Desktop sidebar + tablet rail */}
        <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[72px] lg:w-64">
          <div className="flex h-14 shrink-0 items-center justify-center lg:justify-start lg:px-5">
            <Link href={data.organisation.href} className="hidden rounded-control lg:inline-flex">
              <Logo />
            </Link>
            <span className="lg:hidden">
              <NavigationDrawer data={data} />
            </span>
          </div>
          <div className="hidden px-3 pb-2 lg:block">
            <ContextSwitcher data={data} />
          </div>
          <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-2">
            <div className="hidden lg:block">
              <SidebarNavigation data={data} />
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

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tablet + desktop top bar */}
          <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center gap-4 border-b border-line bg-canvas px-6 md:flex lg:px-10">
            <div className="hidden min-w-0 flex-1 lg:block">
              <Breadcrumbs data={data} />
            </div>
            <div className="min-w-0 max-w-72 flex-1 lg:hidden">
              <ContextSwitcher data={data} />
            </div>
            <div className="ml-auto flex flex-1 items-center justify-end gap-3 lg:flex-none">
              <CommandTrigger />
              <CreateActionButton data={data} />
            </div>
          </header>

          {/* Mobile header */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)] md:hidden">
            <div className="min-w-0 flex-1">
              <ContextSwitcher data={data} />
            </div>
            <CommandTrigger variant="icon" />
            <AccountMenu user={data.user} compact align="end" />
          </header>

          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-(--container-content) flex-1 px-4 pb-32 pt-6 outline-none sm:px-6 md:pb-12 md:pt-8 lg:px-10 lg:pt-10"
          >
            {children}
          </main>
          <MobileTabBar
            links={data.links}
            organisationLinks={data.organisationLinks}
            organisationLabel={data.organisation.name}
          />
          <MobileCreateButton actions={data.createActions} />
        </div>
      </div>
    </CommandProvider>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small label above the title, e.g. the business type. */
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-sm text-ink-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink lg:text-[28px] lg:leading-9">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-(--container-prose) text-[15px] text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
