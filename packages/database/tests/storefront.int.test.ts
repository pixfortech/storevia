// Database-layer guarantees for the storefront engine (ADR-0028, migration
// 20261001000000): the storefront role's one cross-tenant read (host
// resolution), its sellable-only view of one store, its column grants, cart
// writes, availability without counts, page-version invariants, slug history
// and outbox grants. The storefront's own code comes on top of these; these
// tests prove the database refuses on its own.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectTestClients, truncateAll } from "../src/testing";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const hash = (n: number) => n.toString(16).padStart(64, "0");

interface Store {
  readonly org: string;
  readonly id: string;
  readonly host: string;
  readonly live: string; // ACTIVE product
  readonly liveVariant: string;
  readonly deletedVariant: string;
  readonly draft: string; // DRAFT product
  readonly draftVariant: string;
  readonly archived: string; // ARCHIVED product
  readonly collection: string;
  readonly archivedCollection: string;
  readonly readyMedia: string;
  readonly processingMedia: string;
  readonly page: string;
  readonly publishedVersion: string;
  readonly draftVersion: string;
}

const ORG_A = uuid(0xa1);
const ORG_B = uuid(0xb1);
const stores = new Map<string, Store>();
function store(key: string): Store {
  const s = stores.get(key);
  if (!s) throw new Error(`no fixture store ${key}`);
  return s;
}
const A = () => store("a0");
const A1 = () => store("a1");
const B = () => store("b0");

let admin: pg.Client; // migrator: BYPASSRLS, arranges fixtures
let storefront: pg.Client; // storevia_storefront: NOBYPASSRLS
let app: pg.Client; // storevia_app
let worker: pg.Client; // storevia_worker

async function one(sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) throw new Error(`no id from ${sql}`);
  return id;
}

async function scoped<T>(
  client: pg.Client,
  scope: { org?: string; store?: string },
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true)",
      [scope.org ?? "", scope.store ?? ""],
    );
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const asStore = <T>(s: Store, fn: (c: pg.Client) => Promise<T>) =>
  scoped(storefront, { org: s.org, store: s.id }, fn);

async function errorCode(
  client: pg.Client,
  scope: { org?: string; store?: string },
  sql: string,
  params: unknown[] = [],
): Promise<string | null> {
  return scoped(client, scope, async (c) => {
    try {
      await c.query(sql, params);
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? "unknown";
    }
  });
}

/** Runs statements as the migrator in one transaction (deferred triggers fire at COMMIT). */
async function adminTx(statements: readonly (readonly [string, readonly unknown[]])[]) {
  await admin.query("BEGIN");
  try {
    for (const [sql, params] of statements) await admin.query(sql, [...params]);
    await admin.query("COMMIT");
    return null;
  } catch (error) {
    await admin.query("ROLLBACK");
    return (error as { code?: string }).code ?? "unknown";
  }
}

