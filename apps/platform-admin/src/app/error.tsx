"use client";

import { Button } from "@storevia/ui";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-sm text-center" role="alert">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Please try again. If it keeps happening, contact support
          {error.digest ? (
            <>
              {" "}
              with reference <code className="font-mono">{error.digest}</code>
            </>
          ) : null}
          .
        </p>
        <Button className="mt-6" variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
