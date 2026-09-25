import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { appLinks } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Storevia: build your business online, run it from one place",
    template: "%s · Storevia",
  },
  description:
    "One workspace for your website, online store, publication or portfolio, and the team that runs it. Built in stages, with every feature labelled with its status.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Dynamic rendering for the per-request CSP nonce.
  await headers();
  const links = appLinks();
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-canvas font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only rounded-control bg-surface px-4 py-2.5 text-body-sm font-medium text-ink shadow-popover focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-(--z-toast)"
        >
          Skip to content
        </a>
        <SiteHeader signInHref={links.signIn} signUpHref={links.signUp} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
