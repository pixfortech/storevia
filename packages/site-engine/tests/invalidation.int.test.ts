// Multi-instance cache invalidation (M8) against the real database: two
// storefront "instances" (independent caches and feeds) tail the one
// StorefrontInvalidation log with the storefront role; the worker role
// writes it. A change invalidates every instance, not just one.
process.env["STOREFRONT_PREVIEW_SECRET"] ??= "site-engine-test-preview-secret-00000000";
process.env["STOREFRONT_REVALIDATE_SECRET"] ??= "site-engine-test-revalidate-secret-00000";
process.env["STOREFRONT_PROTOCOL"] ??= "http";
process.env["STOREFRONT_ROOT_DOMAIN"] ??= "site.test";
import { storefrontDb } from "@storevia/database/storefront";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { workerDb } from "@storevia/database/worker";
import { resolveStoreHost } from "@storevia/domains/resolver";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TagCache } from "../src/cache";
import { isWellFormedCacheTag } from "../src/cache-tags";
import { InvalidationFeed } from "../src/invalidation-feed";
import { invalidationLog } from "../src/invalidation-log";
import { handlePublicRequest } from "../src/pipeline";
import { clearPublicCaches, syncPublicCaches } from "../src/revalidate";

const ORG = "0190f2a4-0000-7000-8000-00000000c001";
const STORE = "0190f2a4-0000-7000-8000-00000000c002";
const HOST = "multi.site.test";

afterAll(async () => {
  await disconnectTestClients();
});

beforeEach(async () => {
  await truncateAll();
  // The truncate itself bypasses the log; start each test with empty caches.
  clearPublicCaches();
  const db = migratorDb();
  await db.$executeRaw`INSERT INTO "Organisation" (id, name, "updatedAt") VALUES (${ORG}::uuid, 'Org', now())`;
  await db.$executeRaw`
    INSERT INTO "Store" (id, "organisationId", name, slug, status, currency, locale, timezone, country, "updatedAt")
    VALUES (${STORE}::uuid, ${ORG}::uuid, 'Multi', 'multi', 'ACTIVE', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`;
  await db.$executeRaw`
    INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "isPrimary", "updatedAt")
    VALUES (gen_random_uuid(), ${ORG}::uuid, ${STORE}::uuid, ${HOST}, 'PLATFORM_SUBDOMAIN', 'ACTIVE', replace(gen_random_uuid()::text, '-', ''), true, now())`;
});

/** One storefront instance: its own page-data cache and feed. */
function instance() {
  const cache = new TagCache({ ttlMs: 5 * 60_000, maxEntries: 100 });
  let clock = Date.now();
  const feed = new InvalidationFeed({
    source: invalidationLog,
    apply: (tags) => {
      cache.invalidate(tags);
    },
    clear: () => {
      cache.clear();
    },
    isTag: isWellFormedCacheTag,
  });
  let loads = 0;
  return {
    async read(): Promise<string> {
      clock += 1_000; // past the throttle
      await feed.sync(clock);
      return cache.get(`page:${STORE}`, () => {
        loads += 1;
        return Promise.resolve({ value: `render ${String(loads)}`, tags: [`store:${STORE}`] });
      });
    },
  };
}

const publish = (tags: string[]) =>
  workerDb().$executeRaw`INSERT INTO "StorefrontInvalidation" (tags) VALUES (${tags}::text[])`;

describe("invalidation log", () => {
  it("a change the worker logs reaches every instance", async () => {
    const a = instance();
    const b = instance();
    expect(await a.read()).toBe("render 1");
    expect(await b.read()).toBe("render 1");
    // Cached: unchanged until invalidated.
    expect(await a.read()).toBe("render 1");
    expect(await b.read()).toBe("render 1");

    await publish([`store:${STORE}`]);
    expect(await a.read()).toBe("render 2");
    expect(await b.read()).toBe("render 2");
    // Applied once each.
    expect(await a.read()).toBe("render 2");
    expect(await b.read()).toBe("render 2");
  });

  it("an unrelated tag leaves cached entries alone", async () => {
    const a = instance();
    expect(await a.read()).toBe("render 1");
    await publish(["store:0190f2a4-0000-7000-8000-00000000ffff"]);
    expect(await a.read()).toBe("render 1");
  });

  it("host resolution is invalidated across the process (store suspended)", async () => {
    await syncPublicCaches();
    expect((await resolveStoreHost(HOST))?.storeStatus).toBe("ACTIVE");
    await migratorDb()
      .$executeRaw`UPDATE "Store" SET status = 'SUSPENDED' WHERE id = ${STORE}::uuid`;
    // Without an invalidation, the process still serves its cached resolution.
    expect((await resolveStoreHost(HOST))?.storeStatus).toBe("ACTIVE");
    await publish([`store:${STORE}`]);
    await new Promise((done) => setTimeout(done, 1_100));
    await syncPublicCaches();
    expect((await resolveStoreHost(HOST))?.storeStatus).toBe("SUSPENDED");
  });

  it("the request pipeline applies the log before resolving the host", async () => {
    const rewrite = async () => {
      const response = await handlePublicRequest(
        new NextRequest(`http://${HOST}/`, { headers: { host: HOST } }),
        {
          internalPaths: new Set<string>(),
        },
      );
      return new URL(response.headers.get("x-middleware-rewrite") ?? "http://x/none").pathname;
    };
    expect(await rewrite()).toBe(`/sv/${STORE}`);
    await migratorDb()
      .$executeRaw`UPDATE "Store" SET status = 'SUSPENDED' WHERE id = ${STORE}::uuid`;
    await publish([`store:${STORE}`]);
    await new Promise((done) => setTimeout(done, 1_100));
    expect(await rewrite()).toBe("/status/unavailable");
  });

  it("only the worker writes the log; the storefront role reads it", async () => {
    await expect(
      storefrontDb()
        .$executeRaw`INSERT INTO "StorefrontInvalidation" (tags) VALUES (ARRAY['store:x'])`,
    ).rejects.toThrow(/permission denied/);
    await expect(storefrontDb().$executeRaw`DELETE FROM "StorefrontInvalidation"`).rejects.toThrow(
      /permission denied/,
    );
    await publish(["store:x"]);
    expect(await invalidationLog.latest()).not.toBeNull();
  });

  it("rejects empty and oversized tag lists", async () => {
    await expect(publish([])).rejects.toThrow(/StorefrontInvalidation_tags_bounded/);
    await expect(
      publish(Array.from({ length: 5_001 }, (_, i) => `store:${String(i)}`)),
    ).rejects.toThrow(/StorefrontInvalidation_tags_bounded/);
  });
});
