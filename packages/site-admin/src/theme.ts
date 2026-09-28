import "server-only";
import { Prisma } from "@storevia/database";
import { THEME_PLATFORM } from "@storevia/editor/theme";
import { createLogger } from "@storevia/observability";
import {
  DEFAULT_THEME_DEFINITION,
  THEMES,
  themeCompatibilityIssue,
  themeDefaults,
  themeDefinition,
  themeSettingsFor,
  type ThemeCatalogue,
  type ThemeChrome,
  type ThemeDefinition,
  type ThemeSettings,
} from "@storevia/site-engine/theme";
import { parseInput, recordAudit, type StoreContext, type TenantContext } from "@storevia/tenancy";
import { DomainError, notFound } from "@storevia/types";
import { z } from "zod";
import { conflict, inSite, lockStoreKey, pgCode, type TenantTx } from "./internal";

// A store's themes (ADR-0030 §7, 08-themes §10). Each first-party theme can
// be installed once per store as a StoreTheme row: exactly one is LIVE (a
// partial unique index), the others UNPUBLISHED. Every row has draft and
// published settings with optimistic concurrency on settingsRevision.
//
//   install   → an UNPUBLISHED row with the theme's default preset (design.edit)
//   customise → its draft settings, validated by that theme's schema (design.edit)
//   preview   → marks it as the theme the store's preview shows (design.edit)
//   publish   → draft → published; a non-live theme becomes LIVE and the
//               previous LIVE row becomes UNPUBLISHED with its settings kept
//               (theme.publish)
//
// A store that never touched its theme has no row and renders the default
// theme (Storevia) with its defaults; installing another theme first records
// that implicit live theme, so switching back keeps working. Theme writes
// for a store serialise on one advisory lock, so two publishes can't
// interleave (and the unique index would refuse a second LIVE row anyway).
// Themes whose compatibility doesn't include this platform can't be
// installed, previewed or published. Page documents, commerce data, domains
// and URLs are never touched: a theme only changes presentation.

const log = createLogger({ component: "site-admin" });

export interface StoreThemeView {
  readonly themeKey: string;
  readonly name: string;
  /** The theme version these settings were saved for. */
  readonly version: number;
  readonly live: boolean;
  readonly draft: ThemeSettings;
  readonly published: ThemeSettings;
  readonly revision: number;
  /** The draft differs from what visitors see (always true for a theme that isn't live). */
  readonly hasUnpublishedChanges: boolean;
}

export interface ThemeLibraryEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly chrome: ThemeChrome;
  readonly presetNames: readonly string[];
  readonly installed: boolean;
  readonly live: boolean;
  /** The theme the store's preview shows. */
  readonly previewing: boolean;
  /** Installed, not live, and live before (publishing it is switching back). */
  readonly wasLive: boolean;
  /** The installed row's revision (for publishing it), or null when not installed. */
  readonly revision: number | null;
  readonly hasUnpublishedChanges: boolean;
  /** Why this platform can't use the theme, or null. */
  readonly incompatibility: string | null;
}

interface ThemeRow {
  id: string;
  themeKey: string;
  themeVersion: number;
  role: "LIVE" | "UNPUBLISHED";
  draftSettings: unknown;
  publishedSettings: unknown;
  settingsRevision: number;
  previewedAt: Date | null;
}

const COLUMNS = Prisma.raw(`id, "themeKey", "themeVersion", role::text AS role, "draftSettings",
  "publishedSettings", "settingsRevision", "previewedAt"`);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const THEME_CONFLICT =
  "The theme was changed somewhere else (another tab, device or person) after you opened it. Reload to see the latest settings.";

const unavailable = (key: string) =>
  conflict(`The theme "${key}" is no longer available. Choose another theme.`);

/** The definition for a key the merchant named (unknown keys read as missing). */
function definitionFor(key: string, catalogue: ThemeCatalogue): ThemeDefinition {
  const theme = themeDefinition(key, catalogue);
  if (!theme) throw notFound();
  return theme;
}

