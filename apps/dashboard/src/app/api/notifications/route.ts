import { NextResponse, type NextRequest } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { bellState } from "@/lib/notifications";

// The notification bell's feed (GET, polled on navigation and every minute).
// A read, so not a server action: it never queues behind the page's own
// actions. The session decides who is asking; `org` is only a request.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const principal = await getPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const state = await bellState(principal, request.nextUrl.searchParams.get("org"));
  return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
}
