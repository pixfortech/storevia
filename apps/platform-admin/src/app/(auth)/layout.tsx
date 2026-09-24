import type { ReactNode } from "react";
import { Logo } from "@storevia/ui";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center bg-neutral-950 px-4 py-10 sm:justify-center sm:py-16"
    >
      <Logo variant="inverse" tag="Admin" className="mb-8 text-lg" />
      <div className="w-full max-w-[420px] rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        {children}
      </div>
      <p className="mt-8 max-w-sm text-center text-xs text-neutral-400">
        Storevia staff only. Access is logged.
      </p>
    </main>
  );
}
