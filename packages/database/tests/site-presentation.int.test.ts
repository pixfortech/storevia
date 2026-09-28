// Database-layer guarantees for site presentation (ADR-0030, migration
// 20261101000000): every store has a published HOME page (backfill and
// trigger, idempotent); the storefront role sees drafts only in a preview
// and draft theme settings only through the preview-aware function; theme
// and menu rows are store-scoped for every role and bounded by
// constraints; the merchant role gets exactly the columns its services
// write; published theme and menu changes emit invalidation events.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectTestClients, truncateAll } from "../src/testing";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const ORG_A = uuid(0xa1);
const ORG_B = uuid(0xb1);
const STORE_A = uuid(0x101);
const STORE_A2 = uuid(0x102);
const STORE_B = uuid(0x103);
const SETTINGS = { preset: "editorial", colors: { primary: "#1c1917" } };

let admin: pg.Client; // migrator: arranges fixtures
let storefront: pg.Client; // storevia_storefront
let app: pg.Client; // storevia_app

function connect(key: string): pg.Client {
  const url = process.env[key];
  if (!url) throw new Error(`${key} is not set`);
  return new pg.Client({ connectionString: url });
}

async function scoped<T>(
  client: pg.Client,
  scope: { org?: string; store?: string; preview?: boolean },
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true),
              set_config('app.preview', $3, true)`,
      [scope.org ?? "", scope.store ?? "", scope.preview ? "on" : ""],
    );
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function code(
  client: pg.Client,
  scope: { org?: string; store?: string; preview?: boolean },
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

const rows = async <T extends pg.QueryResultRow>(
  client: pg.Client,
  scope: { org?: string; store?: string; preview?: boolean },
  sql: string,
  params: unknown[] = [],
) => scoped(client, scope, async (c) => (await c.query<T>(sql, params)).rows);

async function insertStore(id: string, org: string, slug: string, type = "ECOMMERCE") {
  await admin.query(
    `INSERT INTO "Store" (id, "organisationId", name, slug, status, "businessType", currency, locale, timezone, country, "updatedAt")
     VALUES ($1, $2, $3, $3, 'ACTIVE', $4::"BusinessType", 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`,
    [id, org, slug, type],
  );
}

const homeOf = async (store: string) =>
  (
    await admin.query<{ id: string; published: string | null; document: unknown; hash: string }>(
      `SELECT p.id, p."publishedVersionId" AS published, v.document, v."documentHash" AS hash
       FROM "Page" p LEFT JOIN "PageVersion" v ON v.id = p."publishedVersionId"
       WHERE p."storeId" = $1 AND p.kind = 'HOME' AND p."deletedAt" IS NULL`,
      [store],
    )
  ).rows;

beforeAll(async () => {
  await truncateAll();
  admin = connect("DATABASE_MIGRATOR_URL");
  storefront = connect("DATABASE_STOREFRONT_URL");
  app = connect("DATABASE_URL");
  await Promise.all([admin.connect(), storefront.connect(), app.connect()]);
  await admin.query(
    `INSERT INTO "Organisation" (id, name, "updatedAt") VALUES ($1, 'Org A', now()), ($2, 'Org B', now())`,
    [ORG_A, ORG_B],
  );
  await insertStore(STORE_A, ORG_A, "shop-a");
  await insertStore(STORE_A2, ORG_A, "studio-a2", "PORTFOLIO");
  await insertStore(STORE_B, ORG_B, "shop-b");
});

afterAll(async () => {
  await Promise.all([admin.end(), storefront.end(), app.end()]);
  await disconnectTestClients();
});

describe("HOME pages", () => {
  it("every new store gets exactly one published HOME page, by business type", async () => {
    const [shop] = await homeOf(STORE_A);
    const [studio] = await homeOf(STORE_A2);
    expect(shop?.published).not.toBeNull();
    expect(JSON.stringify(shop?.document)).toContain('"collection-list"');
    expect(JSON.stringify(studio?.document)).not.toMatch(
      /collection-list|featured-products|search/,
    );
    expect(shop?.hash).toMatch(/^[0-9a-f]{64}$/);
    const { rows: hashes } = await admin.query<{ ok: boolean }>(
      `SELECT v."documentHash" = encode(sha256(convert_to(v.document::text, 'UTF8')), 'hex') AS ok
       FROM "PageVersion" v WHERE v."storeId" = $1`,
      [STORE_A],
    );
    expect(hashes).toEqual([{ ok: true }]);
  });

  it("the backfill is idempotent and keeps a HOME page a store already has", async () => {
    const before = await homeOf(STORE_A);
    await admin.query("SELECT app_ensure_home_page($1)", [STORE_A]);
    await admin.query("SELECT app_ensure_home_page($1)", [STORE_A]);
    await admin.query("SELECT app_ensure_home_page($1)", [uuid(0xdead)]);
    expect(await homeOf(STORE_A)).toEqual(before);
    const { rows: counts } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Page" WHERE kind = 'HOME' GROUP BY "storeId"`,
    );
    expect(counts).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }]);
  });

  it("is not callable by the application roles", async () => {
    for (const client of [app, storefront]) {
      expect(
        await code(client, { org: ORG_A, store: STORE_A }, "SELECT app_ensure_home_page($1)", [
          STORE_A,
        ]),
      ).toBe("42501");
    }
  });
});

