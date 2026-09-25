import { buttonClasses } from "@storevia/ui/button";
import { Logo } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { EmptyState } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found" };

// Also shown to signed-in non-staff (requireStaff), so it names nothing internal.
export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4">
      <Logo size="sm" className="mb-4" />
      <EmptyState
        titleAs="h1"
        className="max-w-md"
        illustration={<Illustration name="not-found" size="md" />}
        title="Not found"
        description="It doesn't exist, or you don't have access to it."
        action={
          <Link href="/organisations" className={buttonClasses("secondary", "md")}>
            Back to organisations
          </Link>
        }
      />
    </main>
  );
}
