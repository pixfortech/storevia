// Database-layer guarantees for the catalogue, media and inventory tables
// (ADR-0027, migration 20260928000000): row-level security, same-store
// linkage, immutable ownership, CHECKs, partial unique indexes, grants and the
// organisation-wide usage functions. Application checks come on top of these;
// these tests prove the database refuses on its own.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectTestClients, truncateAll } from "../src/testing";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

interface Tenant {
  readonly user: string;
  readonly org: string;
  readonly stores: readonly string[];
}
const A: Tenant = { user: uuid(0xa0), org: uuid(0xa1), stores: [uuid(0xa2), uuid(0xa3)] };
const B: Tenant = { user: uuid(0xb0), org: uuid(0xb1), stores: [uuid(0xb2)] };

/** Ids of one store's fixture catalogue. */
interface Catalogue {
  readonly org: string;
  readonly store: string;
  readonly media: string;
  readonly product: string;
  readonly option: string;
  readonly value: string;
  readonly variant: string;
  readonly collection: string;
  readonly location: string;
  readonly item: string;
}

const CATALOGUE_TABLES = [
  "MediaAsset",
  "Product",
  "ProductOption",
  "ProductOptionValue",
  "ProductVariant",
  "ProductVariantOptionValue",
  "ProductMedia",
  "Collection",
  "CollectionProduct",
  "Location",
  "InventoryItem",
  "InventoryLevel",
  "InventoryMovement",
] as const;

let admin: pg.Client; // migrator: BYPASSRLS, arranges fixtures
let app: pg.Client; // storevia_app: NOBYPASSRLS
const catalogues = new Map<string, Catalogue>();

type Row = Record<string, unknown>;

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

/** Runs a statement as the migrator in a rolled-back transaction; returns the error code. */
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

async function appError(
  ctx: { org?: string; store?: string },
  sql: string,
  params: unknown[] = [],
): Promise<string | null> {
  return asApp(ctx, async (c) => {
    try {
      await c.query(sql, params);
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? "unknown";
    }
  });
}

async function seedTenant(t: Tenant, slug: string): Promise<void> {
  await admin.query(
    `INSERT INTO "User" (id, email, name, "updatedAt") VALUES ($1, $2, $3, now())`,
    [t.user, `${slug}@example.test`, slug],
  );
  await admin.query(`INSERT INTO "Organisation" (id, name, "updatedAt") VALUES ($1, $2, now())`, [
    t.org,
    `Org ${slug}`,
  ]);
  for (const [i, store] of t.stores.entries()) {
    await admin.query(
      `INSERT INTO "Store" (id, "organisationId", name, slug, currency, locale, timezone, country, "updatedAt")
       VALUES ($1, $2, $3, $4, 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`,
      [store, t.org, `Store ${slug} ${String(i)}`, `${slug}-${String(i)}`],
    );
    catalogues.set(store, await seedCatalogue(t.org, store));
  }
}

async function one(sql: string, params: unknown[]): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) throw new Error(`no id from ${sql}`);
  return id;
}

