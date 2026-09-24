import { NextResponse } from "next/server";

// Liveness probe.
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
