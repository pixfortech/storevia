import { buttonClasses } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage } from "@/components/shell/status-page";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusPage
      illustration="not-found"
      eyebrow="Error 404"
      title="We couldn't find that page"
      description="It may have moved, or you may not have access to it."
      actions={
        <Link href="/" className={buttonClasses("primary")}>
          Go to your dashboard
        </Link>
      }
    />
  );
}