describe("drafts are visible to the storefront only in a preview", () => {
  let draft = "";
  beforeAll(async () => {
    const [home] = await homeOf(STORE_A);
    const { rows: inserted } = await admin.query<{ id: string }>(
      `INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state, "schemaVersion", document, "documentHash", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 2, 'DRAFT', 1, '{"schemaVersion":1,"root":[]}', $4, now()) RETURNING id`,
      [ORG_A, STORE_A, home?.id, "b".repeat(64)],
    );
    draft = inserted[0]?.id ?? "";
  });

  const versionIds = (scope: { org?: string; store?: string; preview?: boolean }) =>
    rows<{ id: string }>(storefront, scope, `SELECT id FROM "PageVersion"`).then((r) =>
      r.map((x) => x.id),
    );

  it("without a preview, drafts don't exist", async () => {
    expect(await versionIds({ org: ORG_A, store: STORE_A })).not.toContain(draft);
  });

  it("with a preview, the store's own drafts appear", async () => {
    expect(await versionIds({ org: ORG_A, store: STORE_A, preview: true })).toContain(draft);
  });

  it("a preview for another store, or without a store, shows nothing of this one", async () => {
    expect(await versionIds({ org: ORG_A, store: STORE_A2, preview: true })).not.toContain(draft);
    expect(await versionIds({ org: ORG_B, store: STORE_B, preview: true })).not.toContain(draft);
    expect(await versionIds({ org: ORG_A, store: STORE_B, preview: true })).toEqual([]);
    expect(await versionIds({ org: ORG_A, preview: true })).toEqual([]);
  });

  it("only exactly 'on' opens a preview", async () => {
    for (const value of ["true", "1", "ON", " on"]) {
      const seen = await scoped(storefront, { org: ORG_A, store: STORE_A }, async (c) => {
        await c.query("SELECT set_config('app.preview', $1, true)", [value]);
        return (await c.query<{ id: string }>(`SELECT id FROM "PageVersion"`)).rows.map(
          (r) => r.id,
        );
      });
      expect(seen, value).not.toContain(draft);
    }
  });
});

