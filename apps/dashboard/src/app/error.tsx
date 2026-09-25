"use client";

import { Button, buttonClasses } from "@storevia/ui";
import Link from "next/link";
import { StatusPage } from "@/components/shell/status-page";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <StatusPage
      alert
      illustration="error"
      eyebrow="Unexpected error"
      title="Something went wrong"
      description={
        <>
          Please try again. If it keeps happening, contact support
          {error.digest ? (
            <>
              {" "}
              with reference <code className="font-mono text-body-sm">{error.digest}</code>
            </>
          ) : null}
          .
        </>
      }
      actions={
        <>
          <Button onClick={retry}>Try again</Button>
          <Link href="/" className={buttonClasses("secondary")}>
            Go to your dashboard
          </Link>
        </>
      }
    />
  );
}
