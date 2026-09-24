import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Storevia: websites, stores and publications for your business",
    template: "%s · Storevia",
  },
  description:
    "Build your online presence with Storevia: online stores, business websites, publications and portfolios, run by your team from one place.",
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
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-surface font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
