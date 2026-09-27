import "server-only";
import { createLogger } from "@storevia/observability";
import {
  DEFAULT_THEME_SETTINGS,
  STOREVIA_THEME,
  themeSettingsSchema,
  usableThemeSettings,
  type ThemeSettings,
} from "@storevia/site-engine/theme";
import { parseInput, recordAudit, type TenantContext } from "@storevia/tenancy";
import { DomainError } from "@storevia/types";
import { z } from "zod";
import { conflict, inSite, pgCode } from "./internal";

// A store's theme (ADR-0030 §7): one LIVE StoreTheme row with draft and
// published settings. Customising edits the draft (optimistic concurrency
// on settingsRevision); publishing copies it to the live settings, which
// emits theme.changed (trigger) so the public site refreshes. Settings are
// validated by the theme engine (bounded values, contrast) on every write;
// nothing else ever reaches the stylesheet.

const log = createLogger({ component: "site-admin" });

export interface StoreThemeView {
  readonly themeKey: string;
  readonly draft: ThemeSettings;
  readonly published: ThemeSettings;
  readonly revision: number;
  /** The draft differs from what visitors see. */
  readonly hasUnpublishedChanges: boolean;
}

interface ThemeRow {
  themeKey: string;
  draftSettings: unknown;
  publishedSettings: unknown;
  settingsRevision: number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function view(row: ThemeRow | undefined): StoreThemeView {
  if (!row) {
    return {
      themeKey: STOREVIA_THEME.key,
      draft: DEFAULT_THEME_SETTINGS,
      published: DEFAULT_THEME_SETTINGS,
      revision: 0,
      hasUnpublishedChanges: false,
    };
  }
  const draft = usableThemeSettings(row.draftSettings);
  const published =
    row.publishedSettings === null
      ? DEFAULT_THEME_SETTINGS
      : usableThemeSettings(row.publishedSettings);
  return {
    themeKey: row.themeKey,
    draft,
    published,
    revision: row.settingsRevision,
    hasUnpublishedChanges: !same(draft, published),
  };
}

export async function getStoreTheme(ctx: TenantContext): Promise<StoreThemeView> {
  return inSite(ctx, "design.edit", async (tx) => {
    const rows = await tx.$queryRaw<ThemeRow[]>`
      SELECT "themeKey", "draftSettings", "publishedSettings", "settingsRevision"
      FROM "StoreTheme" WHERE role = 'LIVE'`;
    return view(rows[0]);
  });
}

const THEME_CONFLICT =
  "The theme was changed somewhere else (another tab, device or person) after you opened it. Reload to see the latest settings.";

const saveSchema = z.strictObject({ revision: z.number().int().min(0), settings: z.unknown() });

/** Saves draft settings if nobody else saved since `revision`. */
export async function saveThemeDraft(ctx: TenantContext, input: unknown): Promise<StoreThemeView> {
  const data = parseInput(saveSchema, input);
  const parsed = themeSettingsSchema.safeParse(data.settings);
  if (!parsed.success) {
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
  const settings = JSON.stringify(parsed.data);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      let rows: ThemeRow[];
      if (data.revision === 0) {
        // The store's first customisation creates its theme row.
        try {
          rows = await tx.$queryRaw<ThemeRow[]>`
            INSERT INTO "StoreTheme" (id, "organisationId", "storeId", "themeKey", name, role,
                "draftSettings", "settingsRevision", "updatedAt")
            VALUES (gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid,
                    ${STOREVIA_THEME.key}, ${STOREVIA_THEME.name}, 'LIVE', ${settings}::jsonb, 1, now())
            RETURNING "themeKey", "draftSettings", "publishedSettings", "settingsRevision"`;
        } catch (error) {
          if (pgCode(error) === "23505") throw conflict(THEME_CONFLICT);
          throw error;
        }
      } else {
        rows = await tx.$queryRaw<ThemeRow[]>`
          UPDATE "StoreTheme" SET "draftSettings" = ${settings}::jsonb,
                 "settingsRevision" = "settingsRevision" + 1, "updatedAt" = now()
          WHERE role = 'LIVE' AND "settingsRevision" = ${data.revision}
          RETURNING "themeKey", "draftSettings", "publishedSettings", "settingsRevision"`;
      }
      if (!rows[0]) throw conflict(THEME_CONFLICT);
      await recordAudit(
        tx,
        store,
        "theme.draft_saved",
        { type: "Store", id: store.storeId },
        {
          preset: parsed.data.preset,
        },
      );
      return view(rows[0]);
    },
    { write: true },
  );
}

const publishSchema = z.strictObject({ revision: z.number().int().min(1) });

/** Makes the draft settings live (the ones the merchant is looking at). */
export async function publishTheme(ctx: TenantContext, input: unknown): Promise<StoreThemeView> {
  const data = parseInput(publishSchema, input);
  return inSite(
    ctx,
    "theme.publish",
    async (tx, store) => {
      const current = await tx.$queryRaw<ThemeRow[]>`
        SELECT "themeKey", "draftSettings", "publishedSettings", "settingsRevision"
        FROM "StoreTheme" WHERE role = 'LIVE' FOR UPDATE`;
      const row = current[0];
      if (row?.settingsRevision !== data.revision) throw conflict(THEME_CONFLICT);
      // Re-validated: nothing unvalidated is ever published.
      const settings = themeSettingsSchema.safeParse(row.draftSettings);
      if (!settings.success) {
        log.warn("theme publish refused: invalid draft", { storeId: store.storeId });
        throw conflict("These settings can't be published. Adjust them and save again.");
      }
      const json = JSON.stringify(settings.data);
      const updated = await tx.$queryRaw<ThemeRow[]>`
        UPDATE "StoreTheme" SET "publishedSettings" = ${json}::jsonb, "publishedAt" = now(),
               "publishedById" = ${store.userId}::uuid, "updatedAt" = now()
        WHERE role = 'LIVE'
        RETURNING "themeKey", "draftSettings", "publishedSettings", "settingsRevision"`;
      await recordAudit(
        tx,
        store,
        "theme.published",
        { type: "Store", id: store.storeId },
        {
          preset: settings.data.preset,
        },
      );
      return view(updated[0]);
    },
    { write: true },
  );
}