async function seedCatalogue(org: string, store: string): Promise<Catalogue> {
  const media = await one(
    `INSERT INTO "MediaAsset" (id, "organisationId", "storeId", kind, status, filename, "declaredMimeType", "mimeType", "sizeBytes", "storageKey", renditions, "updatedAt")
     SELECT m, $1::uuid, $2::uuid, 'IMAGE', 'READY', 'shirt.jpg', 'image/jpeg', 'image/jpeg', 1000, $1::text || '/' || $2::text || '/' || m::text || '/original.jpg',
            '[{"key":"x","width":320,"height":320,"format":"webp","bytes":100}]'::jsonb, now()
     FROM gen_random_uuid() AS m RETURNING id`,
    [org, store],
  );
  const product = await one(
    `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Linen shirt', 'linen-shirt', now()) RETURNING id`,
    [org, store],
  );
  const option = await one(
    `INSERT INTO "ProductOption" (id, "organisationId", "storeId", "productId", name, position)
     VALUES (gen_random_uuid(), $1, $2, $3, 'Size', 0) RETURNING id`,
    [org, store, product],
  );
  const value = await one(
    `INSERT INTO "ProductOptionValue" (id, "organisationId", "storeId", "optionId", value, position)
     VALUES (gen_random_uuid(), $1, $2, $3, 'M', 0) RETURNING id`,
    [org, store, option],
  );
  const variant = await one(
    `INSERT INTO "ProductVariant" (id, "organisationId", "storeId", "productId", title, "optionSignature", sku, currency, "priceAmount", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 'M', $4, 'SHIRT-M', 'INR', 99950, now()) RETURNING id`,
    [org, store, product, value],
  );
  await admin.query(
    `INSERT INTO "ProductVariantOptionValue" ("organisationId", "storeId", "variantId", "optionId", "optionValueId")
     VALUES ($1, $2, $3, $4, $5)`,
    [org, store, variant, option, value],
  );
  await admin.query(
    `INSERT INTO "ProductMedia" (id, "organisationId", "storeId", "productId", "mediaAssetId", position)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 0)`,
    [org, store, product, media],
  );
  const collection = await one(
    `INSERT INTO "Collection" (id, "organisationId", "storeId", title, handle, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Summer', 'summer', now()) RETURNING id`,
    [org, store],
  );
  await admin.query(
    `INSERT INTO "CollectionProduct" ("organisationId", "storeId", "collectionId", "productId", position)
     VALUES ($1, $2, $3, $4, 0)`,
    [org, store, collection, product],
  );
  const location = await one(
    `INSERT INTO "Location" (id, "organisationId", "storeId", name, code, "countryCode", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Main location', 'MAIN', 'IN', now()) RETURNING id`,
    [org, store],
  );
  const item = await one(
    `INSERT INTO "InventoryItem" (id, "organisationId", "storeId", "variantId", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, now()) RETURNING id`,
    [org, store, variant],
  );
  await admin.query(
    `INSERT INTO "InventoryLevel" (id, "organisationId", "storeId", "inventoryItemId", "locationId", available, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 5, now())`,
    [org, store, item, location],
  );
  await admin.query(
    `INSERT INTO "InventoryMovement" (id, "organisationId", "storeId", "inventoryItemId", "locationId", "quantityName", delta, "resultingValue", reason)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AVAILABLE', 5, 5, 'INITIAL')`,
    [org, store, item, location],
  );
  return { org, store, media, product, option, value, variant, collection, location, item };
}

const cat = (store: string): Catalogue => {
  const found = catalogues.get(store);
  if (!found) throw new Error("fixture missing");
  return found;
};
const A1 = () => cat(A.stores[0] ?? "");
const A2 = () => cat(A.stores[1] ?? "");
const B1 = () => cat(B.stores[0] ?? "");

beforeAll(async () => {
  await truncateAll();
  admin = new pg.Client({ connectionString: process.env["DATABASE_MIGRATOR_URL"] });
  app = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await admin.connect();
  await app.connect();
  await seedTenant(A, "tenant-a");
  await seedTenant(B, "tenant-b");
});

afterAll(async () => {
  await admin.end();
  await app.end();
  await truncateAll();
  await disconnectTestClients();
});

