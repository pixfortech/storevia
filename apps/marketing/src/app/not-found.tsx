import { buttonClasses, Illustration } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLink, Container } from "@/components/marketing";

export const metadata: Metadata = { title: "Page not found" };

const SUGGESTIONS = [
  { label: "Products", href: "/products" },
  { label: "Pricing", href: "/pricing" },
  { label: "Roadmap", href: "/resources#roadmap" },
  { label: "Contact", href: "/contact" },
] as const;

export default function NotFound() {
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <Illustration name="not-found" size="lg" />
      <p className="mt-8 text-overline text-brand-700 uppercase">Error 404</p>
      <h1 className="mt-3 font-display text-h2 text-ink sm:text-h1">This page doesn’t exist</h1>
      <p className="mt-4 max-w-md text-body-lg text-ink-muted">
        The link may be out of date, or the page may have moved. These are good places to pick up
        from.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonClasses("primary", "lg")}>
          Back to home
        </Link>
      </div>
      <nav aria-label="Suggested pages" className="mt-10">
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {SUGGESTIONS.map((link) => (
            <li key={link.href}>
              <ArrowLink href={link.href}>{link.label}</ArrowLink>
            </li>
          ))}
        </ul>
      </nav>
    </Container>
  );
}
