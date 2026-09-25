import { Illustration, Logo, type IllustrationName } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A full-page state outside the shell (not found, unexpected error): the
 * logo, one illustration, one h1 and a way back. Server-safe, so the
 * not-found page and the client error boundary share it.
 */
export function StatusPage({
  illustration,
  eyebrow,
  title,
  description,
  actions,
  alert = false,
}: {
  illustration: IllustrationName;
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
  /** Announce the message (errors). */
  alert?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center px-5 sm:px-8">
        <Link
          href="/"
          className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <Logo size="sm" />
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-5 pt-6 pb-24 outline-none"
      >
        <div className="flex max-w-md flex-col items-center text-center">
          <Illustration name={illustration} size="md" />
          <div {...(alert ? { role: "alert" } : {})} className="mt-2">
            <p className="text-overline text-brand-700 uppercase">{eyebrow}</p>
            <h1 className="mt-3 font-display text-h3 text-ink sm:text-h2">{title}</h1>
            <p className="mt-3 text-body text-ink-muted">{description}</p>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
        </div>
      </main>
    </div>
  );
}
