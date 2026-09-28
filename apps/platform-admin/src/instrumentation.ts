import type { Instrumentation } from "next";

// Runs once when a server instance starts (never during `next build`), and
// must finish before it takes requests: a missing or malformed setting exits
// the instance here instead of failing the first request that needs it.
export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const [{ verifyConfiguration }, { verifyOrExit }] = await Promise.all([
    import("./lib/boot"),
    import("@storevia/security/env"),
  ]);
  verifyOrExit(verifyConfiguration);
}

// Server errors Next.js catches (render, route handlers, server actions,
// proxy) are logged with the request id and counted (M8, docs/operations/alerts.md).
// Node.js runtime only: the logger uses Node APIs, and the Edge bundle
// drops this branch.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { reportRequestError } = await import("@storevia/observability");
  reportRequestError("platform-admin", error, request, context);
};