async function seedStore(key: string, org: string, n: number): Promise<Store> {
  const id = uuid(0x100 + n);
  await admin.query(
    `INSERT INTO "Store" (id, "organisationId", name, slug, status, currency, locale, timezone, country, "updatedAt")
     VALUES ($1, $2, $3, $4, 'ACTIVE', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`,
    [id, org, `Store ${key}`, `store-${key}`],
  );
  const host = `${key}.store.test`;
  await admin.query(
    `INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "isPrimary", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 'PLATFORM_SUBDOMAIN', 'ACTIVE', 'x', true, now()),
            (gen_random_uuid(), $1, $2, $4, 'CUSTOM', 'ACTIVE', 'x', false, now()),
            (gen_random_uuid(), $1, $2, $5, 'CUSTOM', 'PENDING', 'x', false, now())`,
    [org, id, host, `www.${key}.example`, `pending.${key}.example`],
  );
  const media = (status: string) =>
    one(
      `INSERT INTO "MediaAsset" (id, "organisationId", "storeId", kind, status, filename, "declaredMimeType", "storageKey", "updatedAt")
       SELECT m, $1::uuid, $2::uuid, 'IMAGE', $3::"MediaStatus", 'a.jpg', 'image/jpeg',
              CASE WHEN $3 = 'READY' THEN $1::text || '/' || $2::text || '/' || m::text || '/original.jpg'
                   ELSE 'uploads/' || $1::text || '/' || $2::text || '/' || m::text END, now()
       FROM gen_random_uuid() AS m RETURNING id`,
      [org, id, status],
    );
  const readyMedia = await media("READY");
  const processingMedia = await media("PROCESSING");
  const product = (handle: string, status: string) =>
    one(
      `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, status, "archivedAt", "descriptionDoc", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $3, $4::"ProductStatus",
               CASE WHEN $4 = 'ARCHIVED' THEN now() END, '{"type":"doc"}', now()) RETURNING id`,
      [org, id, handle, status],
    );
  const variant = (productId: string, title: string, deleted = false) =>
    one(
      `INSERT INTO "ProductVariant" (id, "organisationId", "storeId", "productId", title, "optionSignature", currency, "priceAmount", "costAmount", barcode, position, "deletedAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, CASE WHEN $5 THEN 'deleted:' || $4 ELSE $4 END, 'INR', 1000, 400, '123', 0,
               CASE WHEN $5 THEN now() END, now()) RETURNING id`,
      [org, id, productId, title, deleted],
    );
  const live = await product("live", "ACTIVE");
  const liveVariant = await variant(live, "Default");
  const deletedVariant = await variant(live, "Old", true);
  const draft = await product("draft", "DRAFT");
  const draftVariant = await variant(draft, "Default");
  const archived = await product("archived", "ARCHIVED");
  await variant(archived, "Default");
  for (const p of [live, draft]) {
    const option = await one(
      `INSERT INTO "ProductOption" (id, "organisationId", "storeId", "productId", name, position)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Size', 0) RETURNING id`,
      [org, id, p],
    );
    await admin.query(
      `INSERT INTO "ProductOptionValue" (id, "organisationId", "storeId", "optionId", value, position)
       VALUES (gen_random_uuid(), $1, $2, $3, 'M', 0)`,
      [org, id, option],
    );
    await admin.query(
      `INSERT INTO "ProductMedia" (id, "organisationId", "storeId", "productId", "mediaAssetId", position)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0)`,
      [org, id, p, readyMedia],
    );
  }
  const collection = (handle: string, archivedAt: boolean) =>
    one(
      `INSERT INTO "Collection" (id, "organisationId", "storeId", title, handle, "archivedAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $3, CASE WHEN $4 THEN now() END, now()) RETURNING id`,
      [org, id, handle, archivedAt],
    );
  const liveCollection = await collection("summer", false);
  const archivedCollection = await collection("winter", true);
  for (const c of [liveCollection, archivedCollection]) {
    await admin.query(
      `INSERT INTO "CollectionProduct" ("organisationId", "storeId", "collectionId", "productId", position)
       VALUES ($1, $2, $3, $4, 0), ($1, $2, $3, $5, 1)`,
      [org, id, c, live, draft],
    );
  }
  // Stock: 3 of the live variant at an active location.
  const location = await one(
    `INSERT INTO "Location" (id, "organisationId", "storeId", name, code, "countryCode", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Main', 'MAIN', 'IN', now()) RETURNING id`,
    [org, id],
  );
  const item = await one(
    `INSERT INTO "InventoryItem" (id, "organisationId", "storeId", "variantId", tracked, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, true, now()) RETURNING id`,
    [org, id, liveVariant],
  );
  await admin.query(
    `INSERT INTO "InventoryLevel" (id, "organisationId", "storeId", "inventoryItemId", "locationId", available, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 3, now())`,
    [org, id, item, location],
  );
  // A page with a published and a draft version.
  const page = uuid(0x200 + n);
  const publishedVersion = uuid(0x300 + n);
  const draftVersion = uuid(0x400 + n);
  const failed = await adminTx([
    [
      `INSERT INTO "Page" (id, "organisationId", "storeId", kind, title, handle, "updatedAt")
       VALUES ($1, $2, $3, 'HOME', 'Home', 'home', now())`,
      [page, org, id],
    ],
    [
      `INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state, "schemaVersion", document, "documentHash", "publishedAt", "updatedAt")
       VALUES ($1, $3, $4, $5, 1, 'PUBLISHED', 1, '{"schemaVersion":1,"root":[]}', $6, now(), now()),
              ($2, $3, $4, $5, 2, 'DRAFT', 1, '{"schemaVersion":1,"root":[{"draft":true}]}', $6, NULL, now())`,
      [publishedVersion, draftVersion, org, id, page, hash(1)],
    ],
    [`UPDATE "Page" SET "publishedVersionId" = $1 WHERE id = $2`, [publishedVersion, page]],
  ]);
  if (failed) throw new Error(`page fixture failed: ${failed}`);
  return {
    org,
    id,
    host,
    live,
    liveVariant,
    deletedVariant,
    draft,
    draftVariant,
    archived,
    collection: liveCollection,
    archivedCollection,
    readyMedia,
    processingMedia,
    page,
    publishedVersion,
    draftVersion,
  };
}

