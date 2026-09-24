import { buttonClasses } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">We couldn't find that page</h1>
        <p className="mt-2 text-sm text-ink-muted">
          It may have moved, or you may not have access to it.
        </p>
        <Link href="/" className={buttonClasses("secondary", "md", "mt-6")}>
          Go to your dashboard
        </Link>
      </div>
    </main>
  );
}
