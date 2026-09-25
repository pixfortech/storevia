import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Storevia", template: "%s · Storevia" },
  description: "Run your online store, website, publication or portfolio with Storevia.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes every page dynamic, which the per-request
  // CSP nonce requires.
  await headers();
  return (
    // Scroll padding keeps anchor targets and focused fields clear of the
    // shell's sticky top bar and, on phones, its bottom bar.
    <html
      lang="en"
      className="scroll-pt-[calc(4.5rem+env(safe-area-inset-top))] max-md:scroll-pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
    >
      <body className="min-h-dvh bg-canvas font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-(--z-toast) focus:rounded-control focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2.5 focus:text-body-sm focus:font-medium focus:text-ink focus:shadow-popover"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
