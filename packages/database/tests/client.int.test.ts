// One PostgreSQL connection runs one query at a time. Prisma's query
// interpreter fetches included relations in parallel, and inside a
// transaction (every RLS-scoped withTenant call) they all use the same pg
// client; pg@8 warns and queues, pg@9 will refuse. The database client
// serialises queries per connection, so a transaction stays on its single
// connection and no query overlaps another.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "../src";
import { disconnectTestClients, migratorDb, truncateAll } from "../src/testing";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const ORG = uuid(1);
const USER = uuid(2);
// The pg module the Prisma adapter uses (one install, one module instance).
const pg = createRequire(import.meta.url)("pg") as {
  Client: { prototype: { query: (...args: unknown[]) => unknown } };
};
const originalQuery = pg.Client.prototype.query;
const overlaps: string[] = [];

beforeAll(async () => {
  // Count every call made while the same client still has a query running:
  // exactly the condition pg@8 warns about and pg@9 refuses.
  pg.Client.prototype.query = function (
    this: { activeQuery?: unknown; _queryQueue?: unknown[] },
    ...args: unknown[]
  ) {
    if (this.activeQuery || (this._queryQueue?.length ?? 0) > 0) {
      const config = args[0] as { text?: string } | string;
      overlaps.push((typeof config === "string" ? config : (config.text ?? "")).slice(0, 80));
    }
    return originalQuery.apply(this, args);
  };
  await truncateAll();
  const db = migratorDb();
  await db.$executeRaw`INSERT INTO "User" (id, email, name, "emailVerified", "updatedAt") VALUES (${USER}::uuid, 'o@example.test', 'Owner', true, now())`;
  await db.$executeRaw`INSERT INTO "Organisation" (id, name, "updatedAt") VALUES (${ORG}::uuid, 'Org', now())`;
  await db.$executeRaw`INSERT INTO "Membership" (id, "organisationId", "userId", role, status, "allStores", "updatedAt") VALUES (gen_random_uuid(), ${ORG}::uuid, ${USER}::uuid, 'OWNER', 'ACTIVE', true, now())`;
  for (const slug of ["one", "two", "three"]) {
    await db.$executeRaw`
      INSERT INTO "Store" (id, "organisationId", name, slug, currency, locale, timezone, country, "updatedAt")
      VALUES (gen_random_uuid(), ${ORG}::uuid, ${slug}, ${slug}, 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`;
  }
});

afterAll(async () => {
  pg.Client.prototype.query = originalQuery;
  await disconnectTestClients();
});

describe("queries inside a tenant transaction", () => {
  it("never overlap on the transaction's connection, even with parallel relation loads", async () => {
    const scope = { organisationId: ORG, storeId: null, userId: USER };
    for (let round = 0; round < 3; round++) {
      // The shape requireStoreAccess uses on every dashboard request: a
      // to-one and a filtered to-many relation, loaded in parallel.
      const membership = await withTenant(scope, (tx) =>
        tx.membership.findFirst({
          where: { organisationId: ORG, userId: USER, status: "ACTIVE" },
          select: {
            id: true,
            organisation: { select: { name: true } },
            storeAccess: { where: { storeId: ORG }, select: { storeId: true } },
          },
        }),
      );
      expect(membership?.organisation.name).toBe("Org");
      const org = await withTenant(scope, (tx) =>
        tx.organisation.findFirst({
          where: { id: ORG },
          include: { stores: true, memberships: true },
        }),
      );
      expect(org?.stores).toHaveLength(3);
      expect(org?.memberships).toHaveLength(1);
    }
    expect(overlaps).toEqual([]);
  });

  it("keep every query of a transaction on its one connection (RLS scope preserved)", async () => {
    const scope = { organisationId: ORG, storeId: null, userId: USER };
    const pids = await withTenant(scope, async (tx) => {
      const run = () => tx.$queryRaw<{ pid: number; org: string }[]>`
        SELECT pg_backend_pid() AS pid, current_setting('app.organisation_id', true) AS org`;
      return Promise.all([run(), run(), run(), run()]);
    });
    expect(overlaps).toEqual([]);
    const rows = pids.flat();
    expect(new Set(rows.map((r) => r.pid)).size).toBe(1);
    expect(new Set(rows.map((r) => r.org))).toEqual(new Set([ORG]));
  });
});
