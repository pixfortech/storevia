import { NextResponse } from "next/server";
import { appLinks } from "@/lib/env";

// Sign-up lives in the dashboard; this keeps storevia.com/signup working.
export function GET() {
  return NextResponse.redirect(appLinks().signUp, 307);
}
