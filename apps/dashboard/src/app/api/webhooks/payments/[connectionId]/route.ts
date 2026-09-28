import { ingestPaymentWebhook } from "@storevia/commerce/checkout";
import { createLogger, withLogContext } from "@storevia/observability";
import { NextResponse, type NextRequest } from "next/server";

// Payment provider webhooks (ADR-0031 §4). The URL names a store's payment
// connection; there is no session and no cookie: authenticity comes only
// from the connection's own signature over the exact raw bytes, checked by
// the commerce service. The proxy lets /api/webhooks/ through without a
// session. Responses carry `{ ok }` only; the body and headers are never
// echoed or logged.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger({ app: "dashboard", component: "payment-webhooks" });

const MAX_BODY_BYTES = 64 * 1024;

const json = (ok: boolean, status: number) =>
  NextResponse.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });

/** Reads the exact body bytes, stopping at `max` (chunked bodies included). */
async function readCapped(request: NextRequest, max: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
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
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  // Every line the ingest logs (commerce, payments) carries the request id.
  const requestId = request.headers.get("x-request-id");
  return withLogContext(requestId ? { requestId } : {}, () => handle(request, context));
}

async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  try {
    const { connectionId } = await params;
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
      return json(false, 413);
    }
    const rawBody = await readCapped(request, MAX_BODY_BYTES);
    if (!rawBody) return json(false, 413);
    const result = await ingestPaymentWebhook(connectionId, rawBody, request.headers);
    return json(result.status === 200, result.status);
  } catch (error) {
    // The provider retries on 5xx. Ids and the error's shape only (no body, headers or message).
    log.error("payment webhook failed", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      error,
    });
    return json(false, 500);
  }
}