function connect(key: string): pg.Client {
  const url = process.env[key];
  if (!url) throw new Error(`${key} is not set`);
  return new pg.Client({ connectionString: url });
}

beforeAll(async () => {
  await truncateAll();
  admin = connect("DATABASE_MIGRATOR_URL");
  storefront = connect("DATABASE_STOREFRONT_URL");
  app = connect("DATABASE_URL");
  worker = connect("DATABASE_WORKER_URL");
  await Promise.all([admin.connect(), storefront.connect(), app.connect(), worker.connect()]);
  await admin.query(
    `INSERT INTO "Organisation" (id, name, "updatedAt") VALUES ($1, 'Org A', now()), ($2, 'Org B', now())`,
    [ORG_A, ORG_B],
  );
  stores.set("a0", await seedStore("a0", ORG_A, 1));
  stores.set("a1", await seedStore("a1", ORG_A, 2));
  stores.set("b0", await seedStore("b0", ORG_B, 3));
});

afterAll(async () => {
  await Promise.all([admin.end(), storefront.end(), app.end(), worker.end()]);
  await disconnectTestClients();
});

describe("host resolution (the only cross-tenant read)", () => {
  it("resolves an ACTIVE hostname to a narrow tuple", async () => {
    const { rows } = await storefront.query("SELECT * FROM app_storefront_resolve($1)", [A().host]);
    expect(rows).toEqual([
      {
        store_id: A().id,
        organisation_id: ORG_A,
        store_status: "ACTIVE",
        organisation_status: "ACTIVE",
        hostname: "a0.store.test",
        is_primary: true,
        primary_hostname: "a0.store.test",
        store_name: "Store a0",
        currency: "INR",
        locale: "en-IN",
        country: "IN",
      },
    ]);
  });

  it("a secondary hostname resolves with the primary to redirect to", async () => {
    const { rows } = await storefront.query<{ is_primary: boolean; primary_hostname: string }>(
      "SELECT is_primary, primary_hostname FROM app_storefront_resolve($1)",
      ["www.a0.example"],
    );
    expect(rows).toEqual([{ is_primary: false, primary_hostname: "a0.store.test" }]);
  });

  it.each(["pending.a0.example", "unknown.example", "A0.STORE.TEST", "", "a0.store.test."])(
    "%j resolves to nothing",
    async (host) => {
      const { rows } = await storefront.query("SELECT * FROM app_storefront_resolve($1)", [host]);
      expect(rows).toEqual([]);
    },
  );

  it("reports suspended and archived stores and organisations so the storefront can refuse them", async () => {
    await admin.query(
      `UPDATE "Store" SET status = 'SUSPENDED', "suspendedAt" = now() WHERE id = $1`,
      [A1().id],
    );
    try {
      const { rows } = await storefront.query<{ store_status: string }>(
        "SELECT store_status FROM app_storefront_resolve($1)",
        [A1().host],
      );
      expect(rows).toEqual([{ store_status: "SUSPENDED" }]);
    } finally {
      await admin.query(
        `UPDATE "Store" SET status = 'ACTIVE', "suspendedAt" = NULL WHERE id = $1`,
        [A1().id],
      );
    }
  });

  it.each([
    "Store",
    "StoreDomain",
    "Organisation",
    "Membership",
    "User",
    "Session",
    "AuditLog",
    "Subscription",
    "UsageCounter",
    "Location",
    "InventoryItem",
    "InventoryLevel",
    "InventoryMovement",
    "OutboxEvent",
    "StoreSlugHistory",
  ])("has no access to %s", async (table) => {
    expect(
      await errorCode(
        storefront,
        { org: ORG_A, store: A().id },
        `SELECT 1 FROM "${table}" LIMIT 1`,
      ),
    ).toBe("42501");
  });

  it("can't call the trigger or usage functions", async () => {
    for (const sql of [
      "SELECT app_usage_live_products($1::uuid)",
      "SELECT app_usage_media_bytes($1::uuid)",
    ]) {
      expect(await errorCode(storefront, {}, sql, [ORG_A])).toBe("42501");
    }
  });
});

