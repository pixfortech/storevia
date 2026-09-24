// Database-layer tenant isolation (docs/architecture/03-tenancy.md §8: T12-T14)
// plus grants, triggers and partial unique indexes from the first migration.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectTestClients, migratorDb, truncateAll } from "../src/testing";

const A = {
  user: "0190f2a4-0000-7000-8000-00000000000a",
  org: "0190f2a4-0000-7000-8000-0000000000a1",
  store: "0190f2a4-0000-7000-8000-0000000000a2",
  membership: "0190f2a4-0000-7000-8000-0000000000a3",
};
const B = {
  user: "0190f2a4-0000-7000-8000-00000000000b",
  org: "0190f2a4-0000-7000-8000-0000000000b1",
  store: "0190f2a4-0000-7000-8000-0000000000b2",
  membership: "0190f2a4-0000-7000-8000-0000000000b3",
};

let app: pg.Client;

type Row = Record<string, unknown>;
async function rows(c: pg.Client, sql: string, params: unknown[] = []): Promise<Row[]> {
  return (await c.query<Row>(sql, params)).rows;
}

/** Runs statements as storevia_app inside one transaction with the given RLS context. */
async function asApp<T>(
  ctx: { org?: string; store?: string; user?: string },
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  await app.query("BEGIN");
  try {
    await app.query(
      "SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true), set_config('app.user_id', $3, true)",
      [ctx.org ?? "", ctx.store ?? "", ctx.user ?? ""],
    );
    return await fn(app);
  } finally {
    await app.query("ROLLBACK");
  }
}

async function seedTenant(t: typeof A, slug: string): Promise<void> {
  const db = migratorDb();
  await db.user.create({ data: { id: t.user, email: `${slug}@example.test`, name: slug } });
  await db.organisation.create({ data: { id: t.org, name: `Org ${slug}` } });
  await db.membership.create({
    data: { id: t.membership, organisationId: t.org, userId: t.user, role: "OWNER" },
  });
  await db.store.create({
    data: {
      id: t.store,
      organisationId: t.org,
      name: `Store ${slug}`,
      slug,
      currency: "INR",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      country: "IN",
    },
  });
  await db.storeDomain.create({
    data: {
      organisationId: t.org,
      storeId: t.store,
      hostname: `${slug}.storevia.site`,
      type: "PLATFORM_SUBDOMAIN",
      status: "ACTIVE",
      isPrimary: true,
      verificationToken: "x",
    },
  });
  await db.auditLog.create({
    data: { organisationId: t.org, actorType: "USER", actorId: t.user, action: "test.seed" },
  });
}

beforeAll(async () => {
  await truncateAll();
  await seedTenant(A, "tenant-a");
  await seedTenant(B, "tenant-b");
  app = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await app.connect();
});

afterAll(async () => {
  await app.end();
  await disconnectTestClients();
});

const TENANT_TABLES = ["Organisation", "Membership", "Store", "StoreDomain", "AuditLog"] as const;

