"use client";

import { Button, EmptyState, Illustration, Logo } from "@storevia/ui";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // retry() re-fetches the server components below; reset() only re-renders.
  retry: () => void;
}) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4">
      <Logo size="sm" className="mb-4" />
      <div role="alert" className="w-full max-w-md">
        <EmptyState
          titleAs="h1"
          illustration={<Illustration name="error" size="md" />}
          title="Something went wrong"
          description={
            <>
              Please try again. If it keeps happening, contact support
              {error.digest ? (
                <>
                  {" "}
                  with reference <code className="font-mono text-ink">{error.digest}</code>
                </>
              ) : null}
              .
            </>
          }
          action={
            <Button variant="secondary" onClick={retry}>
              Try again
            </Button>
          }
        />
      </div>
    </main>
  );
}