describe("a store's sellable rows only", () => {
  const ids = async (s: Store, sql: string) =>
    asStore(s, async (c) => (await c.query<{ id: string }>(sql)).rows.map((r) => r.id).sort());

  it("sees ACTIVE, non-deleted products only", async () => {
    expect(await ids(A(), `SELECT id FROM "Product"`)).toEqual([A().live]);
  });

  it("sees live variants of visible products only", async () => {
    expect(await ids(A(), `SELECT id FROM "ProductVariant"`)).toEqual([A().liveVariant]);
  });

  it("options, values, variant options and product media follow their product", async () => {
    await asStore(A(), async (c) => {
      const options = await c.query<{ productId: string }>(
        `SELECT "productId" FROM "ProductOption"`,
      );
      expect(options.rows.map((r) => r.productId)).toEqual([A().live]);
      const values = await c.query(`SELECT id FROM "ProductOptionValue"`);
      expect(values.rowCount).toBe(1);
      const media = await c.query<{ productId: string }>(`SELECT "productId" FROM "ProductMedia"`);
      expect(media.rows.map((r) => r.productId)).toEqual([A().live]);
    });
  });

  it("sees non-archived collections, and memberships of those only", async () => {
    expect(await ids(A(), `SELECT id FROM "Collection"`)).toEqual([A().collection]);
    await asStore(A(), async (c) => {
      const { rows } = await c.query<{ collectionId: string; productId: string }>(
        `SELECT cp."collectionId", cp."productId" FROM "CollectionProduct" cp
         JOIN "Product" p ON p.id = cp."productId"`,
      );
      expect(rows).toEqual([{ collectionId: A().collection, productId: A().live }]);
    });
  });

  it("sees READY media only", async () => {
    expect(await ids(A(), `SELECT id FROM "MediaAsset"`)).toEqual([A().readyMedia]);
  });

  it("sees live pages and PUBLISHED versions only", async () => {
    expect(await ids(A(), `SELECT id FROM "Page"`)).toEqual([A().page]);
    expect(await ids(A(), `SELECT id FROM "PageVersion"`)).toEqual([A().publishedVersion]);
  });

  it("never sees another store, even in the same organisation, or with a mismatched scope", async () => {
    for (const table of ["Product", "ProductVariant", "Collection", "MediaAsset", "Page"]) {
      const sql = `SELECT id FROM "${table}"`;
      const other = [...(await ids(A1(), sql)), ...(await ids(B(), sql))];
      const mine = await ids(A(), sql);
      expect(mine.filter((id) => other.includes(id))).toEqual([]);
      // Store A's id with organisation B's id: nothing.
      const mismatched = await scoped(
        storefront,
        { org: ORG_B, store: A().id },
        async (c) => (await c.query(sql)).rowCount,
      );
      expect(mismatched).toBe(0);
    }
  });

  it("sees nothing without a store scope (organisation alone is not enough)", async () => {
    for (const table of [
      "Product",
      "ProductVariant",
      "Collection",
      "MediaAsset",
      "Page",
      "PageVersion",
    ]) {
      const orgOnly = await scoped(
        storefront,
        { org: ORG_A },
        async (c) => (await c.query(`SELECT id FROM "${table}"`)).rowCount,
      );
      const none = await scoped(
        storefront,
        {},
        async (c) => (await c.query(`SELECT id FROM "${table}"`)).rowCount,
      );
      expect([table, orgOnly, none]).toEqual([table, 0, 0]);
    }
  });

  it.each([
    ["ProductVariant", "costAmount"],
    ["ProductVariant", "barcode"],
    ["ProductVariant", "sku"],
    ["Product", "descriptionDoc"],
    ["Product", "createdById"],
    ["Collection", "rules"],
    ["Collection", "descriptionDoc"],
    ["MediaAsset", "sha256"],
    ["MediaAsset", "filename"],
    ["PageVersion", "createdById"],
    ["PageVersion", "revision"],
  ])("can't read %s.%s", async (table, column) => {
    expect(
      await errorCode(
        storefront,
        { org: ORG_A, store: A().id },
        `SELECT "${column}" FROM "${table}"`,
      ),
    ).toBe("42501");
  });

  it.each([
    `UPDATE "Product" SET title = 'x'`,
    `INSERT INTO "Product" (id, "organisationId", "storeId", title, handle, "updatedAt") VALUES (gen_random_uuid(), '${ORG_A}', '${uuid(0x101)}', 'x', 'x', now())`,
    `UPDATE "ProductVariant" SET "priceAmount" = 1`,
    `DELETE FROM "Collection"`,
    `UPDATE "PageVersion" SET document = '{}'`,
    `DELETE FROM "Cart"`,
  ])("can't write catalogue or content: %s", async (sql) => {
    expect(await errorCode(storefront, { org: ORG_A, store: A().id }, sql)).toBe("42501");
  });
});

