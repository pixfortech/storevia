import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// Internal component gallery for design QA. Never served in production.
export const metadata = { title: "Design system", robots: { index: false, follow: false } };

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  if (process.env["STOREVIA_ENV"] === "production") notFound();
  return (
    <div className="mx-auto w-full max-w-(--container-content) px-4 py-12 sm:px-6">{children}</div>
  );
}
