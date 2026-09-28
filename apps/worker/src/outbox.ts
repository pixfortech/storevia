import "server-only";
import { storefrontCacheTagsForEvent } from "@storevia/commerce/storefront/cache-tags";
import { workerDb } from "@storevia/database/worker";
import type { JobDefinition } from "@storevia/jobs";
import { logger, recordMetric } from "@storevia/observability";
import { REVALIDATE_PATH, revalidationHeaders } from "@storevia/site-engine/revalidate";

// Outbox dispatch (ADR-0028 §9, M8). Claims undispatched events with SKIP
// LOCKED (so two workers never take the same batch), turns them into cache
// tags and, in one transaction, appends the tags to the StorefrontInvalidation
// log and marks the events dispatched. Every storefront instance tails that
// log, so the invalidation reaches all of them. The signed post to
// STOREFRONT_INTERNAL_URL is a best-effort fast path for the instance it
// reaches: its failure is counted, never blocks the queue. Dispatched events
// are purged after 7 days, log rows after a day.

const BATCH = 500;
const MAX_BATCHES = 20;
const TAGS_PER_REQUEST = 5_000;
const LOCAL_ENVIRONMENTS = new Set(["development", "test"]);

interface EventRow {
  readonly id: string;
  readonly type: string;
  readonly storeId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: unknown;
}

export interface Revalidator {
  post(tags: readonly string[]): Promise<void>;
}

/**
 * Posts tags to STOREFRONT_INTERNAL_URL, signed with
 * STOREFRONT_REVALIDATE_SECRET; null when no URL is configured (the log
 * alone then carries invalidations). A URL without a secret is refused
 * outside development and test.
 */
export function httpRevalidator(env: NodeJS.ProcessEnv = process.env): Revalidator | null {
  const base = env["STOREFRONT_INTERNAL_URL"];
  const secret = env["STOREFRONT_REVALIDATE_SECRET"];
  if (!base) return null;
  if (!secret) {
    if (!LOCAL_ENVIRONMENTS.has(env["STOREVIA_ENV"] ?? "")) {
      throw new Error("STOREFRONT_REVALIDATE_SECRET must be set with STOREFRONT_INTERNAL_URL");
    }
    return null;
  }
  const url = `${base.replace(/\/+$/, "")}${REVALIDATE_PATH}`;
  return {
    async post(tags) {
      for (let i = 0; i < tags.length; i += TAGS_PER_REQUEST) {
        const body = JSON.stringify({ tags: tags.slice(i, i + TAGS_PER_REQUEST) });
        const response = await fetch(url, {
          method: "POST",
          headers: revalidationHeaders(body, secret),
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
          throw new Error(`storefront revalidation failed: HTTP ${String(response.status)}`);
      }
    },
  };
}

/** One dispatch pass; returns how many events were dispatched. */
export async function dispatchOutbox(
  revalidator: Revalidator | null,
  signal?: AbortSignal,
): Promise<number> {
  const db = workerDb();
  let dispatched = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    if (signal?.aborted) throw new Error("aborted");
    const count = await db.$transaction(
      async (tx) => {
        const events = await tx.$queryRaw<EventRow[]>`
          SELECT id, type, "storeId", "entityType", "entityId", payload FROM "OutboxEvent"
          WHERE "dispatchedAt" IS NULL
          ORDER BY "occurredAt", id
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`;
        if (events.length === 0) return 0;
        const tags = [...new Set(events.flatMap((e) => storefrontCacheTagsForEvent(e)))];
        for (let i = 0; i < tags.length; i += TAGS_PER_REQUEST) {
          await tx.$executeRaw`
            INSERT INTO "StorefrontInvalidation" (tags)
            VALUES (${tags.slice(i, i + TAGS_PER_REQUEST)}::text[])`;
        }
        try {
          await revalidator?.post(tags);
        } catch (error) {
          // The log still carries these tags to every instance.
          recordMetric("storefront.invalidation_post_failed", 1, {});
          logger.warn("storefront revalidation post failed", {
            error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
          });
        }
        await tx.$executeRaw`
          UPDATE "OutboxEvent" SET "dispatchedAt" = now()
          WHERE id = ANY(${events.map((e) => e.id)}::uuid[])`;
        return events.length;
      },
      { timeout: 60_000 },
    );
    dispatched += count;
    if (count < BATCH) break;
  }
  return dispatched;
}

export const outboxDispatchJob: JobDefinition = {
  name: "storefront.outbox-dispatch",
  schedule: { everySeconds: 5 },
  maxAttempts: 2,
  timeoutMs: 2 * 60_000,
  async run({ signal }) {
    const dispatched = await dispatchOutbox(httpRevalidator(), signal);
    const purged = await workerDb().$executeRaw`
      DELETE FROM "OutboxEvent" WHERE "dispatchedAt" < now() - interval '7 days'`;
    await workerDb().$executeRaw`
      DELETE FROM "StorefrontInvalidation" WHERE "createdAt" < now() - interval '1 day'`;
    if (dispatched > 0) recordMetric("storefront.outbox_dispatched", dispatched, {});
    return { dispatched, purged };
  },
};