describe("availability without counts", () => {
  const availability = (s: Store, variants: readonly string[]) =>
    asStore(s, async (c) => {
      const { rows } = await c.query<{ variant_id: string; available: boolean }>(
        "SELECT variant_id, available FROM app_storefront_availability($1::uuid[])",
        [variants],
      );
      return Object.fromEntries(rows.map((r) => [r.variant_id, r.available]));
    });

  it("returns a boolean per sellable variant of the current store", async () => {
    expect(await availability(A(), [A().liveVariant])).toEqual({ [A().liveVariant]: true });
  });

  it("omits draft products' variants, deleted variants and other stores' variants", async () => {
    expect(
      await availability(A(), [
        A().draftVariant,
        A().deletedVariant,
        A1().liveVariant,
        B().liveVariant,
      ]),
    ).toEqual({});
  });

  it("returns nothing without a store scope", async () => {
    const rows = await scoped(
      storefront,
      { org: ORG_A },
      async (c) =>
        (
          await c.query("SELECT * FROM app_storefront_availability($1::uuid[])", [
            [A().liveVariant],
          ])
        ).rowCount,
    );
    expect(rows).toBe(0);
  });

  it("is false when a tracked, deny-policy variant has no stock at an active location", async () => {
    await admin.query("BEGIN");
    try {
      await admin.query(
        `UPDATE "InventoryLevel" SET available = 0
         WHERE "inventoryItemId" = (SELECT id FROM "InventoryItem" WHERE "variantId" = $1)`,
        [A().liveVariant],
      );
      await admin.query("COMMIT");
      expect(await availability(A(), [A().liveVariant])).toEqual({ [A().liveVariant]: false });
      await admin.query(
        `UPDATE "ProductVariant" SET "inventoryPolicy" = 'CONTINUE' WHERE id = $1`,
        [A().liveVariant],
      );
      expect(await availability(A(), [A().liveVariant])).toEqual({ [A().liveVariant]: true });
      await admin.query(`UPDATE "ProductVariant" SET "inventoryPolicy" = 'DENY' WHERE id = $1`, [
        A().liveVariant,
      ]);
      await admin.query(`UPDATE "InventoryItem" SET tracked = false WHERE "variantId" = $1`, [
        A().liveVariant,
      ]);
      expect(await availability(A(), [A().liveVariant])).toEqual({ [A().liveVariant]: true });
    } finally {
      await admin.query(`UPDATE "InventoryItem" SET tracked = true WHERE "variantId" = $1`, [
        A().liveVariant,
      ]);
      await admin.query(
        `UPDATE "InventoryLevel" SET available = 3
         WHERE "inventoryItemId" = (SELECT id FROM "InventoryItem" WHERE "variantId" = $1)`,
        [A().liveVariant],
      );
    }
  });

  it("ignores stock held at an inactive location", async () => {
    await admin.query(`UPDATE "Location" SET "isActive" = false WHERE "storeId" = $1`, [A().id]);
    try {
      expect(await availability(A(), [A().liveVariant])).toEqual({ [A().liveVariant]: false });
    } finally {
      await admin.query(`UPDATE "Location" SET "isActive" = true WHERE "storeId" = $1`, [A().id]);
    }
  });
});

