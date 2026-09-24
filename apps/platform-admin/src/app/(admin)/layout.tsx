import { isMockBillingEnabled } from "@storevia/billing";
import { PLATFORM_ROLE_LABELS } from "@storevia/tenancy/platform-rbac";
import { Badge, buttonClasses } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { signOutAction } from "../(auth)/actions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff();
  const stage = env().STOREVIA_ENV;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/organisations" aria-label="Storevia Admin home">
            <Logo />
          </Link>
          {stage !== "production" ? (
            <Badge tone={isMockBillingEnabled() ? "warning" : "neutral"} data-testid="environment">
              {stage}
              {isMockBillingEnabled() ? " · mock billing" : ""}
            </Badge>
          ) : null}
          <nav aria-label="Main" className="ml-2 hidden items-center gap-1 sm:flex">
            <Link href="/organisations" className={buttonClasses("ghost", "sm")}>
              Organisations
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/account" className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium text-ink">{ctx.principal.name}</span>
              <span className="block text-ink-muted">{PLATFORM_ROLE_LABELS[ctx.role]}</span>
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav
          aria-label="Main (mobile)"
          className="flex gap-1 border-t border-line px-4 py-1 sm:hidden"
        >
          <Link href="/organisations" className={buttonClasses("ghost", "sm")}>
            Organisations
          </Link>
          <Link href="/account" className={buttonClasses("ghost", "sm")}>
            Account
          </Link>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