/** Refuses themes this platform can't render. */
function requireCompatible(theme: ThemeDefinition): void {
  const issue = themeCompatibilityIssue(theme, THEME_PLATFORM);
  if (issue) throw conflict(issue);
}

function view(theme: ThemeDefinition, row: ThemeRow | undefined): StoreThemeView {
  if (!row) {
    const defaults = themeDefaults(theme);
    return {
      themeKey: theme.key,
      name: theme.name,
      version: theme.version,
      live: true,
      draft: defaults,
      published: defaults,
      revision: 0,
      hasUnpublishedChanges: false,
    };
  }
  const draft = themeSettingsFor(theme, row.draftSettings, row.themeVersion).settings;
  const published =
    row.publishedSettings === null
      ? themeDefaults(theme)
      : themeSettingsFor(theme, row.publishedSettings, row.themeVersion).settings;
  const live = row.role === "LIVE";
  return {
    themeKey: row.themeKey,
    name: theme.name,
    version: row.themeVersion,
    live,
    draft,
    published,
    revision: row.settingsRevision,
    hasUnpublishedChanges: !live || !same(draft, published),
  };
}

async function storeThemes(tx: TenantTx): Promise<ThemeRow[]> {
  return tx.$queryRaw<ThemeRow[]>`
    SELECT ${COLUMNS} FROM "StoreTheme" ORDER BY (role = 'LIVE') DESC, "createdAt", id`;
}

/** The row for a theme key, or the LIVE row when no key is given. */
async function findRow(tx: TenantTx, themeKey: string | undefined): Promise<ThemeRow | undefined> {
  const rows = await storeThemes(tx);
  return themeKey === undefined
    ? rows.find((r) => r.role === "LIVE")
    : rows.find((r) => r.themeKey === themeKey);
}

/** Serialises every theme write in one store (install, save, preview, publish). */
const lockThemes = (tx: TenantTx, store: StoreContext) => lockStoreKey(tx, store.storeId, "theme");

const themeKeySchema = z.string().trim().min(1).max(41);

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

/**
 * An installed theme (the live one when `themeKey` is omitted). The default
 * theme reads as live with its defaults until the store customises it; any
 * other theme that isn't installed reads as missing.
 */
export async function getStoreTheme(
  ctx: TenantContext,
  themeKey?: string,
  catalogue: ThemeCatalogue = THEMES,
): Promise<StoreThemeView> {
  const key = themeKey === undefined ? undefined : parseInput(themeKeySchema, themeKey);
  return inSite(ctx, "design.edit", async (tx) => {
    const rows = await storeThemes(tx);
    const liveRow = rows.find((r) => r.role === "LIVE");
    const row = key === undefined ? liveRow : rows.find((r) => r.themeKey === key);
    if (!row) {
      // Only the implicit live default theme exists without a row.
      if (liveRow || (key !== undefined && key !== DEFAULT_THEME_DEFINITION.key)) throw notFound();
      return view(DEFAULT_THEME_DEFINITION, undefined);
    }
    const theme = themeDefinition(row.themeKey, catalogue);
    if (!theme) {
      if (row.role !== "LIVE") throw notFound();
      // A live theme that no longer ships: shown (and rendered) as the default.
      return { ...view(DEFAULT_THEME_DEFINITION, undefined), revision: row.settingsRevision };
    }
    return view(theme, row);
  });
}

