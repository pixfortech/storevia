import { buttonClasses } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-20">
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-ink-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-ink-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/" className={buttonClasses("secondary", "md", "mt-6")}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
