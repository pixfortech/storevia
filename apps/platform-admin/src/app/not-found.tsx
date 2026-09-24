import { buttonClasses } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-ink-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          It doesn't exist, or you don't have access to it.
        </p>
        <Link href="/organisations" className={buttonClasses("secondary", "md", "mt-6")}>
          Back to organisations
        </Link>
      </div>
    </main>
  );
}
