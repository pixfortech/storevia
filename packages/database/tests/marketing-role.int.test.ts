// The marketing role (ADR-0025): reads the public plan catalogue and its own
// rate-limit buckets, and nothing else. The public website never holds a
// credential that can reach tenant or identity data.
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectTestClients, migratorDb, truncateAll } from "../src/testing";

let marketing: pg.Client;

beforeAll(async () => {
  const url = process.env["DATABASE_MARKETING_URL"];
  if (!url) throw new Error("DATABASE_MARKETING_URL is not set");
  marketing = new pg.Client({ connectionString: url });
  await marketing.connect();
});

beforeEach(async () => {
  await truncateAll();
  await migratorDb().rateLimit.create({
    data: {
      id: "0190f2a4-0000-7000-8000-000000009001",
      key: "sign-in:ip:203.0.113.9",
      count: 3,
      lastRequest: 0n,
    },
  });
});

afterAll(async () => {
  await marketing.end();
  await disconnectTestClients();
});

describe("marketing role", () => {
  it("reads the plan catalogue", async () => {
    const { rows } = await marketing.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "Plan" p JOIN "PlanFeature" pf ON pf."planId" = p.id
       JOIN "Feature" f ON f.id = pf."featureId"`,
    );
    expect(Number(rows[0]?.n)).toBeGreaterThan(0);
    await marketing.query('SELECT amount FROM "PlanPrice" LIMIT 1');
  });

  it("can't write the catalogue", async () => {
    await expect(marketing.query(`UPDATE "Plan" SET name = 'x'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(marketing.query(`DELETE FROM "PlanPrice"`)).rejects.toThrow(/permission denied/);
  });

  it.each([
    "User",
    "Session",
    "Account",
    "Organisation",
    "Store",
    "Membership",
    "Subscription",
    "UsageCounter",
    "AuditLog",
    "PlatformStaff",
    "BillingWebhookEvent",
  ])("has no access to %s", async (table) => {
    await expect(marketing.query(`SELECT 1 FROM "${table}" LIMIT 1`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("uses only its own rate-limit buckets", async () => {
    // Can't see or reset the sign-in bucket...
    const seen = await marketing.query('SELECT key FROM "RateLimit"');
    expect(seen.rows).toEqual([]);
    const reset = await marketing.query(`UPDATE "RateLimit" SET count = 0`);
    expect(reset.rowCount).toBe(0);
    await expect(
      marketing.query(
        `INSERT INTO "RateLimit" (id, key, count, "lastRequest")
         VALUES (gen_random_uuid(), 'sign-in:ip:198.51.100.1', 0, 0)`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(marketing.query('DELETE FROM "RateLimit"')).rejects.toThrow(/permission denied/);
    // ...but can count in its own.
    await marketing.query(
      `INSERT INTO "RateLimit" (id, key, count, "lastRequest")
       VALUES (gen_random_uuid(), 'marketing:contact:ip:198.51.100.1', 1, 0)`,
    );
    const own = await marketing.query('SELECT key FROM "RateLimit"');
    expect(own.rows).toEqual([{ key: "marketing:contact:ip:198.51.100.1" }]);
    const signIn = await migratorDb().rateLimit.findUnique({
      where: { key: "sign-in:ip:203.0.113.9" },
    });
    expect(signIn?.count).toBe(3);
  });
});