describe("store themes", () => {
  beforeAll(async () => {
    for (const [store, org] of [
      [STORE_A, ORG_A],
      [STORE_A2, ORG_A],
      [STORE_B, ORG_B],
    ] as const) {
      await admin.query(
        `INSERT INTO "StoreTheme" (id, "organisationId", "storeId", "themeKey", name, role, "draftSettings", "publishedSettings", "publishedAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'storevia', 'Storevia', 'LIVE', $3, $4, now(), now())`,
        [org, store, { ...SETTINGS, draft: store }, { ...SETTINGS, published: store }],
      );
    }
  });

  it("the storefront gets published settings, or draft ones in a preview, of its own store", async () => {
    const settings = (scope: { org: string; store: string; preview?: boolean }) =>
      rows<{ settings: Record<string, unknown> }>(
        storefront,
        scope,
        "SELECT settings FROM app_storefront_theme_settings()",
      );
    expect(await settings({ org: ORG_A, store: STORE_A })).toEqual([
      { settings: { ...SETTINGS, published: STORE_A } },
    ]);
    expect(await settings({ org: ORG_A, store: STORE_A, preview: true })).toEqual([
      { settings: { ...SETTINGS, draft: STORE_A } },
    ]);
    // Another store of the same organisation gets its own settings, never these.
    expect(await settings({ org: ORG_A, store: STORE_A2 })).toEqual([
      { settings: { ...SETTINGS, published: STORE_A2 } },
    ]);
    expect(await settings({ org: ORG_B, store: uuid(0x199) })).toEqual([]);
  });

  it("the storefront can't read draft settings directly", async () => {
    expect(
      await code(
        storefront,
        { org: ORG_A, store: STORE_A, preview: true },
        `SELECT "draftSettings" FROM "StoreTheme"`,
      ),
    ).toBe("42501");
    expect(
      await rows(
        storefront,
        { org: ORG_A, store: STORE_A },
        `SELECT id, "publishedSettings" FROM "StoreTheme"`,
      ),
    ).toHaveLength(1);
  });

  it("allows one LIVE theme per store and bounded, object-shaped settings", async () => {
    const insert = (
      store: string,
      org: string,
      extra: { role?: string; draft?: unknown; key?: string },
    ) =>
      code(
        admin,
        {},
        `INSERT INTO "StoreTheme" (id, "organisationId", "storeId", "themeKey", name, role, "draftSettings", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'x', $4::"StoreThemeRole", $5, now())`,
        [
          org,
          store,
          extra.key ?? "storevia",
          extra.role ?? "UNPUBLISHED",
          JSON.stringify(extra.draft ?? {}),
        ],
      );
    expect(await insert(STORE_A, ORG_A, { role: "LIVE" })).toBe("23505");
    // Each theme is installed once per store (M7); other themes install beside the live one.
    expect(await insert(STORE_A, ORG_A, {})).toBe("23505");
    expect(await insert(STORE_A, ORG_A, { key: "boutique" })).toBeNull();
    expect(await insert(STORE_A2, ORG_A, { key: "boutique" })).toBeNull();
    expect(await insert(STORE_A, ORG_A, { draft: [] })).toBe("23514");
    expect(await insert(STORE_A, ORG_A, { draft: { css: "x".repeat(17_000) } })).toBe("23514");
    expect(await insert(STORE_A, ORG_A, { key: "Bad Key" })).toBe("23514");
    // A published theme without its date is refused.
    expect(
      await code(
        admin,
        {},
        `UPDATE "StoreTheme" SET "publishedAt" = NULL WHERE "storeId" = $1 AND role = 'LIVE'`,
        [STORE_A],
      ),
    ).toBe("23514");
  });

  it("the merchant role sees and changes only its own store's themes, even in its own organisation", async () => {
    const mine = await rows<{ storeId: string }>(
      app,
      { org: ORG_A, store: STORE_A },
      `SELECT "storeId" FROM "StoreTheme"`,
    );
    expect(new Set(mine.map((r) => r.storeId))).toEqual(new Set([STORE_A]));
    expect(
      await rows(
        app,
        { org: ORG_A, store: STORE_A },
        `SELECT 1 FROM "StoreTheme" WHERE "storeId" = $1`,
        [STORE_B],
      ),
    ).toEqual([]);
    for (const other of [STORE_A2, STORE_B]) {
      const updated = await scoped(
        app,
        { org: ORG_A, store: STORE_A },
        async (c) =>
          (
            await c.query(`UPDATE "StoreTheme" SET "draftSettings" = '{}' WHERE "storeId" = $1`, [
              other,
            ])
          ).rowCount,
      );
      expect(updated, other).toBe(0);
    }
    expect(
      await code(app, { org: ORG_A, store: STORE_A }, `UPDATE "StoreTheme" SET "storeId" = $1`, [
        STORE_B,
      ]),
    ).toBe("42501");
    expect(await code(app, { org: ORG_A, store: STORE_A }, `DELETE FROM "StoreTheme"`)).toBe(
      "42501",
    );
  });

  it("publishing emits a theme event; draft edits emit nothing", async () => {
    const events = async () =>
      (
        await admin.query<{ type: string }>(
          `SELECT type FROM "OutboxEvent" WHERE "storeId" = $1 AND "entityType" = 'StoreTheme' ORDER BY "occurredAt"`,
          [STORE_B],
        )
      ).rows.map((r) => r.type);
    const before = (await events()).length;
    await admin.query(
      `UPDATE "StoreTheme" SET "draftSettings" = '{"a":1}' WHERE "storeId" = $1 AND role = 'LIVE'`,
      [STORE_B],
    );
    expect((await events()).length).toBe(before);
    await admin.query(
      `UPDATE "StoreTheme" SET "publishedSettings" = '{"a":1}' WHERE "storeId" = $1 AND role = 'LIVE'`,
      [STORE_B],
    );
    expect((await events()).slice(before)).toEqual(["theme.changed"]);
  });
});

