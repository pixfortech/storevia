import { ingestBillingWebhook } from "@storevia/billing";
import { NextResponse, type NextRequest } from "next/server";

// Billing provider webhooks (docs/architecture/05 §4). No session and no
// cookies: authenticity comes only from the provider's signature over the raw
// body. Providers that aren't enabled in this environment get 404; in
// Milestone 2 that is every provider in production (the mock is never
// enabled there).

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const result = await ingestBillingWebhook(
    provider,
    rawBody,
    request.headers,
    requestId ? { requestId } : {},
  );
  // Only the outcome is returned; never details of the event or our state.
  return NextResponse.json(
    { outcome: result.outcome },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
