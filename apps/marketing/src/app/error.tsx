"use client";

import { Button, buttonClasses, Illustration } from "@storevia/ui";
import Link from "next/link";
import { Container } from "@/components/marketing/section";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // retry re-fetches and re-renders the segment, so it can recover from a
  // failed server render (reset only clears the client error state).
  retry: () => void;
}) {
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <div role="alert" className="flex flex-col items-center">
        <Illustration name="error" size="lg" />
        <h1 className="mt-8 font-display text-h2 text-ink">Something went wrong</h1>
        <p className="mt-4 max-w-md text-body-lg text-ink-muted">
          This page didn&apos;t load properly. Please try again
          {error.digest ? (
            <>
              {" "}
              (reference <code className="font-mono text-body">{error.digest}</code>)
            </>
          ) : null}
          .
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={retry}>
          Try again
        </Button>
        <Link href="/" className={buttonClasses("secondary", "lg")}>
          Back to home
        </Link>
      </div>
    </Container>
  );
}
