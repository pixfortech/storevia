// Theme packages (M7, 08-themes.md §10): install a second first-party
// theme, customise its draft, preview it (only inside a verified preview;
// visitors keep the live theme), publish it (the LIVE pointer moves
// atomically, the previous theme keeps its settings) and switch back,
// without touching pages or commerce data. Tenant isolation between stores
// of one organisation and across organisations, exactly one LIVE theme
// under concurrent publishes, and refusal of incompatible themes.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { THEME_PLATFORM } from "@storevia/editor/theme";
import {
  getStoreTheme,
  installTheme,
  listPages,
  listThemes,
  previewTheme,
  publishTheme,
  saveThemeDraft,
} from "@storevia/site-admin";
import { readPublicSite } from "@storevia/site-engine/read";
import {
  BOUTIQUE_THEME,
  DEFAULT_THEME_SETTINGS,
  STOREVIA_THEME,
  THEMES,
  renderableTheme,
  themeDefaults,
  themeSettingsSchemaFor,
  type ThemeCatalogue,
  type ThemeDefinition,
} from "@storevia/site-engine/theme";
import type { StoreContext } from "@storevia/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProduct } from "../src";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

let tenantA: Tenant;
let A: StoreContext; // the store that switches themes
let A2: StoreContext; // another store of the same organisation
let B: StoreContext; // another organisation's store

const scope = (ctx: StoreContext) => ({ organisationId: ctx.organisationId, storeId: ctx.storeId });
const publicTheme = (ctx: StoreContext) => readPublicSite(scope(ctx), (site) => site.theme());
const previewedTheme = (ctx: StoreContext) =>
  readPublicSite(scope(ctx), (site) => site.theme(), { preview: true });

const preset = (theme: ThemeDefinition, key: string) => {
  const found = theme.presets.find((p) => p.key === key);
  if (!found) throw new Error(`no preset ${key}`);
  return found.settings;
};
const MODERN = preset(STOREVIA_THEME, "modern");
const LINEN = preset(BOUTIQUE_THEME, "linen");

interface Row {
  themeKey: string;
  role: string;
  themeVersion: number;
  draftSettings: { preset?: string };
  publishedSettings: { preset?: string } | null;
  previewedAt: Date | null;
}

const themeRows = (ctx: StoreContext) =>
  migratorDb().$queryRaw<Row[]>`
    SELECT "themeKey", role::text AS role, "themeVersion", "draftSettings", "publishedSettings",
           "previewedAt"
    FROM "StoreTheme" WHERE "storeId" = ${ctx.storeId}::uuid ORDER BY "themeKey"`;

const liveCount = async (ctx: StoreContext) =>
  (await themeRows(ctx)).filter((r) => r.role === "LIVE").length;

/** Pages and products as stored: a theme switch must leave them exactly as they were. */
const contentSnapshot = async (ctx: StoreContext) => ({
  pages: await migratorDb().$queryRaw<unknown[]>`
    SELECT id, handle, "publishedVersionId", "updatedAt" FROM "Page"
    WHERE "storeId" = ${ctx.storeId}::uuid ORDER BY id`,
  versions: await migratorDb().$queryRaw<unknown[]>`
    SELECT id, state::text, "documentHash", "updatedAt" FROM "PageVersion"
    WHERE "storeId" = ${ctx.storeId}::uuid ORDER BY id`,
  products: await migratorDb().$queryRaw<unknown[]>`
    SELECT id, handle, status::text, "updatedAt" FROM "Product"
    WHERE "storeId" = ${ctx.storeId}::uuid ORDER BY id`,
});

beforeAll(async () => {
  await truncateAll();
  tenantA = await makeTenant("themes-a", { stores: [{ currency: "INR" }, { currency: "INR" }] });
  A = storeOf(tenantA, 0);
  A2 = storeOf(tenantA, 1);
  B = storeOf(await makeTenant("themes-b"));
  await createProduct(A, { title: "Stoneware mug" });
});

