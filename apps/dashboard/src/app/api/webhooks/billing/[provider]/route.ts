import { getBillingProvider, ingestBillingWebhook } from "@storevia/billing";
import { NextResponse, type NextRequest } from "next/server";
import { registerEntitlementListeners } from "@/lib/billing-events";

registerEntitlementListeners();

// Billing provider webhooks (docs/architecture/05 §4). No session and no
// cookies: authenticity comes only from the provider's signature over the
// exact raw bytes. Providers that aren't enabled here get 404 before the body
// is read; in Milestone 2 that is every provider in production (the mock is
// never enabled there).

const MAX_BODY_BYTES = 256 * 1024;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Reads the body as bytes, stopping at `max` (chunked bodies included). */
async function readCapped(request: NextRequest, max: number): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  if (!getBillingProvider(provider)) return json({ outcome: "not_found" }, 404);
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return json({ error: "too_large" }, 413);
  }
  const rawBody = await readCapped(request, MAX_BODY_BYTES);
  if (!rawBody) return json({ error: "too_large" }, 413);
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const result = await ingestBillingWebhook(
    provider,
    rawBody,
    request.headers,
    requestId ? { requestId } : {},
  );
  // Only the outcome is returned; never details of the event or our state.
  return json({ outcome: result.outcome }, result.status);
}
