import { isMockBillingEnabled } from "@storevia/billing";
import { hasPlatformPermission, PLATFORM_ROLE_LABELS } from "@storevia/tenancy/platform";
import { Logo } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { signOutAction } from "../(auth)/actions";

// Staff chrome: a dark bar so the internal tool is never mistaken for the
// merchant dashboard, with the environment always visible.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff();
  const stage = env().STOREVIA_ENV;
  const items = [
    { href: "/organisations", label: "Organisations" },
    ...(hasPlatformPermission(ctx, "platform.audit.read")
      ? [{ href: "/jobs", label: "Jobs" }]
      : []),
    { href: "/account", label: "Account" },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-stone-950 text-white">
        <div className="mx-auto flex h-14 max-w-(--container-app) items-center gap-4 px-4 sm:px-6">
          <Link href="/organisations" aria-label="Storevia Admin home" className="rounded-control">
            <Logo variant="admin" />
          </Link>
          <div className="hidden md:block">
            <AdminNav items={items} label="Main" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium text-white">{ctx.principal.name}</span>
              <span className="block text-stone-400">{PLATFORM_ROLE_LABELS[ctx.role]}</span>
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-control border border-white/15 px-3 text-sm font-medium text-white hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-white/10 px-2 md:hidden">
          <AdminNav items={items} label="Main (mobile)" />
        </div>
        {stage !== "production" ? (
          <div
            data-testid="environment"
            className="border-t border-warning-500/40 bg-warning-500 px-4 py-1 text-center text-xs font-semibold text-stone-950"
          >
            {stage.toUpperCase()} environment
            {isMockBillingEnabled() ? " · mock billing enabled" : ""}
          </div>
        ) : null}
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-(--container-app) flex-1 px-4 py-6 sm:px-6 sm:py-8"
      >
        {children}
      </main>
    </div>
  );
}
