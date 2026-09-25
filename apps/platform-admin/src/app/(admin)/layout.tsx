import { isMockBillingEnabled } from "@storevia/billing";
import { hasPlatformPermission, PLATFORM_ROLE_LABELS } from "@storevia/tenancy/platform";
import { Badge, Logo } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { HeaderSearch } from "@/components/header-search";
import { StaffMenu } from "@/components/staff-menu";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { environmentLabel } from "@/lib/format";
import { adminNavItems } from "@/lib/navigation";

// Staff chrome: white like the rest of Storevia, but never mistaken for the
// merchant dashboard. An amber rule, the "Platform admin" lockup and the
// environment badge mark the internal tool on every page.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff();
  const stage = env().STOREVIA_ENV;
  const production = stage === "production";
  const mockBilling = isMockBillingEnabled();
  const items = adminNavItems({ canViewJobs: hasPlatformPermission(ctx, "platform.audit.read") });
  const stageLabel = environmentLabel(stage);
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-surface">
        <div aria-hidden="true" className="h-0.5 bg-admin forced-colors:bg-[CanvasText]" />
        <div className="mx-auto flex max-w-(--container-app) flex-wrap items-center gap-x-3 px-4 sm:px-6 lg:gap-x-6 lg:px-8">
          <Link
            href="/organisations"
            className="order-1 -ml-1 flex h-14 shrink-0 items-center rounded-control px-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            <Logo tag="Platform admin" className="hidden sm:inline-flex" />
            <Logo tag="Admin" monogramOnly className="hidden min-[360px]:inline-flex sm:hidden" />
            {/* Below 360 px the tag gives way to the search button; the amber
                rule and the environment badge still mark the internal tool. */}
            <Logo monogramOnly className="min-[360px]:hidden" />
          </Link>
          <div className="order-3 -mx-4 w-[calc(100%+2rem)] border-t border-line px-2 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-3 lg:order-2 lg:mx-0 lg:w-auto lg:border-t-0 lg:px-0">
            <AdminNav items={items} />
          </div>
          <div className="order-2 ml-auto flex h-14 items-center gap-2 lg:order-3">
            <HeaderSearch />
            <Badge
              data-testid="environment"
              tone={production ? "danger" : "warning"}
              variant={production ? "dot" : "soft"}
              dot
            >
              {/* One text run (the badge spaces its children apart). "environment"
                  is spelled out where there is room; screen readers always hear it. */}
              <span>
                {stageLabel}
                <span className="sr-only sm:not-sr-only"> environment</span>
              </span>
            </Badge>
            <StaffMenu
              staff={{
                name: ctx.principal.name,
                email: ctx.principal.email,
                role: PLATFORM_ROLE_LABELS[ctx.role],
                recentlyConfirmed: ctx.principal.recentlyAuthenticated,
              }}
              environment={`${stageLabel} environment${mockBilling ? " · Mock billing enabled" : ""}`}
            />
          </div>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-(--container-app) flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10"
      >
        {children}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-(--container-app) px-4 py-5 text-caption text-ink-faint sm:px-6 lg:px-8">
          Storevia platform admin. Internal use only: every change is recorded in the audit log.
        </p>
      </footer>
    </div>
  );
}
