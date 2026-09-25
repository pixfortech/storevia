import { GlyphTile, Logo, type GlyphName } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthAside } from "./auth-aside";

// The four business types, in the order the marketing site lists them.
const SITE_GLYPHS: readonly GlyphName[] = ["online-store", "website", "publishing", "portfolio"];

/**
 * Phones and tablets: the aside's one line on what Storevia is, with the four
 * business-type glyphs, so the single column still carries the brand.
 */
function AuthBrandNote() {
  return (
    <aside
      aria-labelledby="auth-brand-note"
      className="mx-auto mt-12 w-full max-w-[25rem] rounded-panel border border-line bg-subtle p-5 sm:mt-16 lg:hidden"
    >
      <div className="flex gap-2">
        {SITE_GLYPHS.map((glyph, index) => (
          <GlyphTile
            key={glyph}
            name={glyph}
            size="sm"
            tone={index === 0 ? "brand" : "neutral"}
            className={index === 0 ? "" : "bg-surface"}
          />
        ))}
      </div>
      <p id="auth-brand-note" className="mt-4 font-display text-h4 text-balance text-ink">
        Every kind of site, run from one account.
      </p>
      <p className="mt-1 text-body-sm text-ink-muted">
        Online stores, business websites, publications and portfolios.
      </p>
    </aside>
  );
}

/**
 * The signed-out frame: logo, one form column on white and, from 1024 px, a
 * calm panel on what Storevia is; below that, a brand note under the form.
 * The form sits at a fixed offset from the top rather than centred, so an
 * error appearing above the fields never moves the heading.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,38rem)]">
      <div className="flex min-w-0 flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 sm:pt-8 lg:px-14">
        <header className="flex items-center">
          <Link
            href="/"
            className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          >
            <Logo size="md" />
          </Link>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 pt-12 pb-12 outline-none sm:pt-20 sm:pb-16 lg:pt-[clamp(4rem,16vh,9rem)]"
        >
          <div className="mx-auto w-full max-w-[25rem]">{children}</div>
          <AuthBrandNote />
        </main>
        <footer className="text-caption text-ink-faint">© Storevia</footer>
      </div>
      <AuthAside />
    </div>
  );
}
