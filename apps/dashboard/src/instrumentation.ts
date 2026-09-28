import type { Instrumentation } from "next";
import { reportRequestError } from "@storevia/observability";

// Server errors Next.js catches (render, route handlers, server actions,
// proxy) are logged with the request id and counted (M8, docs/operations/alerts.md).
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  reportRequestError("dashboard", error, request, context);
};
