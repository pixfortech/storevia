import { Logo } from "@storevia/ui";
import Link from "next/link";
import { FOOTER_NAV } from "./nav";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-(--container-content) px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm text-ink-muted">
              Websites, stores, publications and portfolios, run by your team from one place.
            </p>
          </div>
          <nav aria-label="Footer" className="contents">
            {FOOTER_NAV.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-semibold text-ink">{group.title}</h2>
                <ul className="mt-3 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-ink-muted hover:text-ink">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-sm text-ink-faint sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Storevia</p>
          <p>Storevia is in active development. Features are labelled with their status.</p>
        </div>
      </div>
    </footer>
  );
}
