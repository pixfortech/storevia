// Database-layer guarantees for custom domains (ADR-0032, migration
// 20270101010000): a primary is always ACTIVE and platform addresses are
// always ACTIVE; a claim's hostname, type and token never change; tokens
// and stored DNS records are bounded; only public changes (status,
// primary) emit invalidation events; the worker gets exactly the columns
// its verification step writes; tenants never see each other's domains.
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectTestClients, truncateAll } from "../src/testing";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const ORG_A = uuid(0xa1);
const ORG_B = uuid(0xb1);
const STORE_A = uuid(0x101);
const STORE_B = uuid(0x102);
const TOKEN = "t".repeat(43);

let admin: pg.Client;
let app: pg.Client;
let worker: pg.Client;

function connect(key: string): pg.Client {
  const url = process.env[key];
  if (!url) throw new Error(`${key} is not set`);
  return new pg.Client({ connectionString: url });
}

/** Runs `sql` and returns the SQLSTATE it failed with (null on success). */
async function code(
  client: pg.Client,
  sql: string,
  params: unknown[] = [],
  scope: { org?: string; store?: string } = {},
): Promise<string | null> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true)`,
      [scope.org ?? "", scope.store ?? ""],
    );
    await client.query(sql, params);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    await client.query("ROLLBACK");
  }
}

async function insertDomain(
  hostname: string,
  values: { status?: string; type?: string; primary?: boolean; store?: string; org?: string } = {},
): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "isPrimary", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4::"DomainType", $5::"DomainStatus", $6, $7, now()) RETURNING id`,
    [
      values.org ?? ORG_A,
      values.store ?? STORE_A,
      hostname,
      values.type ?? "CUSTOM",
      values.status ?? "PENDING",
      TOKEN,
      values.primary ?? false,
    ],
  );
  return rows[0]?.id ?? "";
}

beforeAll(async () => {
  admin = connect("DATABASE_MIGRATOR_URL");
  app = connect("DATABASE_URL");
  worker = connect("DATABASE_WORKER_URL");
  await Promise.all([admin.connect(), app.connect(), worker.connect()]);
});

beforeEach(async () => {
  await truncateAll();
  await admin.query(
    `INSERT INTO "Organisation" (id, name, "updatedAt") VALUES ($1, 'Org A', now()), ($2, 'Org B', now())`,
    [ORG_A, ORG_B],
  );
  for (const [id, org, slug] of [
    [STORE_A, ORG_A, "shop-a"],
    [STORE_B, ORG_B, "shop-b"],
  ] as const) {
    await admin.query(
      `INSERT INTO "Store" (id, "organisationId", name, slug, status, currency, locale, timezone, country, "updatedAt")
       VALUES ($1, $2, $3, $3, 'ACTIVE', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`,
      [id, org, slug],
    );
  }
});

afterAll(async () => {
  await Promise.all([admin.end(), app.end(), worker.end()]);
  await disconnectTestClients();
});

describe("constraints", () => {
  it("a primary domain is always ACTIVE, and one per store", async () => {
    const pending = await insertDomain("abc.test");
    expect(
      await code(admin, `UPDATE "StoreDomain" SET "isPrimary" = true WHERE id = $1`, [pending]),
    ).toBe("23514");
    const active = await insertDomain("active.test", { status: "ACTIVE", primary: true });
    // Failing a primary without handing primary over is refused.
    expect(
      await code(admin, `UPDATE "StoreDomain" SET status = 'FAILED' WHERE id = $1`, [active]),
    ).toBe("23514");
    await admin.query(`UPDATE "StoreDomain" SET status = 'ACTIVE' WHERE id = $1`, [pending]);
    expect(
      await code(admin, `UPDATE "StoreDomain" SET "isPrimary" = true WHERE id = $1`, [pending]),
    ).toBe("23505");
  });

  it("platform addresses are always ACTIVE", async () => {
    expect(
      await code(
        admin,
        `INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'x.storevia.site', 'PLATFORM_SUBDOMAIN', 'PENDING', $3, now())`,
        [ORG_A, STORE_A, TOKEN],
      ),
    ).toBe("23514");
  });

  it("the hostname, type and verification token of a claim never change", async () => {
    const id = await insertDomain("abc.test");
    for (const set of [
      `hostname = 'other.test'`,
      `type = 'PLATFORM_SUBDOMAIN'`,
      `"verificationToken" = '${"u".repeat(43)}'`,
    ]) {
      expect(await code(admin, `UPDATE "StoreDomain" SET ${set} WHERE id = $1`, [id])).toBe(
        "23514",
      );
    }
  });

  it("tokens are random-looking, and stored records and reasons are bounded", async () => {
    for (const token of ["x", "short-token", `${"a".repeat(40)} !`]) {
      expect(
        await code(
          admin,
          `INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'tok.test', 'CUSTOM', 'PENDING', $3, now())`,
          [ORG_A, STORE_A, token],
        ),
      ).toBe("23514");
    }
    const id = await insertDomain("abc.test");
    const big = JSON.stringify(Array.from({ length: 11 }, () => ({ type: "TXT" })));
    for (const [sql, params] of [
      [`UPDATE "StoreDomain" SET "dnsRecords" = $2::jsonb WHERE id = $1`, [id, big]],
      [`UPDATE "StoreDomain" SET "dnsRecords" = '{"a":1}'::jsonb WHERE id = $1`, [id]],
      [`UPDATE "StoreDomain" SET "checkAttempts" = -1 WHERE id = $1`, [id]],
      [`UPDATE "StoreDomain" SET "failureReason" = repeat('x', 65) WHERE id = $1`, [id]],
      [`UPDATE "StoreDomain" SET "providerRef" = repeat('x', 256) WHERE id = $1`, [id]],
    ] as const) {
      expect(await code(admin, sql, [...params])).toBe("23514");
    }
  });
});