describe("row-level security on every catalogue table", () => {
  it.each(CATALOGUE_TABLES)("%s: RLS is enabled and forced", async (table) => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1",
      [table],
    );
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it.each(CATALOGUE_TABLES)("%s: organisation A sees only its own rows", async (table) => {
    const rows = await asApp(
      { org: A.org },
      async (c) => (await c.query<Row>(`SELECT "organisationId", "storeId" FROM "${table}"`)).rows,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r["organisationId"] === A.org)).toBe(true);
  });

  it.each(CATALOGUE_TABLES)("%s: a store scope sees only that store", async (table) => {
    const rows = await asApp(
      { org: A.org, store: A1().store },
      async (c) => (await c.query<Row>(`SELECT "storeId" FROM "${table}"`)).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r["storeId"] === A1().store)).toBe(true);
  });

  it.each(CATALOGUE_TABLES)("%s: no context means no rows", async (table) => {
    const rows = await asApp(
      {},
      async (c) => (await c.query<Row>(`SELECT 1 FROM "${table}"`)).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("cannot read tenant B's product by id, even with B's store id as the scope", async () => {
    const byId = await asApp(
      { org: A.org },
      async (c) =>
        (await c.query<Row>('SELECT id FROM "Product" WHERE id = $1', [B1().product])).rows,
    );
    expect(byId).toHaveLength(0);
    // A browser-supplied store id is not access: the organisation still filters.
    const swapped = await asApp(
      { org: A.org, store: B1().store },
      async (c) => (await c.query<Row>('SELECT id FROM "Product"')).rows,
    );
    expect(swapped).toHaveLength(0);
  });

  it("cannot write rows claiming another organisation or store", async () => {
    expect(
      await appError(
        { org: A.org, store: A1().store },
        `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'x', 'sneaky', now())`,
        [B.org, B1().store],
      ),
    ).toBe("42501");
    expect(
      await appError(
        { org: A.org, store: A1().store },
        `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'x', 'sneaky', now())`,
        [A.org, A2().store],
      ),
    ).toBe("42501");
  });

  it("cannot update or adjust tenant B's rows", async () => {
    await asApp({ org: A.org }, async (c) => {
      const updated = await c.query('UPDATE "Product" SET title = $1 WHERE id = $2', [
        "pwned",
        B1().product,
      ]);
      expect(updated.rowCount).toBe(0);
      const adjusted = await c.query(
        'UPDATE "InventoryLevel" SET available = available + 100 WHERE "inventoryItemId" = $1',
        [B1().item],
      );
      expect(adjusted.rowCount).toBe(0);
    });
  });
});

describe("same-store linkage is enforced by the database", () => {
  // As the migrator (bypassing RLS), so only constraints can refuse.
  it("a variant cannot belong to another store's product", async () => {
    expect(
      await adminError(
        `INSERT INTO "ProductVariant" (id, "organisationId", "storeId", "productId", title, "optionSignature", currency, "priceAmount", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'x', 'x', 'INR', 1, now())`,
        [A.org, A1().store, A2().product],
      ),
    ).toBe("23503");
  });

  it("a collection cannot contain another store's product", async () => {
    expect(
      await adminError(
        `INSERT INTO "CollectionProduct" ("organisationId", "storeId", "collectionId", "productId", position)
         VALUES ($1, $2, $3, $4, 1)`,
        [A.org, A1().store, A1().collection, A2().product],
      ),
    ).toBe("23503");
  });

  it("stock cannot be held at another store's location", async () => {
    expect(
      await adminError(
        `INSERT INTO "InventoryLevel" (id, "organisationId", "storeId", "inventoryItemId", "locationId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
        [A.org, A1().store, A1().item, A2().location],
      ),
    ).toBe("23503");
    expect(
      await adminError(
        `INSERT INTO "InventoryMovement" (id, "organisationId", "storeId", "inventoryItemId", "locationId", "quantityName", delta, "resultingValue", reason)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AVAILABLE', 1, 1, 'CORRECTION')`,
        [A.org, A1().store, A1().item, B1().location],
      ),
    ).toBe("23503");
  });

  it("a product cannot use another tenant's media", async () => {
    expect(
      await adminError(
        `INSERT INTO "ProductMedia" (id, "organisationId", "storeId", "productId", "mediaAssetId", position)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)`,
        [A.org, A1().store, A1().product, B1().media],
      ),
    ).toBe("23503");
  });

  it("variant, collection and store images must be the store's own media", async () => {
    expect(
      await adminError('UPDATE "ProductVariant" SET "imageMediaId" = $1 WHERE id = $2', [
        A2().media,
        A1().variant,
      ]),
    ).toBe("23503");
    expect(
      await adminError('UPDATE "Collection" SET "imageMediaId" = $1 WHERE id = $2', [
        B1().media,
        A1().collection,
      ]),
    ).toBe("23503");
    expect(
      await adminError('UPDATE "Store" SET "logoMediaId" = $1 WHERE id = $2', [
        A2().media,
        A1().store,
      ]),
    ).toBe("23503");
    expect(
      await adminError('UPDATE "ProductVariant" SET "imageMediaId" = $1 WHERE id = $2', [
        A1().media,
        A1().variant,
      ]),
    ).toBeNull();
    expect(
      await adminError('UPDATE "Store" SET "faviconMediaId" = $1 WHERE id = $2', [
        A1().media,
        A1().store,
      ]),
    ).toBeNull();
  });

  it("a variant's option values come from its own product's options", async () => {
    const other = await one(
      `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'Other', 'other-product', now()) RETURNING id`,
      [A.org, A1().store],
    );
    const otherVariant = await one(
      `INSERT INTO "ProductVariant" (id, "organisationId", "storeId", "productId", title, "optionSignature", currency, "priceAmount", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 'Default', '', 'INR', 1, now()) RETURNING id`,
      [A.org, A1().store, other],
    );
    expect(
      await adminError(
        `INSERT INTO "ProductVariantOptionValue" ("organisationId", "storeId", "variantId", "optionId", "optionValueId")
         VALUES ($1, $2, $3, $4, $5)`,
        [A.org, A1().store, otherVariant, A1().option, A1().value],
      ),
    ).toBe("23503");
    await admin.query('DELETE FROM "Product" WHERE id = $1', [other]);
  });

  it("a variant's price is in its store's currency", async () => {
    expect(
      await adminError(
        `INSERT INTO "ProductVariant" (id, "organisationId", "storeId", "productId", title, "optionSignature", currency, "priceAmount", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'x', 'usd', 'USD', 1, now())`,
        [A.org, A1().store, A1().product],
      ),
    ).toBe("23514");
  });
});

describe("immutable ownership and parents", () => {
  it.each([
    ['UPDATE "Product" SET "storeId" = $1 WHERE id = $2', () => [A2().store, A1().product]],
    ['UPDATE "Location" SET "organisationId" = $1 WHERE id = $2', () => [B.org, A1().location]],
    [
      'UPDATE "ProductVariant" SET "productId" = $1 WHERE id = $2',
      () => [A2().product, A1().variant],
    ],
    ['UPDATE "ProductVariant" SET currency = $1 WHERE id = $2', () => ["USD", A1().variant]],
    ['UPDATE "InventoryItem" SET "variantId" = $1 WHERE id = $2', () => [A2().variant, A1().item]],
    [
      'UPDATE "InventoryLevel" SET "locationId" = $1 WHERE "inventoryItemId" = $2',
      () => [A2().location, A1().item],
    ],
  ] as const)("%s is refused", async (sql, params) => {
    expect(await adminError(sql, [...params()])).toBe("23514");
  });
});

describe("CHECK constraints", () => {
  it.each([
    ['UPDATE "ProductVariant" SET "priceAmount" = -1 WHERE id = $1', () => [A1().variant]],
    ['UPDATE "ProductVariant" SET "costAmount" = -1 WHERE id = $1', () => [A1().variant]],
    ['UPDATE "ProductVariant" SET "compareAtAmount" = 99950 WHERE id = $1', () => [A1().variant]],
    ["UPDATE \"ProductVariant\" SET sku = ' padded ' WHERE id = $1", () => [A1().variant]],
    ['UPDATE "ProductVariant" SET "deletedAt" = now() WHERE id = $1', () => [A1().variant]],
    ["UPDATE \"Product\" SET handle = 'Not A Handle' WHERE id = $1", () => [A1().product]],
    ["UPDATE \"Product\" SET status = 'ARCHIVED' WHERE id = $1", () => [A1().product]],
    ['UPDATE "Product" SET "archivedAt" = now() WHERE id = $1', () => [A1().product]],
    ["UPDATE \"Product\" SET title = '   ' WHERE id = $1", () => [A1().product]],
    ["UPDATE \"Collection\" SET type = 'SMART' WHERE id = $1", () => [A1().collection]],
    ["UPDATE \"Location\" SET code = 'main' WHERE id = $1", () => [A1().location]],
    ['UPDATE "InventoryLevel" SET reserved = -1 WHERE "inventoryItemId" = $1', () => [A1().item]],
    ['UPDATE "MediaAsset" SET "storageKey" = \'../elsewhere\' WHERE id = $1', () => [A1().media]],
  ] as const)("%s is refused", async (sql, params) => {
    expect(await adminError(sql, [...params()])).toBe("23514");
  });

  it("archiving sets status and archivedAt together; a soft-deleted variant frees its signature", async () => {
    expect(
      await adminError(
        `UPDATE "Product" SET status = 'ARCHIVED', "archivedAt" = now() WHERE id = $1`,
        [A1().product],
      ),
    ).toBeNull();
    expect(
      await adminError(
        `UPDATE "ProductVariant" SET "deletedAt" = now(), "optionSignature" = 'deleted:' || id WHERE id = $1`,
        [A1().variant],
      ),
    ).toBeNull();
  });

  it("a zero movement is refused", async () => {
    expect(
      await adminError(
        `INSERT INTO "InventoryMovement" (id, "organisationId", "storeId", "inventoryItemId", "locationId", "quantityName", delta, "resultingValue", reason)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AVAILABLE', 0, 5, 'CORRECTION')`,
        [A.org, A1().store, A1().item, A1().location],
      ),
    ).toBe("23514");
  });
});

describe("partial unique indexes", () => {
  const insertProduct = (store: Catalogue, handle: string) =>
    adminError(
      `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "deletedAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'x', $3, NULL, now())`,
      [store.org, store.store, handle],
    );

  it("handles are unique per store among live products", async () => {
    // Every fixture store already has a live "linen-shirt": same handle, different stores.
    expect(await insertProduct(A1(), "linen-shirt")).toBe("23505");
    expect(await insertProduct(A1(), "another-shirt")).toBeNull();
  });

  it("a soft-deleted product frees its handle", async () => {
    await admin.query("BEGIN");
    try {
      await admin.query(`UPDATE "Product" SET "deletedAt" = now() WHERE id = $1`, [A1().product]);
      await admin.query(
        `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'x', 'linen-shirt', now())`,
        [A.org, A1().store],
      );
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("SKUs are unique per store among live variants", async () => {
    const insertVariant = (store: Catalogue, sku: string, signature: string) =>
      adminError(
        `INSERT INTO "ProductVariant" (id, "organisationId", "storeId", "productId", title, "optionSignature", sku, currency, "priceAmount", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'x', $4, $5, 'INR', 1, now())`,
        [store.org, store.store, store.product, signature, sku],
      );
    expect(await insertVariant(A1(), "SHIRT-M", "other")).toBe("23505");
    expect(await insertVariant(A2(), "SHIRT-M-2", "other")).toBeNull();
    expect(await insertVariant(A1(), "SHIRT-L", "other")).toBeNull();
  });

  it("location codes and collection handles are unique per store", async () => {
    expect(
      await adminError(
        `INSERT INTO "Location" (id, "organisationId", "storeId", name, code, "countryCode", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'Dup', 'MAIN', 'IN', now())`,
        [A.org, A1().store],
      ),
    ).toBe("23505");
    expect(
      await adminError(
        `INSERT INTO "Collection" (id, "organisationId", "storeId", title, handle, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'Dup', 'summer', now())`,
        [A.org, A1().store],
      ),
    ).toBe("23505");
  });
});

describe("grants (least privilege for storevia_app)", () => {
  const scope = () => ({ org: A.org, store: A1().store });

  it.each([
    ['DELETE FROM "Product"'],
    ['DELETE FROM "Collection"'],
    ['DELETE FROM "Location"'],
    ['DELETE FROM "MediaAsset"'],
    ['DELETE FROM "InventoryLevel"'],
    ['DELETE FROM "InventoryMovement"'],
    ['UPDATE "InventoryMovement" SET delta = 99'],
    ["UPDATE \"InventoryMovement\" SET note = 'rewritten'"],
  ])("%s is not permitted: archive, never delete; the ledger is append-only", async (sql) => {
    expect(await appError(scope(), sql)).toBe("42501");
  });

  it("the app role can still append to the ledger and change levels", async () => {
    await asApp(scope(), async (c) => {
      await c.query(
        `INSERT INTO "InventoryMovement" (id, "organisationId", "storeId", "inventoryItemId", "locationId", "quantityName", delta, "resultingValue", reason)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AVAILABLE', 1, 6, 'CORRECTION')`,
        [A.org, A1().store, A1().item, A1().location],
      );
      const updated = await c.query(
        'UPDATE "InventoryLevel" SET available = available + 1 WHERE "inventoryItemId" = $1',
        [A1().item],
      );
      expect(updated.rowCount).toBe(1);
    });
  });
});

describe("organisation-wide usage functions", () => {
  it("count across every store of the caller's organisation, even from a store scope", async () => {
    const counts = await asApp(
      { org: A.org, store: A1().store },
      async (c) =>
        (
          await c.query<{ products: string; bytes: string }>(
            "SELECT app_usage_live_products($1) AS products, app_usage_media_bytes($1) AS bytes",
            [A.org],
          )
        ).rows[0],
    );
    // Two stores, one live product and one 1000 + 100 byte image each.
    expect(counts).toEqual({ products: "2", bytes: "2200" });
  });

  it("refuse any organisation but the caller's", async () => {
    expect(await appError({ org: A.org }, "SELECT app_usage_live_products($1)", [B.org])).toBe(
      "42501",
    );
    expect(await appError({ org: A.org }, "SELECT app_usage_media_bytes($1)", [B.org])).toBe(
      "42501",
    );
    expect(await appError({}, "SELECT app_usage_live_products($1)", [A.org])).toBe("42501");
  });

  it("archived and deleted products are not counted", async () => {
    await admin.query("BEGIN");
    try {
      await admin.query(
        `UPDATE "Product" SET status = 'ARCHIVED', "archivedAt" = now() WHERE id = $1`,
        [A1().product],
      );
      const { rows } = await admin.query<{ n: string }>("SELECT app_usage_live_products($1) AS n", [
        A.org,
      ]);
      expect(rows[0]?.n).toBe("1");
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});

describe("search indexes", () => {
  // The store filter is omitted so the planner can't prefer the (tiny) store
  // index; the point is that the expressions match the indexes.
  it("full-text and trigram queries can use their indexes", async () => {
    await admin.query("BEGIN");
    try {
      await admin.query("SET LOCAL enable_seqscan = off");
      const plan = async (sql: string) =>
        (await admin.query<{ "QUERY PLAN": string }>(`EXPLAIN ${sql}`)).rows
          .map((r) => r["QUERY PLAN"])
          .join("\n");
      expect(
        await plan(
          `SELECT id FROM "Product" WHERE catalogue_search_document(title, handle, vendor, "productType", tags) @@ plainto_tsquery('simple', 'linen')`,
        ),
      ).toContain("Product_search");
      expect(await plan(`SELECT id FROM "Product" WHERE lower(title) LIKE '%inen%'`)).toContain(
        "Product_title_trgm",
      );
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});

/** Runs statements as the migrator in one rolled-back transaction; returns the last one's error code. */
async function adminSequence(
  steps: readonly (readonly [string, readonly unknown[]])[],
): Promise<string | null> {
  await admin.query("BEGIN");
  try {
    for (const [sql, params] of steps) await admin.query(sql, [...params]);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    await admin.query("ROLLBACK");
  }
}

describe("Milestone 3 security review regressions", () => {
  it("media references need live, ready media in the same store", async () => {
    const retire = [
      `UPDATE "MediaAsset" SET "deletedAt" = now(), status = 'DELETED' WHERE id = $1`,
      [A1().media],
    ] as const;
    const processing = [
      `UPDATE "MediaAsset" SET status = 'PROCESSING' WHERE id = $1`,
      [A1().media],
    ] as const;
    for (const state of [retire, processing]) {
      expect(
        await adminSequence([
          state,
          [
            'UPDATE "ProductVariant" SET "imageMediaId" = $1 WHERE id = $2',
            [A1().media, A1().variant],
          ],
        ]),
      ).toBe("23503");
      expect(
        await adminSequence([
          state,
          [
            'UPDATE "Collection" SET "imageMediaId" = $1 WHERE id = $2',
            [A1().media, A1().collection],
          ],
        ]),
      ).toBe("23503");
      expect(
        await adminSequence([
          state,
          [
            `INSERT INTO "ProductMedia" (id, "organisationId", "storeId", "productId", "mediaAssetId", position)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 9)`,
            [A.org, A1().store, A1().product, A1().media],
          ],
        ]),
      ).toBe("23503");
    }
  });

  it("a new reference holds the media, so a concurrent delete waits for it", async () => {
    const other = new pg.Client({ connectionString: process.env["DATABASE_MIGRATOR_URL"] });
    await other.connect();
    await admin.query("BEGIN");
    try {
      await admin.query('UPDATE "ProductVariant" SET "imageMediaId" = $1 WHERE id = $2', [
        A1().media,
        A1().variant,
      ]);
      // deleteMedia locks the asset FOR UPDATE before counting references.
      await other.query("BEGIN");
      const locked = await other
        .query('SELECT id FROM "MediaAsset" WHERE id = $1 FOR UPDATE NOWAIT', [A1().media])
        .then(() => null)
        .catch((error: unknown) => (error as { code?: string }).code ?? "unknown");
      await other.query("ROLLBACK");
      expect(locked).toBe("55P03");
    } finally {
      await admin.query("ROLLBACK");
      await other.end();
    }
  });

  it.each([
    [
      'UPDATE "ProductOption" SET "productId" = $1 WHERE id = $2',
      () => [A2().product, A1().option],
    ],
    [
      'UPDATE "ProductOptionValue" SET "optionId" = $1 WHERE id = $2',
      () => [A2().option, A1().value],
    ],
    ['UPDATE "InventoryItem" SET id = gen_random_uuid() WHERE id = $1', () => [A1().item]],
    ['UPDATE "Location" SET id = gen_random_uuid() WHERE id = $1', () => [A1().location]],
    ['UPDATE "MediaAsset" SET id = gen_random_uuid() WHERE id = $1', () => [A1().media]],
    ['UPDATE "Product" SET id = gen_random_uuid() WHERE id = $1', () => [A1().product]],
    ['UPDATE "ProductVariant" SET id = gen_random_uuid() WHERE id = $1', () => [A1().variant]],
  ] as const)("parents and ids never move: %s", async (sql, params) => {
    expect(await adminError(sql, [...params()])).toBe("23514");
  });

  it("storage keys and renditions follow the key grammar", async () => {
    const key = (suffix: string) => `${A.org}/${A1().store}/${A1().media}/${suffix}`;
    const set = (value: string) =>
      adminError('UPDATE "MediaAsset" SET "storageKey" = $1 WHERE id = $2', [value, A1().media]);
    expect(await set(key(`../../${B.org}/x/original.jpg`))).toBe("23514");
    expect(await set(key("upload"))).toBe("23514");
    expect(await set(key("original.png"))).toBeNull();
    expect(await set(`uploads/${A.org}/${A1().store}/${A1().media}`)).toBeNull();
    const renditions = (value: string) =>
      adminError('UPDATE "MediaAsset" SET renditions = $1::jsonb WHERE id = $2', [
        value,
        A1().media,
      ]);
    expect(await renditions('[{"key":"x","bytes":-1000}]')).toBe("23514");
    expect(await renditions('[{"key":"x","bytes":"abc"}]')).toBe("23514");
    expect(await renditions('[{"key":"x","bytes":1.5}]')).toBe("23514");
    expect(await renditions('[{"key":"x"}]')).toBe("23514");
    expect(await renditions('[{"key":"x","bytes":120}]')).toBeNull();
  });

  it("roles hold only what they use", async () => {
    const q = async (sql: string) => (await admin.query<{ ok: boolean }>(sql)).rows[0]?.ok;
    for (const fn of [
      "app_media_in_same_store()",
      "app_variant_option_same_product()",
      "app_variant_currency_matches_store()",
    ]) {
      expect(
        await q(`SELECT has_function_privilege('storevia_app', '${fn}', 'EXECUTE') AS ok`),
      ).toBe(false);
    }
    expect(
      await q(
        `SELECT has_column_privilege('storevia_platform', '"MediaAsset"', 'renditions', 'SELECT') AS ok`,
      ),
    ).toBe(false);
    expect(
      await q(
        `SELECT has_function_privilege('storevia_system', 'app_usage_media_bytes(uuid)', 'EXECUTE') AS ok`,
      ),
    ).toBe(false);
    expect(
      await q(
        `SELECT has_function_privilege('storevia_app', 'app_usage_media_bytes(uuid)', 'EXECUTE') AS ok`,
      ),
    ).toBe(true);
  });
});
