import { handlePublicRequest } from "@storevia/site-engine/pipeline";
import { simplePage } from "@storevia/site-engine/html";
import type { NextRequest, NextResponse } from "next/server";

// Storevia's public app on the Site Engine's request pipeline (ADR-0029):
// the engine resolves the host, decides access and rewrites every page to
// /sv/{storeId}/…; this app supplies its internal endpoints and its copy.

const INTERNAL_PATHS: ReadonlySet<string> = new Set(["/api/internal/revalidate", "/api/health"]);

const unknownHostHtml = (nonce: string) =>
  simplePage({
    title: "Store not found",
    heading: "There's no store here",
    message:
      "Check the address you entered. If you run this store, its domain may still be setting up.",
    nonce,
  });

export function proxy(request: NextRequest): Promise<NextResponse> {
  return handlePublicRequest(request, { internalPaths: INTERNAL_PATHS, unknownHostHtml });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
