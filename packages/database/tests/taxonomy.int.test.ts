// The product taxonomy (migration 20261210000000_product_taxonomy): the
// reference file and its loader, ProductCategory's shape, who may read and
// write it, the Product.categoryCode foreign key, and the database's own
// guard on Product.tags. The seed loaded the taxonomy into this database
// (`pnpm db:test:prepare`); tests that change it restore it.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCategoryRows,
  readCategoryFile,
  syncProductCategories,
} from "../scripts/product-categories";
import { disconnectTestClients, migratorDb, truncateAll } from "../src/testing";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const ORG = uuid(0xc1);
const STORE = uuid(0xc2);
const PRODUCT = uuid(0xc3);

const ROLE_URLS = {
  app: "DATABASE_URL",
  storefront: "DATABASE_STOREFRONT_URL",
  checkout: "DATABASE_CHECKOUT_URL",
  marketing: "DATABASE_MARKETING_URL",
  platform: "DATABASE_PLATFORM_URL",
  system: "DATABASE_SYSTEM_URL",
  worker: "DATABASE_WORKER_URL",
  billing: "DATABASE_BILLING_URL",
} as const;
type Role = keyof typeof ROLE_URLS;

let admin: pg.Client;
const clients = {} as Record<Role, pg.Client>;

/** The Postgres error code of a statement run as the migrator (rolled back). */
async function adminError(sql: string, params: unknown[] = []): Promise<string | null> {
  await admin.query("BEGIN");
  try {
    await admin.query(sql, params);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    await admin.query("ROLLBACK");
  }
}

async function roleError(role: Role, sql: string): Promise<string | null> {
  const c = clients[role];
  await c.query("BEGIN");
  try {
    await c.query(sql);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    await c.query("ROLLBACK");
  }
}

beforeAll(async () => {
  await truncateAll();
  admin = new pg.Client({ connectionString: process.env["DATABASE_MIGRATOR_URL"] });
  await admin.connect();
  for (const [role, env] of Object.entries(ROLE_URLS) as [Role, string][]) {
    clients[role] = new pg.Client({ connectionString: process.env[env] });
    await clients[role].connect();
  }
  await admin.query(
    `INSERT INTO "Organisation" (id, name, "updatedAt") VALUES ($1, 'Tax org', now())`,
    [ORG],
  );
  await admin.query(
    `INSERT INTO "Store" (id, "organisationId", name, slug, currency, locale, timezone, country, "updatedAt")
     VALUES ($1, $2, 'Tax store', 'tax-store', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`,
    [STORE, ORG],
  );
  await admin.query(
    `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, status, tags, "categoryCode", "updatedAt")
     VALUES ($1, $2, $3, 'Saucepan', 'saucepan', 'ACTIVE', ARRAY['Kitchen'], 'hg-kd-cookware', now())`,
    [PRODUCT, ORG, STORE],
  );
});

afterAll(async () => {
  await truncateAll();
  // Leave the reference data exactly as the seed loads it.
  await syncProductCategories(migratorDb());
  await admin.end();
  for (const c of Object.values(clients)) await c.end();
  await disconnectTestClients();
});

describe("reference file", () => {
  it("is a well-formed tree covering the sample catalogue", () => {
    const rows = readCategoryFile();
    expect(rows.length).toBeGreaterThan(50);
    const byCode = new Map(rows.map((r) => [r.code, r]));
    for (const code of [
      "hg-kd-cookware",
      "hg-kd-drinkware-mugs",
      "hg-kd-linens-aprons",
      "hg-kd-linens-tea-towels",
      "hg-lg-planters",
      "aa",
      "el",
      "hb",
    ]) {
      expect(byCode.has(code), code).toBe(true);
    }
    expect(byCode.get("hg-kd-cookware")).toMatchObject({
      path: "Home & Garden > Kitchen & Dining > Cookware",
      level: 3,
      parentCode: "hg-kd",
    });
  });

  it.each([
    [[{ code: "a" }, { code: "a" }], /duplicate/],
    [[{ code: "Bad Code" }], /bad category code/],
    [[{ code: "a", parent: "missing" }], /unknown parent/],
    [
      [
        { code: "a", parent: "b" },
        { code: "b", parent: "a" },
      ],
      /cycle/,
    ],
    [[{ code: "a", name: "A > B" }], /bad category name/],
    [[{ code: "a", name: " padded" }], /bad category name/],
  ])("rejects a broken file (%#)", (source, message) => {
    const rows = source.map((s) => ({ name: "Name", ...s }));
    expect(() => buildCategoryRows(rows)).toThrow(message);
  });

  it("orders siblings as listed", () => {
    const rows = buildCategoryRows([
      { code: "z", name: "Z" },
      { code: "a", name: "A" },
      { code: "z-2", name: "Two", parent: "z" },
      { code: "z-1", name: "One", parent: "z" },
    ]);
    expect(rows.map((r) => [r.code, r.position])).toEqual([
      ["z", 0],
      ["a", 1],
      ["z-2", 0],
      ["z-1", 1],
    ]);
  });
});

