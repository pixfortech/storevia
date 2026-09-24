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
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-20">
      <div className="max-w-sm text-center" role="alert">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Please try again
          {error.digest ? (
            <>
              {" "}
              (reference <code className="font-mono">{error.digest}</code>)
            </>
          ) : null}
          .
        </p>
        <Button className="mt-6" variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
