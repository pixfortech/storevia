import { NextResponse } from "next/server";
import { supportUrl } from "@/lib/env";

// The dashboard's one support entry point (DB-3). Every "Help and support"
// link, in the shell, on the billing page and on error pages (which may
// render signed out or in the browser), points here, and this sends people
// to the configured destination (SUPPORT_URL, else the marketing site's
// contact page). Public: a signed-out person can need help too.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.redirect(supportUrl(), {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