describe("loaded taxonomy", () => {
  it("holds every code in the file, active, with level and path matching its parent", async () => {
    const rows = readCategoryFile();
    const { rows: active } = await admin.query<{ code: string }>(
      `SELECT code FROM "ProductCategory" WHERE active ORDER BY code`,
    );
    expect(active.map((r) => r.code)).toEqual(rows.map((r) => r.code).sort());
    const { rows: broken } = await admin.query(
      `SELECT c.code FROM "ProductCategory" c LEFT JOIN "ProductCategory" p ON p.code = c."parentCode"
       WHERE (p.code IS NULL AND (c.level <> 1 OR c.path <> c.name))
          OR (p.code IS NOT NULL AND (c.level <> p.level + 1 OR c.path <> p.path || ' > ' || c.name))`,
    );
    expect(broken).toEqual([]);
  });

  it("reloads idempotently, deactivates removed codes and revives returning ones", async () => {
    const db = migratorDb();
    const before = await admin.query<{ max: Date }>(
      `SELECT max("updatedAt") AS max FROM "ProductCategory"`,
    );
    expect(await syncProductCategories(db)).toMatchObject({ deactivated: 0 });
    const after = await admin.query<{ max: Date }>(
      `SELECT max("updatedAt") AS max FROM "ProductCategory"`,
    );
    // Nothing changed, so nothing was rewritten.
    expect(after.rows[0]?.max).toEqual(before.rows[0]?.max);

    const all = readCategoryFile();
    const without = all.filter((r) => !r.code.startsWith("hg-kd-cookware"));
    expect(await syncProductCategories(db, without)).toMatchObject({ deactivated: 1 });
    const { rows } = await admin.query(
      `SELECT active FROM "ProductCategory" WHERE code = 'hg-kd-cookware'`,
    );
    // Deactivated, not deleted: the product still points at it.
    expect(rows).toEqual([{ active: false }]);
    const { rows: product } = await admin.query(
      `SELECT "categoryCode" FROM "Product" WHERE id = $1`,
      [PRODUCT],
    );
    expect(product).toEqual([{ categoryCode: "hg-kd-cookware" }]);
    await syncProductCategories(db, all);
    const { rows: revived } = await admin.query(
      `SELECT active FROM "ProductCategory" WHERE code = 'hg-kd-cookware'`,
    );
    expect(revived).toEqual([{ active: true }]);
  });

  it("renames flow into every descendant's path", async () => {
    const db = migratorDb();
    const source = readCategoryFile().map((r) => ({
      code: r.code,
      name: r.code === "hg-kd" ? "Kitchen" : r.name,
      ...(r.parentCode ? { parent: r.parentCode } : {}),
    }));
    await syncProductCategories(db, buildCategoryRows(source));
    const { rows } = await admin.query<{ path: string }>(
      `SELECT path FROM "ProductCategory" WHERE code = 'hg-kd-drinkware-mugs'`,
    );
    expect(rows[0]?.path).toBe("Home & Garden > Kitchen > Drinkware > Mugs");
    await syncProductCategories(db);
  });
});