/** Every first-party theme with this store's installation state. */
export async function listThemes(
  ctx: TenantContext,
  catalogue: ThemeCatalogue = THEMES,
): Promise<ThemeLibraryEntry[]> {
  return inSite(ctx, "design.edit", async (tx) => {
    const rows = await storeThemes(tx);
    const liveKey = rows.find((r) => r.role === "LIVE")?.themeKey ?? DEFAULT_THEME_DEFINITION.key;
    // The same choice the storefront's preview makes (app_storefront_theme_settings).
    const previewed = [...rows]
      .filter((r) => r.previewedAt !== null)
      .sort((a, b) => (b.previewedAt?.getTime() ?? 0) - (a.previewedAt?.getTime() ?? 0))[0];
    const previewKey = previewed?.themeKey ?? liveKey;
    return Object.values(catalogue).map((theme) => {
      const row = rows.find((r) => r.themeKey === theme.key);
      const implicit = !row && rows.length === 0 && theme.key === DEFAULT_THEME_DEFINITION.key;
      const current = row ? view(theme, row) : implicit ? view(theme, undefined) : null;
      return {
        key: theme.key,
        name: theme.name,
        description: theme.description,
        version: theme.version,
        chrome: theme.chrome,
        presetNames: theme.presets.map((p) => p.name),
        installed: current !== null,
        live: theme.key === liveKey,
        previewing: theme.key === previewKey,
        // The default theme was live before any other could be installed.
        wasLive:
          row?.role === "UNPUBLISHED" &&
          (row.publishedSettings !== null || theme.key === DEFAULT_THEME_DEFINITION.key),
        revision: current?.revision ?? null,
        hasUnpublishedChanges: current?.hasUnpublishedChanges ?? false,
        incompatibility: themeCompatibilityIssue(theme, THEME_PLATFORM),
      } satisfies ThemeLibraryEntry;
    });
  });
}

// ---------------------------------------------------------------------------
// Install.
// ---------------------------------------------------------------------------

const installSchema = z.strictObject({ themeKey: themeKeySchema });

/** Records the implicit live default theme as a row, so it survives a switch. */
async function ensureLiveRow(tx: TenantTx, store: StoreContext): Promise<void> {
  const theme = DEFAULT_THEME_DEFINITION;
  await tx.$executeRaw`
    INSERT INTO "StoreTheme" (id, "organisationId", "storeId", "themeKey", "themeVersion", name,
        role, "draftSettings", "settingsRevision", "updatedAt")
    SELECT gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid, ${theme.key},
           ${theme.version}, ${theme.name}, 'LIVE', ${JSON.stringify(themeDefaults(theme))}::jsonb, 0, now()
    WHERE NOT EXISTS (SELECT 1 FROM "StoreTheme" WHERE role = 'LIVE')`;
}

/**
 * Installs a first-party theme: an UNPUBLISHED row with its default preset.
 * Installing a theme that's already installed returns it unchanged.
 */
export async function installTheme(
  ctx: TenantContext,
  input: unknown,
  catalogue: ThemeCatalogue = THEMES,
): Promise<StoreThemeView> {
  const data = parseInput(installSchema, input);
  const theme = definitionFor(data.themeKey, catalogue);
  requireCompatible(theme);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      await lockThemes(tx, store);
      await ensureLiveRow(tx, store);
      const existing = await findRow(tx, theme.key);
      if (existing) return view(theme, existing);
      const rows = await tx.$queryRaw<ThemeRow[]>`
        INSERT INTO "StoreTheme" (id, "organisationId", "storeId", "themeKey", "themeVersion", name,
            role, "draftSettings", "settingsRevision", "updatedAt")
        VALUES (gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid,
                ${theme.key}, ${theme.version}, ${theme.name}, 'UNPUBLISHED',
                ${JSON.stringify(themeDefaults(theme))}::jsonb, 0, now())
        RETURNING ${COLUMNS}`;
      const row = rows[0];
      if (!row) throw conflict(THEME_CONFLICT);
      await recordAudit(
        tx,
        store,
        "theme.installed",
        { type: "StoreTheme", id: row.id },
        { theme: theme.key, themeVersion: theme.version },
      );
      return view(theme, row);
    },
    { write: true },
  );
}

// ---------------------------------------------------------------------------
// Customise.
// ---------------------------------------------------------------------------

