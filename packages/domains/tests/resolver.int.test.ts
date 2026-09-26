// Host resolution through the storefront role (ADR-0028 §2–§4).
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalRedirectHost,
  invalidateHostCache,
  resolveStoreHost,
  storeAvailability,
} from "../src/resolver";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const ORG = uuid(1);
const STORE = uuid(2);

beforeAll(async () => {
  await truncateAll();
  const db = migratorDb();
  await db.$executeRaw`INSERT INTO "Organisation" (id, name, "updatedAt") VALUES (${ORG}::uuid, 'Org', now())`;
  await db.$executeRaw`
    INSERT INTO "Store" (id, "organisationId", name, slug, status, currency, locale, timezone, country, "updatedAt")
    VALUES (${STORE}::uuid, ${ORG}::uuid, 'Clay & Co', 'clay', 'ACTIVE', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`;
  await db.$executeRaw`
    INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "isPrimary", "updatedAt")
    VALUES (gen_random_uuid(), ${ORG}::uuid, ${STORE}::uuid, 'clay.store.test', 'PLATFORM_SUBDOMAIN', 'ACTIVE', 'x', true, now()),
           (gen_random_uuid(), ${ORG}::uuid, ${STORE}::uuid, 'old-clay.store.test', 'PLATFORM_SUBDOMAIN', 'ACTIVE', 'x', false, now())`;
});

afterAll(disconnectTestClients);

describe("resolveStoreHost", () => {
  it("resolves a primary host to a live store", async () => {
    invalidateHostCache();
    const store = await resolveStoreHost("clay.store.test");
    expect(store).toMatchObject({
      storeId: STORE,
      organisationId: ORG,
      name: "Clay & Co",
      currency: "INR",
      country: "IN",
      isPrimary: true,
    });
    expect(store && storeAvailability(store)).toBe("live");
    expect(store && canonicalRedirectHost(store)).toBeNull();
  });

  it("a secondary host redirects to the primary", async () => {
    const store = await resolveStoreHost("old-clay.store.test");
    expect(store && canonicalRedirectHost(store)).toBe("clay.store.test");
  });

  it("unknown hosts resolve to nothing, and that is cached too", async () => {
    expect(await resolveStoreHost("nope.store.test")).toBeNull();
    await migratorDb().$executeRaw`
      INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "isPrimary", "updatedAt")
      VALUES (gen_random_uuid(), ${ORG}::uuid, ${STORE}::uuid, 'nope.store.test', 'CUSTOM', 'ACTIVE', 'x', false, now())`;
    expect(await resolveStoreHost("nope.store.test")).toBeNull();
    invalidateHostCache("nope.store.test");
    expect(await resolveStoreHost("nope.store.test")).not.toBeNull();
  });

  it("status changes show after the cache entry expires or is invalidated", async () => {
    const t0 = Date.now();
    await resolveStoreHost("clay.store.test", t0);
    await migratorDb().$executeRaw`UPDATE "Store" SET status = 'DRAFT' WHERE id = ${STORE}::uuid`;
    const cached = await resolveStoreHost("clay.store.test", t0 + 1_000);
    expect(cached?.storeStatus).toBe("ACTIVE");
    const fresh = await resolveStoreHost("clay.store.test", t0 + 31_000);
    expect(fresh && storeAvailability(fresh)).toBe("coming-soon");
    await migratorDb()
      .$executeRaw`UPDATE "Organisation" SET status = 'SUSPENDED' WHERE id = ${ORG}::uuid`;
    invalidateHostCache("clay.store.test");
    const suspended = await resolveStoreHost("clay.store.test");
    expect(suspended && storeAvailability(suspended)).toBe("unavailable");
  });
});