describe("invalidation events", () => {
  it("only status and primary changes (and claims and removals) emit domain.changed", async () => {
    const count = async () =>
      Number(
        (
          await admin.query<{ n: string }>(
            `SELECT count(*) AS n FROM "OutboxEvent" WHERE type = 'domain.changed'`,
          )
        ).rows[0]?.n,
      );
    const id = await insertDomain("abc.test");
    expect(await count()).toBe(1);
    await admin.query(
      `UPDATE "StoreDomain" SET "checkAttempts" = 3, "lastCheckedAt" = now(), "failureReason" = 'dns_txt_missing',
         "dnsRecords" = '[]'::jsonb, "providerRef" = 'local:abc.test' WHERE id = $1`,
      [id],
    );
    expect(await count()).toBe(1);
    await admin.query(`UPDATE "StoreDomain" SET status = 'ACTIVE' WHERE id = $1`, [id]);
    expect(await count()).toBe(2);
    await admin.query(`UPDATE "StoreDomain" SET "isPrimary" = true WHERE id = $1`, [id]);
    expect(await count()).toBe(3);
    await admin.query(`UPDATE "StoreDomain" SET "isPrimary" = false WHERE id = $1`, [id]);
    await admin.query(`DELETE FROM "StoreDomain" WHERE id = $1`, [id]);
    expect(await count()).toBe(5);
  });
});

describe("the worker role", () => {
  it("writes the verification columns and nothing else", async () => {
    const id = await insertDomain("abc.test");
    expect(
      await code(
        worker,
        `UPDATE "StoreDomain" SET status = 'VERIFYING', "checkAttempts" = 1, "lastCheckedAt" = now(),
           "failureReason" = 'dns_txt_missing', "providerRef" = 'local:abc.test', "dnsRecords" = '[]'::jsonb,
           "updatedAt" = now() WHERE id = $1`,
        [id],
      ),
    ).toBeNull();
    for (const set of [
      `hostname = 'x.test'`,
      `"storeId" = '${STORE_B}'`,
      `"organisationId" = '${ORG_B}'`,
    ]) {
      expect(await code(worker, `UPDATE "StoreDomain" SET ${set} WHERE id = $1`, [id])).toBe(
        "42501",
      );
    }
    expect(await code(worker, `DELETE FROM "StoreDomain" WHERE id = $1`, [id])).toBe("42501");
    expect(
      await code(
        worker,
        `INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'w.test', 'CUSTOM', 'PENDING', $3, now())`,
        [ORG_A, STORE_A, TOKEN],
      ),
    ).toBe("42501");
    // It can lock due rows without waiting (FOR UPDATE SKIP LOCKED).
    expect(
      await code(
        worker,
        `SELECT id FROM "StoreDomain" WHERE type = 'CUSTOM' FOR UPDATE SKIP LOCKED`,
      ),
    ).toBeNull();
  });
});

describe("tenant isolation", () => {
  it("a store sees and changes only its own domains", async () => {
    const theirs = await insertDomain("theirs.test", { store: STORE_B, org: ORG_B });
    await app.query("BEGIN");
    try {
      await app.query(
        `SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true)`,
        [ORG_A, STORE_A],
      );
      const seen = await app.query(`SELECT id FROM "StoreDomain" WHERE hostname = 'theirs.test'`);
      expect(seen.rows).toEqual([]);
      const updated = await app.query(`UPDATE "StoreDomain" SET status = 'ACTIVE' WHERE id = $1`, [
        theirs,
      ]);
      expect(updated.rowCount).toBe(0);
      const deleted = await app.query(`DELETE FROM "StoreDomain" WHERE id = $1`, [theirs]);
      expect(deleted.rowCount).toBe(0);
    } finally {
      await app.query("ROLLBACK");
    }
    expect(
      await code(
        app,
        `INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'sneaky.test', 'CUSTOM', 'PENDING', $3, now())`,
        [ORG_B, STORE_B, TOKEN],
        { org: ORG_A, store: STORE_A },
      ),
    ).toBe("42501");
  });
});
