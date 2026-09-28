import type { Instrumentation } from "next";

// Server errors Next.js catches (render, route handlers, server actions,
// proxy) are logged with the request id and counted (M8, docs/operations/alerts.md).
// Node.js runtime only: the logger uses Node APIs, and the Edge bundle
// drops this branch.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { reportRequestError } = await import("@storevia/observability");
  reportRequestError("platform-admin", error, request, context);
};
