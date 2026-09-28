// The signed cache-invalidation protocol (ADR-0028 §9, ADR-0029). The worker
// signs "{timestamp}.{body}" with STOREFRONT_REVALIDATE_SECRET; the public
// app acts only on fresh, authentic requests and only on well-formed tags.
// Both sides live here so they can't drift apart.
import { createHmac, timingSafeEqual } from "node:crypto";
import { invalidateHostCache } from "@storevia/domains/resolver";
import { logger, recordMetric } from "@storevia/observability";
import { pageDataCache } from "./cache";
import { isWellFormedCacheTag, type CacheTag } from "./cache-tags";
import { InvalidationFeed } from "./invalidation-feed";
import { INVALIDATION_READ_LIMIT, invalidationLog } from "./invalidation-log";

export const REVALIDATE_PATH = "/api/internal/revalidate";
export const MAX_REVALIDATE_BODY = 64 * 1024;
export const MAX_REVALIDATE_SKEW_SECONDS = 300;

const sign = (secret: string, timestamp: string, body: string) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

/** Headers for a signed invalidation request carrying `body`. */
export function revalidationHeaders(
  body: string,
  secret: string,
  now = Date.now(),
): Record<string, string> {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "content-type": "application/json",
    authorization: `Bearer ${sign(secret, timestamp, body)}`,
    "x-storevia-timestamp": timestamp,
  };
}

/** Drops cached host resolutions and page data for the given tags; returns entries dropped. */
export function invalidatePublicCaches(tags: readonly CacheTag[]): number {
  for (const tag of tags) {
    // Store status and domain changes decide how hosts resolve.
    if (tag.startsWith("host:")) invalidateHostCache(tag.slice(5));
    else if (tag.startsWith("store:")) invalidateHostCache();
  }
  return pageDataCache().invalidate(tags);
}

/** Drops everything this process has cached (host resolutions and page data). */
export function clearPublicCaches(): void {
  invalidateHostCache();
  pageDataCache().clear();
}

const globalFeed = globalThis as typeof globalThis & {
  __storeviaInvalidationFeed?: InvalidationFeed;
};

function publicCacheFeed(): InvalidationFeed {
  globalFeed.__storeviaInvalidationFeed ??= new InvalidationFeed({
    source: invalidationLog,
    apply: (tags) => {
      const dropped = invalidatePublicCaches(tags as CacheTag[]);
      recordMetric("storefront.cache_invalidated", dropped, { via: "log" });
    },
    clear: clearPublicCaches,
    isTag: isWellFormedCacheTag,
    readLimit: INVALIDATION_READ_LIMIT,
    onApplied: (rows, lagMs) => {
      recordMetric("storefront.invalidation_lag_ms", lagMs, {});
      recordMetric("storefront.invalidations_applied", rows, {});
    },
    onError: (error) => {
      recordMetric("storefront.invalidation_feed_failed", 1, {});
      logger.warn("invalidation feed unreadable; caches cleared", {
        error: error instanceof Error ? error.name : "unknown",
      });
    },
  });
  return globalFeed.__storeviaInvalidationFeed;
}

/**
 * Brings this process's public caches up to date with the invalidation log
 * (every instance, not just the one the worker posted to). Throttled to one
 * read a second per process; call before serving anything from cache.
 */
export function syncPublicCaches(): Promise<void> {
  return publicCacheFeed().sync();
}

/**
 * Handles an invalidation request: 413 for oversized bodies, 401 unless the
 * signature verifies over a timestamp within five minutes, 400 for bodies
 * that aren't JSON. Tags that `isTag` refuses are ignored.
 */
export async function handleRevalidation(
  request: Request,
  options: { readonly secret: string; readonly isTag: (value: unknown) => value is CacheTag },
): Promise<Response> {
  const body = await request.text();
  if (body.length > MAX_REVALIDATE_BODY) {
    return Response.json({ error: "too large" }, { status: 413 });
  }
  const timestamp = request.headers.get("x-storevia-timestamp") ?? "";
  const signature = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!signature || !/^\d{1,12}$/.test(timestamp) || !(age <= MAX_REVALIDATE_SKEW_SECONDS)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const expected = Buffer.from(sign(options.secret, timestamp, body));
  if (!timingSafeEqual(Buffer.from(signature), expected)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  let tags: CacheTag[];
  try {
    const parsed = JSON.parse(body) as { tags?: unknown };
    tags = Array.isArray(parsed.tags) ? parsed.tags.filter(options.isTag).slice(0, 5_000) : [];
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const dropped = invalidatePublicCaches(tags);
  recordMetric("storefront.cache_invalidated", dropped, { via: "post" });
  return Response.json(
    { tags: tags.length, dropped },
    { headers: { "Cache-Control": "no-store" } },
  );
}
