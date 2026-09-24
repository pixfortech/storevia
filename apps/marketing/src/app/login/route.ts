import { NextResponse } from "next/server";
import { appLinks } from "@/lib/env";

// Sign-in lives in the dashboard; this keeps storevia.com/login working.
export function GET() {
  return NextResponse.redirect(appLinks().signIn, 307);
}