describe("T12 row-level security (storevia_app)", () => {
  it("connects as a role that cannot bypass RLS", async () => {
    const { rows } = await app.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user",
    );
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it.each(TENANT_TABLES)("%s: context A sees only tenant A rows", async (table) => {
    const col = table === "Organisation" ? "id" : '"organisationId"';
    const result = await asApp({ org: A.org }, (c) =>
      rows(c, `SELECT ${col} AS org FROM "${table}"`),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r["org"] === A.org)).toBe(true);
  });

  it.each(TENANT_TABLES)("%s: no context means no rows (fail closed)", async (table) => {
    const result = await asApp({}, (c) => rows(c, `SELECT 1 FROM "${table}"`));
    expect(result).toHaveLength(0);
  });

  it("cannot read tenant B by explicit ID", async () => {
    const result = await asApp({ org: A.org, user: A.user }, (c) =>
      rows(c, 'SELECT id FROM "Store" WHERE id = $1', [B.store]),
    );
    expect(result).toHaveLength(0);
  });

  it("cannot update or delete tenant B rows", async () => {
    await asApp({ org: A.org, user: A.user }, async (c) => {
      const updated = await c.query('UPDATE "Store" SET name = $1 WHERE id = $2', [
        "pwned",
        B.store,
      ]);
      expect(updated.rowCount).toBe(0);
      const deleted = await c.query('DELETE FROM "StoreDomain" WHERE "storeId" = $1', [B.store]);
      expect(deleted.rowCount).toBe(0);
    });
  });

  it("cannot insert rows claiming tenant B", async () => {
    await expect(
      asApp({ org: A.org, user: A.user }, (c) =>
        c.query(
          `INSERT INTO "Store" (id, "organisationId", name, slug, currency, locale, timezone, country, "updatedAt")
           VALUES (gen_random_uuid(), $1, 'x', 'sneaky-store', 'INR', 'en', 'UTC', 'IN', now())`,
          [B.org],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("store context restricts store rows to that store", async () => {
    const result = await asApp({ org: A.org, store: A.store }, (c) =>
      rows(c, 'SELECT id FROM "Store"'),
    );
    expect(result).toEqual([{ id: A.store }]);
  });

  it("user context lists only the user's own organisations and memberships", async () => {
    await asApp({ user: A.user }, async (c) => {
      const orgs = (await c.query('SELECT id FROM "Organisation"')).rows;
      expect(orgs).toEqual([{ id: A.org }]);
      const memberships = (await c.query('SELECT "organisationId" FROM "Membership"')).rows;
      expect(memberships).toEqual([{ organisationId: A.org }]);
      const stores = (await c.query('SELECT id FROM "Store"')).rows;
      expect(stores).toEqual([{ id: A.store }]);
    });
  });

  it("User rows: only self and co-members of the current organisation", async () => {
    const result = await asApp({ org: A.org, user: A.user }, (c) =>
      rows(c, 'SELECT id FROM "User"'),
    );
    expect(result).toEqual([{ id: A.user }]);
  });
});

describe("grants (ADR-0021)", () => {
  it.each(["Session", "Account", "Verification", "RateLimit", "PlatformStaff"])(
    "app role has no access to %s",
    async (table) => {
      await expect(
        asApp({ org: A.org }, (c) => c.query(`SELECT 1 FROM "${table}"`)),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it("app role cannot read non-granted User columns", async () => {
    await expect(
      asApp({ user: A.user }, (c) => c.query('SELECT "deletedAt" FROM "User"')),
    ).rejects.toThrow(/permission denied/);
  });

  it("app role cannot update or delete audit logs", async () => {
    await expect(
      asApp({ org: A.org }, (c) => c.query(`UPDATE "AuditLog" SET action = 'x'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asApp({ org: A.org }, (c) => c.query('DELETE FROM "AuditLog"'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("T13 RLS coverage", () => {
  it("every table with an organisationId column has RLS enabled, forced and a policy", async () => {
    const { rows } = await app.query<{
      table: string;
      enabled: boolean;
      forced: boolean;
      policies: string;
    }>(`
      SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname)::text AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND (EXISTS (SELECT 1 FROM information_schema.columns col
                     WHERE col.table_schema = 'public' AND col.table_name = c.relname
                       AND col.column_name = 'organisationId')
             OR c.relname = 'Organisation')`);
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const row of rows) {
      expect(row, row.table).toMatchObject({ enabled: true, forced: true });
      expect(Number(row.policies), row.table).toBeGreaterThan(0);
    }
  });
});

describe("T14 composite foreign keys and invariants", () => {
  it("a domain cannot claim a store of another organisation", async () => {
    await expect(
      migratorDb().storeDomain.create({
        data: {
          organisationId: A.org,
          storeId: B.store,
          hostname: "cross.storevia.site",
          type: "CUSTOM",
          verificationToken: "x",
        },
      }),
    ).rejects.toThrow();
  });

  it("store access cannot link a membership to another organisation's store", async () => {
    await expect(
      migratorDb().membershipStoreAccess.create({
        data: { membershipId: A.membership, organisationId: A.org, storeId: B.store },
      }),
    ).rejects.toThrow();
  });

  it("ownership columns are immutable", async () => {
    await expect(
      migratorDb().store.update({ where: { id: A.store }, data: { organisationId: B.org } }),
    ).rejects.toThrow(/immutable/);
  });

  it("an organisation has exactly one OWNER", async () => {
    await migratorDb().user.create({
      data: { id: "0190f2a4-0000-7000-8000-0000000000c1", email: "second@example.test", name: "x" },
    });
    await expect(
      migratorDb().membership.create({
        data: {
          organisationId: A.org,
          userId: "0190f2a4-0000-7000-8000-0000000000c1",
          role: "OWNER",
        },
      }),
    ).rejects.toThrow();
  });

  it("store slugs must be well-formed", async () => {
    await expect(
      migratorDb().store.create({
        data: {
          organisationId: A.org,
          name: "x",
          slug: "Bad_Slug",
          currency: "INR",
          locale: "en",
          timezone: "UTC",
          country: "IN",
        },
      }),
    ).rejects.toThrow();
  });
});
