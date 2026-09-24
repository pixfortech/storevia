import type { ReactNode } from "react";
import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center sm:py-16"
    >
      <Logo className="mb-8 text-lg" />
      <div className="w-full max-w-[420px] rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-ink-faint">© Storevia</p>
    </main>
  );
}
