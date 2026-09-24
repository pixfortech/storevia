import { NextResponse } from "next/server";

// Liveness probe. Readiness (DB + migration version) arrives with deployment work (M8).
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