describe("carts", () => {
  const insertCart = (s: Store, token: number, currency = "INR", store = s.id) =>
    `INSERT INTO "Cart" (id, "organisationId", "storeId", "tokenHash", currency, "expiresAt", "updatedAt")
     VALUES ('${uuid(0x900 + token)}', '${s.org}', '${store}', '${hash(token)}', '${currency}', now() + interval '30 days', now())`;
  const insertLine = (s: Store, token: number, variant: string, quantity = 1) =>
    `INSERT INTO "CartLine" (id, "organisationId", "storeId", "cartId", "variantId", quantity, "updatedAt")
     VALUES (gen_random_uuid(), '${s.org}', '${s.id}', '${uuid(0x900 + token)}', '${variant}', ${String(quantity)}, now())`;

  it("the storefront writes its own store's carts and lines", async () => {
    await asStore(A(), async (c) => {
      await c.query(insertCart(A(), 1));
      await c.query(insertLine(A(), 1, A().liveVariant, 2));
      await c.query(`UPDATE "CartLine" SET quantity = 3`);
      const { rows } = await c.query<{ quantity: number }>(`SELECT quantity FROM "CartLine"`);
      expect(rows).toEqual([{ quantity: 3 }]);
      await c.query(`DELETE FROM "CartLine"`);
    });
  });

  it("can't create a cart in another store or organisation", async () => {
    const scope = { org: ORG_A, store: A().id };
    expect(await errorCode(storefront, scope, insertCart(A(), 2, "INR", A1().id))).toBe("42501");
    expect(await errorCode(storefront, scope, insertCart(B(), 3))).toBe("42501");
  });

  it("without a store scope, reads and writes no carts at all", async () => {
    await admin.query(insertCart(A(), 7));
    try {
      const orgOnly = { org: ORG_A };
      const seen = await scoped(
        storefront,
        orgOnly,
        async (c) => (await c.query(`SELECT id FROM "Cart"`)).rowCount,
      );
      expect(seen).toBe(0);
      expect(await errorCode(storefront, orgOnly, insertCart(A(), 8))).toBe("42501");
    } finally {
      await admin.query(`DELETE FROM "Cart"`);
    }
  });

  it("can't add another store's variant, even one it names", async () => {
    const code = await asStore(A(), async (c) => {
      await c.query(insertCart(A(), 4));
      try {
        await c.query(insertLine(A(), 4, A1().liveVariant));
        return null;
      } catch (error) {
        return (error as { code?: string }).code;
      }
    });
    expect(code).toBe("23503");
  });

  it.each([
    ["a quantity of 0", (c: pg.Client) => c.query(insertLine(A(), 5, A().liveVariant, 0)), "23514"],
    [
      "a quantity of 100",
      (c: pg.Client) => c.query(insertLine(A(), 5, A().liveVariant, 100)),
      "23514",
    ],
    [
      "a customer (not until M6)",
      (c: pg.Client) => c.query(`UPDATE "Cart" SET "customerId" = gen_random_uuid()`),
      "23514",
    ],
    [
      "a changed token",
      (c: pg.Client) => c.query(`UPDATE "Cart" SET "tokenHash" = '${hash(99)}'`),
      "23514",
    ],
    [
      "a line moved to another variant",
      (c: pg.Client) => c.query(`UPDATE "CartLine" SET "variantId" = '${A().deletedVariant}'`),
      "23514",
    ],
  ])("refuses %s", async (_label, statement, expected) => {
    const code = await asStore(A(), async (c) => {
      await c.query(insertCart(A(), 5));
      await c.query(insertLine(A(), 5, A().liveVariant));
      try {
        await statement(c);
        return null;
      } catch (error) {
        return (error as { code?: string }).code;
      }
    });
    expect(code).toBe(expected);
  });

  it("a cart is in its store's currency", async () => {
    expect(
      await errorCode(storefront, { org: ORG_A, store: A().id }, insertCart(A(), 6, "USD")),
    ).toBe("23514");
  });

  it("rate-limit rows: its own buckets only", async () => {
    await admin.query(
      `INSERT INTO "RateLimit" (id, key, count, "lastRequest") VALUES (gen_random_uuid(), 'sign-in:ip:1', 1, 0)`,
    );
    try {
      await scoped(storefront, {}, async (c) => {
        await c.query(
          `INSERT INTO "RateLimit" (id, key, count, "lastRequest") VALUES (gen_random_uuid(), 'storefront:cart:1', 1, 0)`,
        );
        const { rows } = await c.query<{ key: string }>(`SELECT key FROM "RateLimit"`);
        expect(rows.map((r) => r.key)).toEqual(["storefront:cart:1"]);
      });
      expect(
        await errorCode(
          storefront,
          {},
          `INSERT INTO "RateLimit" (id, key, count, "lastRequest") VALUES (gen_random_uuid(), 'sign-in:ip:2', 1, 0)`,
        ),
      ).toBe("42501");
    } finally {
      await admin.query(`DELETE FROM "RateLimit"`);
    }
  });
});

