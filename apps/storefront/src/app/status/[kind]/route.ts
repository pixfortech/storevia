import { headers } from "next/headers";
import { internalHeaderKey } from "@storevia/site-engine/env";
import { simplePage } from "@storevia/site-engine/html";
import { STORE_HEADER, verifyStoreHeader } from "@storevia/site-engine/context";

// Store status pages (ADR-0028 §3). The proxy rewrites here: "coming soon"
// for a DRAFT store without a preview (200), "unavailable" for suspended or
// archived stores and organisations (503). Always noindex, never cached.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  const requestHeaders = await headers();
  const store = verifyStoreHeader(requestHeaders.get(STORE_HEADER), internalHeaderKey());
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const common = {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  };
  if (!store || (kind !== "coming-soon" && kind !== "unavailable")) {
    return new Response(
      simplePage({
        title: "Not found",
        heading: "Page not found",
        message: "This page doesn't exist.",
        ...(nonce ? { nonce } : {}),
      }),
      { ...common, status: 404 },
    );
  }
  const lang = store.locale;
  if (kind === "coming-soon" && store.availability === "coming-soon") {
    return new Response(
      simplePage({
        title: `${store.name} – coming soon`,
        heading: store.name,
        message: "This store is getting ready. Please check back soon.",
        lang,
        ...(nonce ? { nonce } : {}),
      }),
      common,
    );
  }
  return new Response(
    simplePage({
      title: `${store.name} – unavailable`,
      heading: "This store is unavailable",
      message: "It isn't accepting visitors right now.",
      lang,
      ...(nonce ? { nonce } : {}),
    }),
    { ...common, status: 503 },
  );
}
