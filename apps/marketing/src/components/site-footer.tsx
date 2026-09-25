import { Logo } from "@storevia/ui";
import Link from "next/link";
import { ArrowLink } from "./marketing/arrow-link";
import { Container } from "./marketing/section";
import { StatusPill } from "./marketing/status-pill";
import { FOOTER_NAV } from "./nav";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="pt-16 pb-10 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,3fr)] lg:gap-16">
          <div className="max-w-sm">
            <Link href="/" aria-label="Storevia home" className="inline-flex rounded-control">
              <Logo />
            </Link>
            <p className="mt-5 text-body-sm text-ink-muted">
              Websites, online stores, publications and portfolios, run by your team from one place.
            </p>
            <div className="mt-6 rounded-card border border-line p-4">
              <p className="text-label text-ink">Built in the open</p>
              <p className="mt-1 text-body-sm text-ink-muted">
                Storevia is in active development. Every feature on this site is labelled with its
                status.
              </p>
              <ArrowLink href="/resources#roadmap" className="mt-3">
                See the roadmap
              </ArrowLink>
            </div>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-5"
          >
            {FOOTER_NAV.map((group) => (
              <div key={group.title}>
                <h2 className="text-label text-ink">{group.title}</h2>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="inline-flex flex-col items-start gap-1.5 text-body-sm text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink pointer-coarse:-my-2.5 pointer-coarse:py-2.5"
                      >
                        {link.label}
                        {link.status ? <StatusPill status={link.status} /> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-line pt-8 text-caption text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Storevia</p>
          <p>Prices and plan limits come from our live plan catalogue.</p>
        </div>
      </Container>
    </footer>
  );
}