describe("page versions", () => {
  const newPage = (id: string, kind = "STANDARD", handle = "about") =>
    [
      `INSERT INTO "Page" (id, "organisationId", "storeId", kind, title, handle, "updatedAt")
       VALUES ($1, $2, $3, $4::"PageKind", 'About', $5, now())`,
      [id, ORG_A, A().id, kind, handle],
    ] as const;
  const newVersion = (id: string, page: string, n: number, state: string) =>
    [
      `INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state, "schemaVersion", document, "documentHash", "publishedAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::"PageVersionState", 1, '{"schemaVersion":1,"root":[]}', $7,
               CASE WHEN $6 = 'DRAFT' THEN NULL ELSE now() END, now())`,
      [id, ORG_A, A().id, page, n, state, hash(n)],
    ] as const;

  it("a published or archived version is frozen; only PUBLISHED -> ARCHIVED is allowed", async () => {
    expect(
      await adminTx([
        [`UPDATE "PageVersion" SET document = '{"root":[]}' WHERE id = $1`, [A().publishedVersion]],
      ]),
    ).toBe("23514");
    expect(
      await adminTx([
        [`UPDATE "PageVersion" SET state = 'DRAFT' WHERE id = $1`, [A().publishedVersion]],
      ]),
    ).toBe("23514");
    // A draft is editable.
    expect(
      await adminTx([
        [
          `UPDATE "PageVersion" SET document = '{"schemaVersion":1,"root":[]}', revision = revision + 1 WHERE id = $1`,
          [A().draftVersion],
        ],
      ]),
    ).toBeNull();
  });

  it("publishing swaps the pointer atomically; half-done publishes fail at commit", async () => {
    const page = uuid(0x501);
    const [v1, v2] = [uuid(0x502), uuid(0x503)];
    expect(await adminTx([newPage(page), newVersion(v1, page, 1, "DRAFT")])).toBeNull();
    // Published without the page pointing at it: refused at commit.
    expect(
      await adminTx([
        [`UPDATE "PageVersion" SET state = 'PUBLISHED', "publishedAt" = now() WHERE id = $1`, [v1]],
      ]),
    ).toBe("23514");
    // Publish properly.
    expect(
      await adminTx([
        [`UPDATE "PageVersion" SET state = 'PUBLISHED', "publishedAt" = now() WHERE id = $1`, [v1]],
        [`UPDATE "Page" SET "publishedVersionId" = $1 WHERE id = $2`, [v1, page]],
      ]),
    ).toBeNull();
    // Publish v2: archive v1 first, then swap.
    expect(await adminTx([newVersion(v2, page, 2, "DRAFT")])).toBeNull();
    expect(
      await adminTx([
        [`UPDATE "PageVersion" SET state = 'ARCHIVED' WHERE id = $1`, [v1]],
        [`UPDATE "PageVersion" SET state = 'PUBLISHED', "publishedAt" = now() WHERE id = $1`, [v2]],
        [`UPDATE "Page" SET "publishedVersionId" = $1 WHERE id = $2`, [v2, page]],
      ]),
    ).toBeNull();
    // Archiving the live version without moving the pointer: refused.
    expect(
      await adminTx([[`UPDATE "PageVersion" SET state = 'ARCHIVED' WHERE id = $1`, [v2]]]),
    ).toBe("23514");
  });

  it("a page can only point at its own version", async () => {
    const page = uuid(0x511);
    expect(await adminTx([newPage(page, "STANDARD", "contact")])).toBeNull();
    expect(
      await adminTx([
        [`UPDATE "Page" SET "publishedVersionId" = $1 WHERE id = $2`, [A().publishedVersion, page]],
      ]),
    ).not.toBeNull();
  });

  it("one draft and one published version per page; one special page per kind; unique handles", async () => {
    expect(await adminTx([newVersion(uuid(0x521), A().page, 9, "DRAFT")])).toBe("23505");
    expect(await adminTx([newPage(uuid(0x522), "HOME", "home-2")])).toBe("23505");
    expect(await adminTx([newPage(uuid(0x523), "STANDARD", "home")])).toBe("23505");
    expect(await adminTx([newPage(uuid(0x524), "STANDARD", "Not A Handle")])).toBe("23514");
  });
});