const saveSchema = z.strictObject({
  themeKey: themeKeySchema.optional(),
  revision: z.number().int().min(0),
  settings: z.unknown(),
});

function validSettings(theme: ThemeDefinition, input: unknown): ThemeSettings {
  const parsed = theme.settingsSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "settings";
    fieldErrors[key] ??= issue.message;
  }
  throw new DomainError(
    "VALIDATION_FAILED",
    "Please correct the highlighted settings.",
    fieldErrors,
  );
}

/**
 * Saves a theme's draft settings (the live theme's when `themeKey` is
 * omitted) if nobody else saved since `revision`.
 */
export async function saveThemeDraft(
  ctx: TenantContext,
  input: unknown,
  catalogue: ThemeCatalogue = THEMES,
): Promise<StoreThemeView> {
  const data = parseInput(saveSchema, input);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      await lockThemes(tx, store);
      const row = await findRow(tx, data.themeKey);
      let theme: ThemeDefinition;
      let saved: ThemeRow | undefined;
      if (!row) {
        // The store's first customisation of the implicit default theme creates its row.
        const implicitDefault =
          data.themeKey === undefined || data.themeKey === DEFAULT_THEME_DEFINITION.key;
        if (!implicitDefault || (await findRow(tx, undefined))) throw notFound();
        if (data.revision !== 0) throw conflict(THEME_CONFLICT);
        theme = DEFAULT_THEME_DEFINITION;
        const settings = JSON.stringify(validSettings(theme, data.settings));
        try {
          saved = (
            await tx.$queryRaw<ThemeRow[]>`
              INSERT INTO "StoreTheme" (id, "organisationId", "storeId", "themeKey", "themeVersion",
                  name, role, "draftSettings", "settingsRevision", "updatedAt")
              VALUES (gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid,
                      ${theme.key}, ${theme.version}, ${theme.name}, 'LIVE', ${settings}::jsonb, 1, now())
              RETURNING ${COLUMNS}`
          )[0];
        } catch (error) {
          if (pgCode(error) === "23505") throw conflict(THEME_CONFLICT);
          throw error;
        }
      } else {
        const found = themeDefinition(row.themeKey, catalogue);
        if (!found) throw unavailable(row.themeKey);
        theme = found;
        if (row.settingsRevision !== data.revision) throw conflict(THEME_CONFLICT);
        const settings = JSON.stringify(validSettings(theme, data.settings));
        saved = (
          await tx.$queryRaw<ThemeRow[]>`
            UPDATE "StoreTheme" SET "draftSettings" = ${settings}::jsonb,
                "themeVersion" = ${theme.version},
                "settingsRevision" = "settingsRevision" + 1, "updatedAt" = now()
            WHERE id = ${row.id}::uuid AND "settingsRevision" = ${data.revision}
            RETURNING ${COLUMNS}`
        )[0];
      }
      if (!saved) throw conflict(THEME_CONFLICT);
      const draft = themeSettingsFor(theme, saved.draftSettings, saved.themeVersion).settings;
      await recordAudit(
        tx,
        store,
        "theme.draft_saved",
        { type: "Store", id: store.storeId },
        { theme: theme.key, preset: draft.preset },
      );
      return view(theme, saved);
    },
    { write: true },
  );
}

// ---------------------------------------------------------------------------
// Preview.
// ---------------------------------------------------------------------------

const previewSchema = z.strictObject({ themeKey: themeKeySchema });

/**
 * Makes an installed theme the one the store's preview shows (with its
 * draft settings). Visitors never see it: the storefront only reads a
 * theme that isn't live inside a verified preview.
 */
