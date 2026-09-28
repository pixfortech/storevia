// Outbox dispatch (ADR-0028 §9) with the real worker role, trigger-written
// events and a local HTTP server standing in for the storefront.
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dispatchOutbox, httpRevalidator } from "../src/outbox";

const SECRET = "worker-test-revalidate-secret-0000000000";
const ORG = "0190f2a4-0000-7000-8000-00000000a001";
const STORE = "0190f2a4-0000-7000-8000-00000000a002";
const PRODUCT = "0190f2a4-0000-7000-8000-00000000a003";

let server: Server;
let status = 200;
const received: { tags: string[]; signatureOk: boolean }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const ts = String(req.headers["x-storevia-timestamp"] ?? "");
      const expected = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
      received.push({
        tags: (JSON.parse(body) as { tags: string[] }).tags,
        signatureOk:
          req.url === "/api/internal/revalidate" &&
          req.headers.authorization === `Bearer ${expected}`,
      });
      res.writeHead(status).end("{}");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
});

afterAll(async () => {
  await new Promise((done) => server.close(done));
  await disconnectTestClients();
});

beforeEach(async () => {
  await truncateAll();
  received.length = 0;
  status = 200;
  const db = migratorDb();
  await db.$executeRaw`INSERT INTO "Organisation" (id, name, "updatedAt") VALUES (${ORG}::uuid, 'Org', now())`;
  await db.$executeRaw`
    INSERT INTO "Store" (id, "organisationId", name, slug, status, currency, locale, timezone, country, "updatedAt")
    VALUES (${STORE}::uuid, ${ORG}::uuid, 'Shop', 'shop', 'ACTIVE', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`;
  // A new store's HOME page (ADR-0030 §9) emits its own events; start from none.
  await db.$executeRaw`UPDATE "OutboxEvent" SET "dispatchedAt" = now()`;
  await db.$executeRaw`
    INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "updatedAt")
    VALUES (${PRODUCT}::uuid, ${ORG}::uuid, ${STORE}::uuid, 'Mug', 'mug', now())`;
});

afterEach(() => {
  status = 200;
});

const revalidator = () => {
  const { port } = server.address() as AddressInfo;
  const r = httpRevalidator({
    STOREFRONT_INTERNAL_URL: `http://127.0.0.1:${String(port)}/`,
    STOREFRONT_REVALIDATE_SECRET: SECRET,
    STOREVIA_ENV: "test",
  });
  if (!r) throw new Error("no revalidator");
  return r;
};

const undispatched = async () => migratorDb().outboxEvent.count({ where: { dispatchedAt: null } });
const logged = async () =>
  (
    await migratorDb().$queryRaw<{ tags: string[] }[]>`
      SELECT tags FROM "StorefrontInvalidation" ORDER BY id`
  ).map((r) => [...r.tags].sort());

describe("outbox dispatch", () => {
  it("posts signed, de-duplicated tags and marks the events dispatched", async () => {
    await migratorDb()
      .$executeRaw`UPDATE "Product" SET title = 'Mug 2' WHERE id = ${PRODUCT}::uuid`;
    await migratorDb().$executeRaw`UPDATE "Store" SET name = 'Shop 2' WHERE id = ${STORE}::uuid`;
    expect(await undispatched()).toBe(3); // product insert + update, store rename

    expect(await dispatchOutbox(revalidator())).toBe(3);
    expect(received).toHaveLength(1);
    expect(received[0]?.signatureOk).toBe(true);
    expect(received[0]?.tags.sort()).toEqual(
      [`catalogue:${STORE}`, `product:${PRODUCT}`, `store:${STORE}`].sort(),
    );
    expect(await undispatched()).toBe(0);
    // The same tags reach every storefront instance through the log.
    expect(await logged()).toEqual([
      [`catalogue:${STORE}`, `product:${PRODUCT}`, `store:${STORE}`].sort(),
    ]);
    expect(await dispatchOutbox(revalidator())).toBe(0);
    expect(received).toHaveLength(1);
    expect(await logged()).toHaveLength(1);
  });

  it("a failed post never blocks the queue: the log carries the tags", async () => {
    status = 500;
    expect(await dispatchOutbox(revalidator())).toBe(1);
    expect(await undispatched()).toBe(0);
    expect(await logged()).toEqual([[`catalogue:${STORE}`, `product:${PRODUCT}`].sort()]);
  });

  it("with no storefront URL, the log alone carries the tags", async () => {
    expect(await dispatchOutbox(null)).toBe(1);
    expect(await undispatched()).toBe(0);
    expect(await logged()).toHaveLength(1);
  });

  it("a failed log write leaves the events for the next run", async () => {
    await migratorDb().$executeRaw`
      ALTER TABLE "StorefrontInvalidation" ADD CONSTRAINT test_block CHECK (false) NOT VALID`;
    try {
      await expect(dispatchOutbox(revalidator())).rejects.toThrow(/test_block/);
      expect(await undispatched()).toBe(1);
    } finally {
      await migratorDb()
        .$executeRaw`ALTER TABLE "StorefrontInvalidation" DROP CONSTRAINT test_block`;
    }
    expect(await dispatchOutbox(revalidator())).toBe(1);
    expect(await undispatched()).toBe(0);
  });

  it("two dispatchers never claim the same events", async () => {
    for (let i = 0; i < 30; i++) {
      await migratorDb()
        .$executeRaw`UPDATE "Product" SET title = ${`Mug ${String(i)}`} WHERE id = ${PRODUCT}::uuid`;
    }
    const [a, b] = await Promise.all([
      dispatchOutbox(revalidator()),
      dispatchOutbox(revalidator()),
    ]);
    expect(a + b).toBe(31);
    expect(await undispatched()).toBe(0);
  });

  it("the fast path is optional; a URL without a secret is refused outside development", () => {
    expect(httpRevalidator({ STOREVIA_ENV: "test" })).toBeNull();
    expect(httpRevalidator({ STOREVIA_ENV: "production" })).toBeNull();
    expect(
      httpRevalidator({ STOREVIA_ENV: "test", STOREFRONT_INTERNAL_URL: "http://127.0.0.1:1" }),
    ).toBeNull();
    expect(() =>
      httpRevalidator({ STOREVIA_ENV: "production", STOREFRONT_INTERNAL_URL: "http://sf" }),
    ).toThrow(/must be set/);
  });
});