describe("constraints", () => {
  it.each([
    [
      "a bad code",
      `INSERT INTO "ProductCategory" (code, name, level, path, "updatedAt") VALUES ('Bad Code', 'X', 1, 'X', now())`,
    ],
    [
      "a name with the separator",
      `INSERT INTO "ProductCategory" (code, name, level, path, "updatedAt") VALUES ('x', 'A > B', 1, 'A > B', now())`,
    ],
    [
      "a top level with a level",
      `INSERT INTO "ProductCategory" (code, name, level, path, "updatedAt") VALUES ('x', 'X', 2, 'X', now())`,
    ],
    [
      "a child at level 1",
      `INSERT INTO "ProductCategory" (code, name, "parentCode", level, path, "updatedAt") VALUES ('x', 'X', 'hg', 1, 'X', now())`,
    ],
    [
      "an unknown parent",
      `INSERT INTO "ProductCategory" (code, name, "parentCode", level, path, "updatedAt") VALUES ('x', 'X', 'nope', 2, 'X', now())`,
    ],
    [
      "a path not ending in the name",
      `INSERT INTO "ProductCategory" (code, name, level, path, "updatedAt") VALUES ('x', 'X', 1, 'Y', now())`,
    ],
  ])("refuses %s", async (_label, sql) => {
    expect(await adminError(sql)).toMatch(/^23(514|503)$/);
  });

  it("Product.categoryCode must name a category, and a used category can't be deleted", async () => {
    expect(
      await adminError(`UPDATE "Product" SET "categoryCode" = 'no-such-code' WHERE id = $1`, [
        PRODUCT,
      ]),
    ).toBe("23503");
    // ON DELETE RESTRICT: foreign_key_violation (23503) up to PostgreSQL 18,
    // restrict_violation (23001) from the newer server the canary job runs.
    const RESTRICTED = /^(23503|23001)$/;
    expect(await adminError(`DELETE FROM "ProductCategory" WHERE code = 'hg-kd-cookware'`)).toMatch(
      RESTRICTED,
    );
    // A parent can't be deleted from under its children either.
    expect(await adminError(`DELETE FROM "ProductCategory" WHERE code = 'hg-lg'`)).toMatch(
      RESTRICTED,
    );
    // Null stays valid: products needn't be categorised.
    expect(
      await adminError(`UPDATE "Product" SET "categoryCode" = NULL WHERE id = $1`, [PRODUCT]),
    ).toBeNull();
  });

  it.each([
    ["too many", `SELECT array_agg('t' || g) FROM generate_series(1, 51) g`],
    ["too long", `SELECT ARRAY[repeat('x', 41)]`],
    ["untrimmed", `SELECT ARRAY[' x']`],
    ["a comma", `SELECT ARRAY['a,b']`],
    ["a control character", `SELECT ARRAY[E'a\\tb']`],
    ["empty", `SELECT ARRAY['']`],
  ])("Product.tags refuses %s", async (_label, value) => {
    expect(
      await adminError(`UPDATE "Product" SET tags = (${value}) WHERE id = $1`, [PRODUCT]),
    ).toBe("23514");
  });

  it("Product.tags accepts the maximum", async () => {
    expect(
      await adminError(
        `UPDATE "Product" SET tags = (SELECT array_agg(repeat('é', 38) || lpad(g::text, 2, '0'))
           FROM generate_series(1, 50) g) WHERE id = $1`,
        [PRODUCT],
      ),
    ).toBeNull();
  });
});

describe("grants", () => {
  it.each(["app", "storefront"] as const)("%s reads the taxonomy", async (role) => {
    const { rows } = await clients[role].query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "ProductCategory" WHERE active`,
    );
    expect(Number(rows[0]?.n)).toBeGreaterThan(50);
  });

  it.each(["checkout", "marketing", "platform", "system", "worker", "billing"] as const)(
    "%s can't read it (no need)",
    async (role) => {
      expect(await roleError(role, `SELECT code FROM "ProductCategory" LIMIT 1`)).toBe("42501");
    },
  );

  it.each(Object.keys(ROLE_URLS) as Role[])("%s can't write it", async (role) => {
    for (const sql of [
      `INSERT INTO "ProductCategory" (code, name, level, path, "updatedAt") VALUES ('x', 'X', 1, 'X', now())`,
      `UPDATE "ProductCategory" SET name = 'Hacked' WHERE code = 'hg'`,
      `DELETE FROM "ProductCategory" WHERE code = 'hg'`,
      `TRUNCATE "ProductCategory"`,
    ]) {
      expect(await roleError(role, sql), `${role}: ${sql}`).toBe("42501");
    }
  });

  it("the storefront role may read a product's category code, nothing new beyond it", async () => {
    const c = clients.storefront;
    await c.query("BEGIN");
    try {
      await c.query(
        "SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true)",
        [ORG, STORE],
      );
      const { rows } = await c.query(
        `SELECT p."categoryCode", pc.path FROM "Product" p
         JOIN "ProductCategory" pc ON pc.code = p."categoryCode" WHERE p.id = $1`,
        [PRODUCT],
      );
      expect(rows).toEqual([
        { categoryCode: "hg-kd-cookware", path: "Home & Garden > Kitchen & Dining > Cookware" },
      ]);
    } finally {
      await c.query("ROLLBACK");
    }
    expect(await roleError("storefront", `SELECT "createdById" FROM "Product" LIMIT 1`)).toBe(
      "42501",
    );
  });
});