afterAll(async () => {
  await disconnectTestClients();
});

describe("theme library", () => {
  it("lists the first-party themes; the default is live and installed before anything is saved", async () => {
    const library = await listThemes(A);
    expect(library.map((t) => [t.key, t.installed, t.live, t.previewing])).toEqual([
      ["storevia", true, true, true],
      ["boutique", false, false, false],
    ]);
    expect(library.every((t) => t.incompatibility === null)).toBe(true);
    expect(library[1]).toMatchObject({
      name: "Boutique",
      version: BOUTIQUE_THEME.version,
      presetNames: ["Atelier", "Linen", "Gallery"],
      chrome: { header: "centred", navigation: "uppercase" },
    });
    await expectCode(getStoreTheme(A, "boutique"), "NOT_FOUND");
    await expectCode(installTheme(A, { themeKey: "nonexistent" }), "NOT_FOUND");
    await expectCode(installTheme(A, { themeKey: "__proto__" }), "NOT_FOUND");
  });
});

describe("install → customise → preview → publish → switch back", () => {
  it("runs the whole lifecycle without touching pages or commerce data", async () => {
    // The store's live theme: Storevia, customised and published.
    await saveThemeDraft(A, { revision: 0, settings: MODERN });
    await publishTheme(A, { revision: 1 });
    expect((await publicTheme(A))?.settings).toMatchObject({ preset: "modern" });
    const before = await contentSnapshot(A);
    expect(before.pages.length).toBeGreaterThan(0);
    expect(before.products).toHaveLength(1);

    // Install: an UNPUBLISHED row with the theme's defaults; installing twice changes nothing.
    const installed = await installTheme(A, { themeKey: "boutique" });
    expect(installed).toMatchObject({
      themeKey: "boutique",
      name: "Boutique",
      version: BOUTIQUE_THEME.version,
      live: false,
      revision: 0,
      draft: themeDefaults(BOUTIQUE_THEME),
      hasUnpublishedChanges: true,
    });
    expect(await installTheme(A, { themeKey: "boutique" })).toEqual(installed);
    expect((await themeRows(A)).map((r) => [r.themeKey, r.role])).toEqual([
      ["boutique", "UNPUBLISHED"],
      ["storevia", "LIVE"],
    ]);

    // Customise its draft: its own presets, contrast rules and concurrency.
    const saved = await saveThemeDraft(A, { themeKey: "boutique", revision: 0, settings: LINEN });
    expect(saved).toMatchObject({ revision: 1, live: false, draft: { preset: "linen" } });
    await expectCode(
      saveThemeDraft(A, { themeKey: "boutique", revision: 0, settings: LINEN }),
      "CONFLICT",
    );
    await expectCode(
      saveThemeDraft(A, { themeKey: "boutique", revision: 1, settings: MODERN }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      saveThemeDraft(A, {
        themeKey: "boutique",
        revision: 1,
        settings: { ...LINEN, colors: { ...LINEN.colors, text: "#f0ebe4" } },
      }),
      "VALIDATION_FAILED",
    );
    // The live theme's draft is untouched by the other theme's edits.
    expect((await getStoreTheme(A)).draft).toMatchObject({ preset: "modern" });

    // Nothing public changed; the preview still shows the live theme until Boutique is chosen.
    expect(await publicTheme(A)).toMatchObject({ themeKey: "storevia", live: true });
    expect(await previewedTheme(A)).toMatchObject({ themeKey: "storevia", live: true });

    // Preview: only a verified preview renders Boutique's draft.
    await previewTheme(A, { themeKey: "boutique" });
    const preview = await previewedTheme(A);
    expect(preview).toMatchObject({
      themeKey: "boutique",
      themeVersion: 1,
      live: false,
      settings: { preset: "linen" },
    });
    expect(renderableTheme(preview, THEME_PLATFORM)).toMatchObject({
      theme: BOUTIQUE_THEME,
      fallback: null,
    });
    const visitors = await publicTheme(A);
    expect(visitors).toMatchObject({
      themeKey: "storevia",
      live: true,
      settings: { preset: "modern" },
    });
    expect(renderableTheme(visitors, THEME_PLATFORM).theme).toBe(STOREVIA_THEME);
    expect((await listThemes(A)).map((t) => [t.key, t.live, t.previewing])).toEqual([
      ["storevia", true, false],
      ["boutique", false, true],
    ]);

    // Authors (design.edit) may choose what the preview shows, but can't publish;
    // a stale revision can't publish either.
    const author = await memberContext(tenantA, "AUTHOR", A);
    expect(await previewTheme(author, { themeKey: "boutique" })).toMatchObject({ live: false });
    await expectCode(publishTheme(author, { themeKey: "boutique", revision: 1 }), "FORBIDDEN");
    await expectCode(publishTheme(A, { themeKey: "boutique", revision: 0 }), "CONFLICT");
    const events = async () =>
      (
        await migratorDb().$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM "OutboxEvent"
          WHERE "storeId" = ${A.storeId}::uuid AND type = 'theme.changed'`
      )[0]?.n ?? 0n;
    const eventsBefore = await events();
    const live = await publishTheme(A, { themeKey: "boutique", revision: 1 });
    expect(live).toMatchObject({ themeKey: "boutique", live: true, hasUnpublishedChanges: false });

    // The pointer moved: Boutique is LIVE and public; Storevia is UNPUBLISHED with its settings.
    const rows = await themeRows(A);
    expect(rows.map((r) => [r.themeKey, r.role])).toEqual([
      ["boutique", "LIVE"],
      ["storevia", "UNPUBLISHED"],
    ]);
    const [boutiqueRow, storeviaRow] = rows;
    expect(boutiqueRow?.publishedSettings?.preset).toBe("linen");
    expect(storeviaRow?.publishedSettings?.preset).toBe("modern");
    expect(storeviaRow?.draftSettings.preset).toBe("modern");
    expect(rows.every((r) => r.previewedAt === null)).toBe(true);
    expect(await publicTheme(A)).toMatchObject({
      themeKey: "boutique",
      live: true,
      settings: { preset: "linen" },
    });
    expect(await events()).toBeGreaterThan(eventsBefore);
    const audit = await migratorDb().$queryRaw<{ action: string; metadata: unknown }[]>`
      SELECT action, metadata FROM "AuditLog"
      WHERE "storeId" = ${A.storeId}::uuid AND action LIKE 'theme.%' ORDER BY "createdAt", id`;
    expect(audit.map((a) => a.action)).toEqual([
      "theme.draft_saved",
      "theme.published",
      "theme.installed",
      "theme.draft_saved",
      "theme.preview_chosen",
      "theme.preview_chosen",
      "theme.switched",
    ]);
    expect(audit.at(-1)?.metadata).toMatchObject({ theme: "boutique", previousTheme: "storevia" });

    // Switch back: Storevia returns with the settings it had; Boutique keeps its own.
    const previous = await getStoreTheme(A, "storevia");
    expect(previous).toMatchObject({ live: false, draft: { preset: "modern" } });
    await publishTheme(A, { themeKey: "storevia", revision: previous.revision });
    expect(await publicTheme(A)).toMatchObject({
      themeKey: "storevia",
      live: true,
      settings: { preset: "modern" },
    });
    expect((await getStoreTheme(A, "boutique")).draft).toMatchObject({ preset: "linen" });
    expect(await liveCount(A)).toBe(1);

    // Pages, their versions and products are exactly as they were.
    expect(await contentSnapshot(A)).toEqual(before);
    expect((await listPages(A)).map((p) => p.status)).toEqual(["published"]);
  });
});

describe("tenant isolation", () => {
  it("another store (same organisation or not) can't see or change this store's themes", async () => {
    const aRows = await themeRows(A);
    for (const other of [A2, B]) {
      expect((await listThemes(other)).map((t) => [t.key, t.installed, t.live])).toEqual([
        ["storevia", true, true],
        ["boutique", false, false],
      ]);
      await expectCode(getStoreTheme(other, "boutique"), "NOT_FOUND");
      await expectCode(previewTheme(other, { themeKey: "boutique" }), "NOT_FOUND");
      await expectCode(
        saveThemeDraft(other, { themeKey: "boutique", revision: 1, settings: LINEN }),
        "NOT_FOUND",
      );
      await expectCode(publishTheme(other, { themeKey: "boutique", revision: 1 }), "CONFLICT");
      await expectCode(publishTheme(other, { revision: 1 }), "CONFLICT");
      expect(await publicTheme(other)).toBeNull();
      expect(await previewedTheme(other)).toBeNull();
    }
    expect(await themeRows(A)).toEqual(aRows);
    expect(await themeRows(A2)).toEqual([]);
    expect(await themeRows(B)).toEqual([]);

    // Installing and switching in the sibling store leaves this one alone.
    await installTheme(A2, { themeKey: "boutique" });
    await publishTheme(A2, { themeKey: "boutique", revision: 0 });
    expect(await publicTheme(A2)).toMatchObject({ themeKey: "boutique", live: true });
    expect(await publicTheme(A)).toMatchObject({ themeKey: "storevia", live: true });
    expect(await themeRows(A)).toEqual(aRows);
    expect(await liveCount(A2)).toBe(1);
  });
});

describe("the publish pointer", () => {
  it("leaves exactly one LIVE theme whatever concurrent publishes do", async () => {
    const C = storeOf(await makeTenant("themes-race"));
    await installTheme(C, { themeKey: "boutique" });
    for (let round = 0; round < 4; round += 1) {
      const [storevia, boutique] = await Promise.all([
        getStoreTheme(C, "storevia"),
        getStoreTheme(C, "boutique"),
      ]);
      const results = await Promise.allSettled([
        publishTheme(C, { themeKey: "boutique", revision: boutique.revision }),
        publishTheme(C, { themeKey: "storevia", revision: storevia.revision }),
        publishTheme(C, { themeKey: "boutique", revision: boutique.revision }),
        publishTheme(C, { themeKey: "storevia", revision: storevia.revision }),
      ]);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFLICT" });
      }
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      const rows = await themeRows(C);
      expect(
        rows.filter((r) => r.role === "LIVE"),
        `round ${String(round)}`,
      ).toHaveLength(1);
      expect(rows).toHaveLength(2);
      // What visitors see is the LIVE row.
      const live = rows.find((r) => r.role === "LIVE");
      expect((await publicTheme(C))?.themeKey).toBe(live?.themeKey);
    }
  });

  it("concurrent first installs create one row per theme", async () => {
    const D = storeOf(await makeTenant("themes-install-race"));
    const results = await Promise.allSettled([
      installTheme(D, { themeKey: "boutique" }),
      installTheme(D, { themeKey: "boutique" }),
      installTheme(D, { themeKey: "boutique" }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await themeRows(D)).map((r) => [r.themeKey, r.role])).toEqual([
      ["boutique", "UNPUBLISHED"],
      ["storevia", "LIVE"],
    ]);
  });
});

describe("versions and compatibility", () => {
  const incompatible = (theme: ThemeDefinition): ThemeDefinition => ({
    ...theme,
    compatibility: { engine: theme.compatibility.engine, documentSchema: [99] },
  });

  it("refuses to install, preview or publish a theme that doesn't support this platform", async () => {
    const E = storeOf(await makeTenant("themes-compat"));
    const legacy: ThemeDefinition = {
      ...incompatible(BOUTIQUE_THEME),
      key: "legacy",
      name: "Legacy",
    };
    const catalogue: ThemeCatalogue = { ...THEMES, legacy };
    const refusal: unknown = await installTheme(E, { themeKey: "legacy" }, catalogue).catch(
      (error: unknown) => error,
    );
    expect(refusal).toMatchObject({ code: "CONFLICT" });
    expect((refusal as Error).message).toMatch(/doesn't support this version of Storevia's pages/);
    expect(await themeRows(E)).toEqual([]);
    expect(
      (await listThemes(E, catalogue)).find((t) => t.key === "legacy")?.incompatibility,
    ).toMatch(/can't be used yet/);

    // A theme installed while compatible, then no longer supported (a platform upgrade).
    await installTheme(E, { themeKey: "boutique" });
    const moved: ThemeCatalogue = { ...THEMES, boutique: incompatible(BOUTIQUE_THEME) };
    await expectCode(installTheme(E, { themeKey: "boutique" }, moved), "CONFLICT");
    await expectCode(previewTheme(E, { themeKey: "boutique" }, moved), "CONFLICT");
    await expectCode(publishTheme(E, { themeKey: "boutique", revision: 0 }, moved), "CONFLICT");
    expect((await themeRows(E)).find((r) => r.role === "LIVE")?.themeKey).toBe("storevia");
    // And a live theme that stopped being supported renders the default, never a broken store.
    await publishTheme(E, { themeKey: "boutique", revision: 0 });
    expect(
      renderableTheme(await publicTheme(E), { ...THEME_PLATFORM, documentSchema: 99 + 1 }),
    ).toMatchObject({ theme: STOREVIA_THEME, fallback: "incompatible" });
  });

  it("migrates settings saved for an older theme version, and never publishes invalid ones", async () => {
    const F = storeOf(await makeTenant("themes-version"));
    await installTheme(F, { themeKey: "boutique" });
    // Boutique 2 renamed its presets: "linen" became "flax".
    const v2Keys = ["atelier", "flax", "gallery"] as const;
    const boutique2: ThemeDefinition = {
      ...BOUTIQUE_THEME,
      version: 2,
      settingsSchema: themeSettingsSchemaFor(v2Keys),
      presets: BOUTIQUE_THEME.presets.map((p) =>
        p.key === "linen" ? { ...p, key: "flax", settings: { ...p.settings, preset: "flax" } } : p,
      ),
      migrateSettings: (settings, fromVersion) =>
        fromVersion < 2 && (settings as { preset?: string }).preset === "linen"
          ? { ...(settings as object), preset: "flax" }
          : settings,
    };
    const catalogue: ThemeCatalogue = { ...THEMES, boutique: boutique2 };
    await saveThemeDraft(F, { themeKey: "boutique", revision: 0, settings: LINEN });
    expect((await themeRows(F)).find((r) => r.themeKey === "boutique")?.themeVersion).toBe(1);
    // Read with version 2: migrated, not reset.
    const read = await getStoreTheme(F, "boutique", catalogue);
    expect(read.draft).toMatchObject({ preset: "flax", colors: LINEN.colors });
    // Published with version 2: stored migrated, at the new version.
    await publishTheme(F, { themeKey: "boutique", revision: 1 }, catalogue);
    const row = (await themeRows(F)).find((r) => r.themeKey === "boutique");
    expect(row).toMatchObject({ themeVersion: 2, role: "LIVE" });
    expect(row?.publishedSettings?.preset).toBe("flax");

    // Settings that no longer validate read as the theme's defaults and can't be published.
    await migratorDb().$executeRaw`
      UPDATE "StoreTheme" SET "draftSettings" = '{"preset":"gone"}'::jsonb
      WHERE "storeId" = ${F.storeId}::uuid AND "themeKey" = 'storevia'`;
    const broken = await getStoreTheme(F, "storevia");
    expect(broken.draft).toEqual(DEFAULT_THEME_SETTINGS);
    await expectCode(
      publishTheme(F, { themeKey: "storevia", revision: broken.revision }),
      "CONFLICT",
    );
    expect((await themeRows(F)).find((r) => r.role === "LIVE")?.themeKey).toBe("boutique");
  });
});