// Migration 20270101000000_theme_packages (08-themes.md §10).
describe("installed theme packages", () => {
  const BOUTIQUE = { preset: "atelier", draft: "boutique" };

  beforeAll(async () => {
    await admin.query(
      `INSERT INTO "StoreTheme" (id, "organisationId", "storeId", "themeKey", name, role, "draftSettings", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'boutique', 'Boutique', 'UNPUBLISHED', $3, now())`,
      [ORG_A, STORE_A2, BOUTIQUE],
    );
  });

  const storefrontTheme = (scope: { org: string; store: string; preview?: boolean }) =>
    rows<{ theme_key: string; theme_version: number; live: boolean; settings: unknown }>(
      storefront,
      scope,
      "SELECT theme_key, theme_version, live, settings FROM app_storefront_theme_settings()",
    );

  it("an installed theme that isn't live reaches the storefront only in a preview that chose it", async () => {
    const publicView = [
      {
        theme_key: "storevia",
        theme_version: 1,
        live: true,
        settings: { ...SETTINGS, published: STORE_A2 },
      },
    ];
    // Installed but not chosen for preview: the preview shows the live theme's draft.
    expect(await storefrontTheme({ org: ORG_A, store: STORE_A2, preview: true })).toEqual([
      {
        theme_key: "storevia",
        theme_version: 1,
        live: true,
        settings: { ...SETTINGS, draft: STORE_A2 },
      },
    ]);
    await admin.query(
      `UPDATE "StoreTheme" SET "previewedAt" = now() WHERE "storeId" = $1 AND "themeKey" = 'boutique'`,
      [STORE_A2],
    );
    expect(await storefrontTheme({ org: ORG_A, store: STORE_A2, preview: true })).toEqual([
      { theme_key: "boutique", theme_version: 1, live: false, settings: BOUTIQUE },
    ]);
    // Visitors (no verified preview) always get the live theme's published settings.
    expect(await storefrontTheme({ org: ORG_A, store: STORE_A2 })).toEqual(publicView);
    // The table itself still shows the storefront role only LIVE rows, even in a preview.
    expect(
      await rows(
        storefront,
        { org: ORG_A, store: STORE_A2, preview: true },
        `SELECT "themeKey" FROM "StoreTheme"`,
      ),
    ).toEqual([{ themeKey: "storevia" }]);
    // Another store's preview never sees it.
    expect(
      (await storefrontTheme({ org: ORG_A, store: STORE_A, preview: true })).map(
        (r) => r.theme_key,
      ),
    ).toEqual(["storevia"]);
    // The live theme chosen again (a later choice) wins.
    await admin.query(
      `UPDATE "StoreTheme" SET "previewedAt" = now() + interval '1 second' WHERE "storeId" = $1 AND role = 'LIVE'`,
      [STORE_A2],
    );
    expect(
      (await storefrontTheme({ org: ORG_A, store: STORE_A2, preview: true }))[0]?.theme_key,
    ).toBe("storevia");
  });

  it("records a positive theme version; the merchant role may set it and the preview choice", async () => {
    expect(
      await code(admin, {}, `UPDATE "StoreTheme" SET "themeVersion" = 0 WHERE "storeId" = $1`, [
        STORE_A2,
      ]),
    ).toBe("23514");
    const updated = await scoped(
      app,
      { org: ORG_A, store: STORE_A2 },
      async (c) =>
        (
          await c.query(
            `UPDATE "StoreTheme" SET "themeVersion" = 2, "previewedAt" = now() WHERE "themeKey" = 'boutique'`,
          )
        ).rowCount,
    );
    expect(updated).toBe(1);
  });

  it("a preview choice emits nothing; a new version of the live theme refreshes the site", async () => {
    const events = async () =>
      (
        await admin.query<{ type: string }>(
          `SELECT type FROM "OutboxEvent" WHERE "storeId" = $1 AND "entityType" = 'StoreTheme'`,
          [STORE_A2],
        )
      ).rows.length;
    const before = await events();
    await admin.query(`UPDATE "StoreTheme" SET "previewedAt" = now() WHERE "storeId" = $1`, [
      STORE_A2,
    ]);
    await admin.query(
      `UPDATE "StoreTheme" SET "themeVersion" = 2 WHERE "storeId" = $1 AND role = 'UNPUBLISHED'`,
      [STORE_A2],
    );
    expect(await events()).toBe(before);
    await admin.query(
      `UPDATE "StoreTheme" SET "themeVersion" = 2 WHERE "storeId" = $1 AND role = 'LIVE'`,
      [STORE_A2],
    );
    expect(await events()).toBe(before + 1);
  });
});