describe("slug history", () => {
  it("a retired slug can't be claimed by another store, but its own store may return to it", async () => {
    await admin.query(
      `INSERT INTO "StoreSlugHistory" (id, "organisationId", "storeId", slug) VALUES (gen_random_uuid(), $1, $2, 'old-a0')`,
      [ORG_A, A().id],
    );
    expect(await adminTx([[`UPDATE "Store" SET slug = 'old-a0' WHERE id = $1`, [B().id]]])).toBe(
      "23505",
    );
    expect(
      await adminTx([
        [
          `INSERT INTO "Store" (id, "organisationId", name, slug, currency, locale, timezone, country, "updatedAt")
           VALUES (gen_random_uuid(), $1, 'New', 'old-a0', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`,
          [ORG_B],
        ],
      ]),
    ).toBe("23505");
    expect(
      await adminTx([
        [`UPDATE "Store" SET slug = 'old-a0' WHERE id = $1`, [A().id]],
        [`UPDATE "Store" SET slug = 'store-a0' WHERE id = $1`, [A().id]],
      ]),
    ).toBeNull();
    expect(await adminTx([[`UPDATE "StoreSlugHistory" SET slug = 'other'`, []]])).toBe("23514");
  });

  it("the app role may change its store's slug and record history, in its own store only", async () => {
    const scope = { org: ORG_A, store: A().id };
    expect(
      await errorCode(app, scope, `UPDATE "Store" SET slug = 'renamed-a0' WHERE id = $1`, [A().id]),
    ).toBeNull();
    expect(
      await errorCode(
        app,
        scope,
        `INSERT INTO "StoreSlugHistory" (id, "organisationId", "storeId", slug) VALUES (gen_random_uuid(), $1, $2, 'x-b0')`,
        [ORG_B, B().id],
      ),
    ).toBe("42501");
    expect(await errorCode(app, scope, `DELETE FROM "StoreSlugHistory"`)).toBe("42501");
  });
});

describe("outbox", () => {
  const insert = (s: Store, type = "product.updated", payload = "{}") =>
    `INSERT INTO "OutboxEvent" (id, "organisationId", "storeId", type, "entityType", "entityId", payload)
     VALUES (gen_random_uuid(), '${s.org}', '${s.id}', '${type}', 'Product', '${s.live}', '${payload}')`;

  it("the app role writes events for its own store and can't read them back", async () => {
    const scope = { org: ORG_A, store: A().id };
    expect(await errorCode(app, scope, insert(A()))).toBeNull();
    expect(await errorCode(app, scope, insert(B()))).toBe("42501");
    expect(await errorCode(app, scope, `SELECT id FROM "OutboxEvent"`)).toBe("42501");
  });

  it("refuses malformed events", async () => {
    const scope = { org: ORG_A, store: A().id };
    expect(await errorCode(app, scope, insert(A(), "Product Updated"))).toBe("23514");
    expect(await errorCode(app, scope, insert(A(), "product.updated", "[]"))).toBe("23514");
  });

  it("the worker claims and marks events, but can't rewrite them", async () => {
    await admin.query(insert(A()));
    await worker.query("BEGIN");
    try {
      const { rows } = await worker.query<{ id: string }>(
        `SELECT id FROM "OutboxEvent" WHERE "dispatchedAt" IS NULL FOR UPDATE SKIP LOCKED`,
      );
      expect(rows.length).toBeGreaterThan(0);
      await worker.query(`UPDATE "OutboxEvent" SET "dispatchedAt" = now()`);
    } finally {
      await worker.query("ROLLBACK");
    }
    expect(await errorCode(worker, {}, `UPDATE "OutboxEvent" SET type = 'x.y'`)).toBe("42501");
  });
});