export async function previewTheme(
  ctx: TenantContext,
  input: unknown,
  catalogue: ThemeCatalogue = THEMES,
): Promise<StoreThemeView> {
  const data = parseInput(previewSchema, input);
  const theme = definitionFor(data.themeKey, catalogue);
  requireCompatible(theme);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      await lockThemes(tx, store);
      const row = await findRow(tx, theme.key);
      if (!row) {
        // The implicit live default theme is what the preview shows already.
        if (theme.key === DEFAULT_THEME_DEFINITION.key && !(await findRow(tx, undefined)))
          return view(theme, undefined);
        throw notFound();
      }
      const updated = (
        await tx.$queryRaw<ThemeRow[]>`
          UPDATE "StoreTheme" SET "previewedAt" = clock_timestamp() WHERE id = ${row.id}::uuid
          RETURNING ${COLUMNS}`
      )[0];
      await recordAudit(
        tx,
        store,
        "theme.preview_chosen",
        { type: "StoreTheme", id: row.id },
        { theme: theme.key },
      );
      return view(theme, updated ?? row);
    },
    { write: true },
  );
}

// ---------------------------------------------------------------------------
// Publish (and switch).
// ---------------------------------------------------------------------------

const publishSchema = z.strictObject({
  themeKey: themeKeySchema.optional(),
  revision: z.number().int().min(0),
});

/**
 * Publishes a theme's draft settings (the ones the merchant is looking at).
 * For a theme that isn't live, this switches the store to it atomically:
 * the previous LIVE theme becomes UNPUBLISHED, keeping its settings.
 */
export async function publishTheme(
  ctx: TenantContext,
  input: unknown,
  catalogue: ThemeCatalogue = THEMES,
): Promise<StoreThemeView> {
  const data = parseInput(publishSchema, input);
  return inSite(
    ctx,
    "theme.publish",
    async (tx, store) => {
      await lockThemes(tx, store);
      const row = await findRow(tx, data.themeKey);
      if (row?.settingsRevision !== data.revision) throw conflict(THEME_CONFLICT);
      const theme = themeDefinition(row.themeKey, catalogue);
      if (!theme) throw unavailable(row.themeKey);
      requireCompatible(theme);
      // Re-validated (and migrated from the version it was saved for):
      // nothing unvalidated is ever published.
      const upgraded =
        row.themeVersion < theme.version && theme.migrateSettings
          ? theme.migrateSettings(row.draftSettings, row.themeVersion)
          : row.draftSettings;
      const settings = theme.settingsSchema.safeParse(upgraded);
      if (!settings.success) {
        log.warn("theme publish refused: invalid draft", {
          storeId: store.storeId,
          themeKey: theme.key,
        });
        throw conflict("These settings can't be published. Adjust them and save again.");
      }
      const json = JSON.stringify(settings.data);
      const previous = row.role === "LIVE" ? undefined : await findRow(tx, undefined);
      if (row.role !== "LIVE") {
        // The partial unique index allows one LIVE row: demote first.
        await tx.$executeRaw`
          UPDATE "StoreTheme" SET role = 'UNPUBLISHED', "updatedAt" = now() WHERE role = 'LIVE'`;
        // What the preview shows starts again from the new live theme.
        await tx.$executeRaw`
          UPDATE "StoreTheme" SET "previewedAt" = NULL WHERE "previewedAt" IS NOT NULL`;
      }
      const updated = (
        await tx.$queryRaw<ThemeRow[]>`
          UPDATE "StoreTheme" SET role = 'LIVE', "draftSettings" = ${json}::jsonb,
              "publishedSettings" = ${json}::jsonb, "themeVersion" = ${theme.version},
              "publishedAt" = now(), "publishedById" = ${store.userId}::uuid, "updatedAt" = now()
          WHERE id = ${row.id}::uuid
          RETURNING ${COLUMNS}`
      )[0];
      if (!updated) throw conflict(THEME_CONFLICT);
      await recordAudit(
        tx,
        store,
        previous ? "theme.switched" : "theme.published",
        { type: "Store", id: store.storeId },
        {
          theme: theme.key,
          themeVersion: theme.version,
          preset: settings.data.preset,
          ...(previous ? { previousTheme: previous.themeKey } : {}),
        },
      );
      return view(theme, updated);
    },
    { write: true },
  );
}