describe("navigation menus", () => {
  it("are bounded arrays under known handles", async () => {
    const insert = (handle: string, items: unknown) =>
      code(
        admin,
        {},
        `INSERT INTO "Navigation" (id, "organisationId", "storeId", handle, title, items, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'Menu', $4, now())`,
        [ORG_A, STORE_A, handle, JSON.stringify(items)],
      );
    expect(await insert("sidebar", [])).toBe("23514");
    expect(await insert("main", {})).toBe("23514");
    expect(
      await insert(
        "main",
        Array.from({ length: 21 }, () => ({})),
      ),
    ).toBe("23514");
    expect(await insert("main", [{ id: "x", label: "Home", link: { type: "home" } }])).toBeNull();
    // (code() rolls back; keep one menu for the next tests.)
    await admin.query(
      `INSERT INTO "Navigation" (id, "organisationId", "storeId", handle, title, items, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'main', 'Menu', '[]', now())`,
      [ORG_A, STORE_A],
    );
    expect(await insert("main", [])).toBe("23505");
  });

  it("the storefront reads its own store's menus; the merchant role writes only its own", async () => {
    for (const [org, store] of [
      [ORG_B, STORE_B],
      [ORG_A, STORE_A2],
    ] as const) {
      await admin.query(
        `INSERT INTO "Navigation" (id, "organisationId", "storeId", handle, title, items, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'main', 'Menu', '[]', now())`,
        [org, store],
      );
    }
    const seen = await rows<{ storeId: string }>(
      storefront,
      { org: ORG_A, store: STORE_A },
      `SELECT "storeId" FROM "Navigation"`,
    );
    expect(seen.map((r) => r.storeId)).toEqual([STORE_A]);
    expect(
      await code(storefront, { org: ORG_A, store: STORE_A }, `SELECT revision FROM "Navigation"`),
    ).toBe("42501");
    expect(
      await code(
        storefront,
        { org: ORG_A, store: STORE_A },
        `UPDATE "Navigation" SET items = '[]'`,
      ),
    ).toBe("42501");
    // The merchant role, scoped to one store, doesn't see or change another
    // store's menus, in another organisation or its own.
    const visible = await rows<{ storeId: string }>(
      app,
      { org: ORG_A, store: STORE_A },
      `SELECT "storeId" FROM "Navigation"`,
    );
    expect(visible.map((r) => r.storeId)).toEqual([STORE_A]);
    for (const other of [STORE_A2, STORE_B]) {
      const changed = await scoped(
        app,
        { org: ORG_A, store: STORE_A },
        async (c) =>
          (await c.query(`UPDATE "Navigation" SET items = '[]' WHERE "storeId" = $1`, [other]))
            .rowCount,
      );
      expect(changed, other).toBe(0);
    }
    expect(
      await code(app, { org: ORG_A, store: STORE_A }, `UPDATE "Navigation" SET handle = 'footer'`),
    ).toBe("42501");
  });

  it("changes emit a navigation event", async () => {
    const before =
      (
        await admin.query(
          `SELECT 1 FROM "OutboxEvent" WHERE "storeId" = $1 AND type = 'navigation.changed'`,
          [STORE_A],
        )
      ).rowCount ?? 0;
    await admin.query(
      `UPDATE "Navigation" SET items = '[]', revision = revision + 1 WHERE "storeId" = $1`,
      [STORE_A],
    );
    const after =
      (
        await admin.query(
          `SELECT 1 FROM "OutboxEvent" WHERE "storeId" = $1 AND type = 'navigation.changed'`,
          [STORE_A],
        )
      ).rowCount ?? 0;
    expect(after).toBe(before + 1);
  });
});

describe("the merchant role's page grants", () => {
  it("writes page content and state, never a page's owner, kind or id", async () => {
    const scope = { org: ORG_A, store: STORE_A };
    expect(await code(app, scope, `UPDATE "Page" SET title = 'Start'`)).toBeNull();
    expect(await code(app, scope, `UPDATE "Page" SET kind = 'STANDARD'`)).toBe("42501");
    expect(await code(app, scope, `UPDATE "Page" SET "storeId" = $1`, [STORE_B])).toBe("42501");
    expect(await code(app, scope, `UPDATE "PageVersion" SET "pageId" = gen_random_uuid()`)).toBe(
      "42501",
    );
    expect(await code(app, scope, `DELETE FROM "Page"`)).toBe("42501");
    expect(await code(app, scope, `DELETE FROM "PageVersion"`)).toBe("42501");
    // Published documents stay frozen whatever the grants.
    expect(
      await code(
        app,
        scope,
        `UPDATE "PageVersion" SET document = '{"schemaVersion":1,"root":[]}' WHERE state = 'PUBLISHED'`,
      ),
    ).toBe("23514");
    // Another store's pages don't exist for it.
    expect(await rows(app, scope, `SELECT 1 FROM "Page" WHERE "storeId" = $1`, [STORE_B])).toEqual(
      [],
    );
  });
});
