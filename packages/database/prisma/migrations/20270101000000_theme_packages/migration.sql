-- Milestone 7: first-party theme packages (docs/architecture/08-themes.md
-- §10, ADR-0030 §7). A store can install each first-party theme once
-- (UNPUBLISHED), customise and preview it, and publish it (it becomes the
-- one LIVE row; the previous LIVE row stays installed, UNPUBLISHED, with its
-- settings). Adds the theme version the settings were saved for, the
-- editors' choice of which installed theme the preview shows, and lets the
-- storefront's preview read that theme's draft settings.

-- ---------------------------------------------------------------------------
-- 1. Columns and constraints.
-- ---------------------------------------------------------------------------
ALTER TABLE "StoreTheme"
  ADD COLUMN "themeVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "previewedAt" TIMESTAMPTZ(3);

ALTER TABLE "StoreTheme"
  ADD CONSTRAINT "StoreTheme_version_positive" CHECK ("themeVersion" >= 1);

-- One installation of each theme per store (existing stores have at most
-- their one LIVE row, so this can't fail on existing data).
CREATE UNIQUE INDEX "StoreTheme_storeId_themeKey_key" ON "StoreTheme"("storeId", "themeKey");

-- The merchant role (through @storevia/site-admin) records the version and
-- the preview choice; nothing else changes.
GRANT UPDATE ("themeVersion", "previewedAt") ON "StoreTheme" TO storevia_app;

-- ---------------------------------------------------------------------------
-- 2. The storefront's theme: the LIVE row's published settings; in a
--    verified preview, the draft settings of the installed theme an editor
--    chose to preview most recently (the LIVE one when nobody chose one).
--    UNPUBLISHED rows are never visible outside a preview: the restrictive
--    storefront policy still shows only LIVE rows, and this function only
--    looks further when app.preview is on.
-- ---------------------------------------------------------------------------
DROP FUNCTION app_storefront_theme_settings();

CREATE FUNCTION app_storefront_theme_settings()
  RETURNS TABLE (theme_key text, theme_version integer, live boolean, settings jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t."themeKey", t."themeVersion", t.role = 'LIVE',
      CASE WHEN app_storefront_preview() THEN t."draftSettings" ELSE t."publishedSettings" END
    FROM "StoreTheme" t
    WHERE app_current_store() IS NOT NULL
      AND t."storeId" = app_current_store()
      AND (t.role = 'LIVE' OR app_storefront_preview())
    ORDER BY CASE WHEN app_storefront_preview() THEN t."previewedAt" END DESC NULLS LAST,
      (t.role = 'LIVE') DESC
    LIMIT 1
  $$;

REVOKE ALL ON FUNCTION app_storefront_theme_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_storefront_theme_settings() TO storevia_storefront;

-- ---------------------------------------------------------------------------
-- 3. Invalidation: a new theme version on the live row changes what
--    visitors see (settings are migrated on read), like its settings, role
--    or key. Preview choices change nothing public and emit nothing.
-- ---------------------------------------------------------------------------
DROP TRIGGER "StoreTheme_outbox_update" ON "StoreTheme";
CREATE TRIGGER "StoreTheme_outbox_update" AFTER UPDATE ON "StoreTheme"
  FOR EACH ROW WHEN (OLD."publishedSettings" IS DISTINCT FROM NEW."publishedSettings"
    OR OLD.role IS DISTINCT FROM NEW.role OR OLD."themeKey" IS DISTINCT FROM NEW."themeKey"
    OR (NEW.role = 'LIVE' AND OLD."themeVersion" IS DISTINCT FROM NEW."themeVersion"))
  EXECUTE FUNCTION app_outbox_emit('theme');
