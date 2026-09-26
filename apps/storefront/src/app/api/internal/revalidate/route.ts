import { createHmac, timingSafeEqual } from "node:crypto";
import { isCacheTag } from "@storevia/domains";
import { invalidateHostCache } from "@storevia/domains/resolver";
import { recordMetric } from "@storevia/observability";
import { pageDataCache } from "@/lib/cache";
import { revalidateSecret } from "@/lib/env";

// Cache invalidation from the worker (ADR-0028 §9). The body is signed with
// STOREFRONT_REVALIDATE_SECRET over "{timestamp}.{body}" and must be fresh,
// so it can't be forged or replayed later. Only well-formed tags are acted on.

const MAX_BODY = 64 * 1024;
const MAX_SKEW_SECONDS = 300;

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > MAX_BODY) return Response.json({ error: "too large" }, { status: 413 });
  const timestamp = request.headers.get("x-storevia-timestamp") ?? "";
  const signature = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!signature || !/^\d{1,12}$/.test(timestamp) || !(age <= MAX_SKEW_SECONDS)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const expected = Buffer.from(
    createHmac("sha256", revalidateSecret()).update(`${timestamp}.${body}`).digest("hex"),
  );
  if (!timingSafeEqual(Buffer.from(signature), expected)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  let tags: string[];
  try {
    const parsed = JSON.parse(body) as { tags?: unknown };
    tags = Array.isArray(parsed.tags) ? parsed.tags.filter(isCacheTag).slice(0, 5_000) : [];
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  for (const tag of tags) {
    // Store status and domain changes decide how hosts resolve.
    if (tag.startsWith("host:")) invalidateHostCache(tag.slice(5));
    else if (tag.startsWith("store:")) invalidateHostCache();
  }
  const dropped = pageDataCache().invalidate(tags);
  recordMetric("storefront.cache_invalidated", dropped, {});
  return Response.json(
    { tags: tags.length, dropped },
    { headers: { "Cache-Control": "no-store" } },
  );
}
