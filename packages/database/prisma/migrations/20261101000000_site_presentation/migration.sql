-- Milestone 5: site presentation (ADR-0030). Promotes StoreTheme and
-- Navigation (items as validated JSON links, §8), gives the merchant role
-- the page, theme and navigation grants its services need, lets the
-- storefront read drafts only inside a verified preview (§6), emits
-- theme/navigation invalidation events (§10), and gives every store a
-- published HOME page, now and on creation (§9).

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------
CREATE TYPE "StoreThemeRole" AS ENUM ('LIVE', 'UNPUBLISHED');

CREATE TABLE "StoreTheme" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "themeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StoreThemeRole" NOT NULL DEFAULT 'UNPUBLISHED',
    "draftSettings" JSONB NOT NULL,
    "publishedSettings" JSONB,
    "settingsRevision" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ(3),
    "publishedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreTheme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Navigation" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Navigation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreTheme_storeId_idx" ON "StoreTheme"("storeId");
CREATE UNIQUE INDEX "Navigation_storeId_handle_key" ON "Navigation"("storeId", "handle");
CREATE UNIQUE INDEX "Navigation_id_storeId_key" ON "Navigation"("id", "storeId");

ALTER TABLE "StoreTheme" ADD CONSTRAINT "StoreTheme_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Navigation" ADD CONSTRAINT "Navigation_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live theme per store; bounded, well-formed values.
CREATE UNIQUE INDEX "StoreTheme_one_live" ON "StoreTheme" ("storeId") WHERE role = 'LIVE';
ALTER TABLE "StoreTheme"
  ADD CONSTRAINT "StoreTheme_key_format" CHECK ("themeKey" ~ '^[a-z][a-z0-9-]{1,40}$'),
  ADD CONSTRAINT "StoreTheme_name_length" CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  ADD CONSTRAINT "StoreTheme_revision_nonnegative" CHECK ("settingsRevision" >= 0),
  ADD CONSTRAINT "StoreTheme_draft_settings"
    CHECK (jsonb_typeof("draftSettings") = 'object' AND octet_length("draftSettings"::text) <= 16384),
  ADD CONSTRAINT "StoreTheme_published_settings"
    CHECK ("publishedSettings" IS NULL
      OR (jsonb_typeof("publishedSettings") = 'object'
        AND octet_length("publishedSettings"::text) <= 16384
        AND "publishedAt" IS NOT NULL));

ALTER TABLE "Navigation"
  ADD CONSTRAINT "Navigation_handle_known" CHECK (handle IN ('main', 'footer')),
  ADD CONSTRAINT "Navigation_title_length" CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  ADD CONSTRAINT "Navigation_revision_nonnegative" CHECK (revision >= 0),
  ADD CONSTRAINT "Navigation_items_bounded"
    CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 20
      AND octet_length(items::text) <= 65536);

-- ---------------------------------------------------------------------------
-- 2. Row-level security: store-scoped like every tenant table (03 §5.2).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['StoreTheme', 'Navigation'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organisationId" = app_current_org()
           AND (app_current_store() IS NULL OR "storeId" = app_current_store()))
         WITH CHECK ("organisationId" = app_current_org()
           AND (app_current_store() IS NULL OR "storeId" = app_current_store()))', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change()', t || '_immutable_owner', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Merchant role (storevia_app): pages, themes and navigation. Every write
--    goes through @storevia/site-admin (RBAC, validation, concurrency);
--    published documents stay frozen by trigger whatever the grants.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "Page", "PageVersion", "StoreTheme", "Navigation" TO storevia_app;
GRANT UPDATE (title, handle, "seoTitle", "seoDescription", "publishedVersionId", "updatedAt",
  "deletedAt") ON "Page" TO storevia_app;
GRANT UPDATE (state, "schemaVersion", document, "documentHash", revision, "basedOnVersionId",
  "updatedById", "publishedById", "publishedAt", "updatedAt") ON "PageVersion" TO storevia_app;
GRANT UPDATE ("themeKey", name, role, "draftSettings", "publishedSettings", "settingsRevision",
  "publishedAt", "publishedById", "updatedAt") ON "StoreTheme" TO storevia_app;
GRANT UPDATE (title, items, revision, "updatedById", "updatedAt") ON "Navigation" TO storevia_app;
-- The builder canvas reads the catalogue with the storefront's read model
-- inside the merchant's own (store-scoped) transaction.
GRANT EXECUTE ON FUNCTION app_storefront_availability(uuid[]) TO storevia_app;

-- ---------------------------------------------------------------------------
-- 4. Storefront role: published content, and drafts only in a preview.
--    `app.preview` is set transaction-locally by the Site Engine only for a
--    request carrying a verified, store-bound preview token.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_storefront_preview() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.preview', true), '') = 'on' $$;

DROP POLICY storefront_store ON "PageVersion";
CREATE POLICY storefront_store ON "PageVersion" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store()
    AND (state = 'PUBLISHED' OR (state = 'DRAFT' AND app_storefront_preview())));

CREATE POLICY storefront_store ON "StoreTheme" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND role = 'LIVE');
CREATE POLICY storefront_store ON "Navigation" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store());

-- Draft theme settings aren't a readable column: they come through this
-- function, and only in a preview.
GRANT SELECT (id, "organisationId", "storeId", "themeKey", role, "publishedSettings")
  ON "StoreTheme" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", handle, items) ON "Navigation" TO storevia_storefront;

CREATE FUNCTION app_storefront_theme_settings()
  RETURNS TABLE (theme_key text, settings jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t."themeKey",
      CASE WHEN app_storefront_preview() THEN t."draftSettings" ELSE t."publishedSettings" END
    FROM "StoreTheme" t
    WHERE app_current_store() IS NOT NULL
      AND t."storeId" = app_current_store() AND t.role = 'LIVE'
  $$;

REVOKE ALL ON FUNCTION app_storefront_preview(), app_storefront_theme_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_storefront_preview(), app_storefront_theme_settings()
  TO storevia_storefront;

-- ---------------------------------------------------------------------------
-- 5. Invalidation events (ADR-0030 §10): published theme settings and menus.
--    Draft theme edits change nothing public, so they emit nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_outbox_emit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    rec jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
    mode text := TG_ARGV[0];
    org_id uuid := (rec ->> 'organisationId')::uuid;
    store_id uuid := (rec ->> 'storeId')::uuid;
    entity_type text;
    entity_id uuid;
    event_type text;
    payload jsonb := '{}'::jsonb;
  BEGIN
    CASE mode
      WHEN 'product' THEN
        entity_type := 'Product';
        entity_id := coalesce((rec ->> 'productId')::uuid, (rec ->> 'id')::uuid);
        event_type := 'product.changed';
      WHEN 'option-value' THEN
        entity_type := 'Product';
        SELECT o."productId" INTO entity_id FROM "ProductOption" o WHERE o.id = (rec ->> 'optionId')::uuid;
        event_type := 'product.changed';
      WHEN 'inventory-item' THEN
        entity_type := 'Product';
        SELECT v."productId" INTO entity_id FROM "ProductVariant" v WHERE v.id = (rec ->> 'variantId')::uuid;
        event_type := 'product.availability_changed';
      WHEN 'inventory-level' THEN
        entity_type := 'Product';
        SELECT v."productId" INTO entity_id
          FROM "InventoryItem" i JOIN "ProductVariant" v ON v.id = i."variantId"
          WHERE i.id = (rec ->> 'inventoryItemId')::uuid;
        event_type := 'product.availability_changed';
      WHEN 'collection' THEN
        entity_type := 'Collection';
        entity_id := coalesce((rec ->> 'collectionId')::uuid, (rec ->> 'id')::uuid);
        event_type := 'collection.changed';
      WHEN 'page' THEN
        entity_type := 'Page';
        entity_id := coalesce((rec ->> 'pageId')::uuid, (rec ->> 'id')::uuid);
        event_type := 'page.changed';
      WHEN 'theme' THEN
        entity_type := 'StoreTheme';
        entity_id := (rec ->> 'id')::uuid;
        event_type := 'theme.changed';
      WHEN 'navigation' THEN
        entity_type := 'Navigation';
        entity_id := (rec ->> 'id')::uuid;
        event_type := 'navigation.changed';
      WHEN 'location' THEN
        -- Activating or deactivating a location can flip any product's availability.
        entity_type := 'Store';
        entity_id := store_id;
        event_type := 'store.inventory_changed';
      WHEN 'store' THEN
        entity_type := 'Store';
        entity_id := (rec ->> 'id')::uuid;
        store_id := entity_id;
        event_type := 'store.changed';
      WHEN 'domain' THEN
        entity_type := 'StoreDomain';
        entity_id := (rec ->> 'id')::uuid;
        event_type := 'domain.changed';
        payload := jsonb_build_object('hostnames', to_jsonb(array_remove(ARRAY[
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ->> 'hostname' END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ->> 'hostname' END], NULL)));
      ELSE
        RAISE EXCEPTION 'unknown outbox mode %', mode;
    END CASE;
    -- A row whose parent is already gone (cascades) has nothing left to show.
    IF entity_id IS NULL OR store_id IS NULL OR org_id IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO "OutboxEvent" (id, "organisationId", "storeId", type, "entityType", "entityId", payload)
      VALUES (gen_random_uuid(), org_id, store_id, event_type, entity_type, entity_id, payload);
    RETURN NULL;
  END
  $$;

CREATE TRIGGER "StoreTheme_outbox_insert" AFTER INSERT ON "StoreTheme"
  FOR EACH ROW WHEN (NEW.role = 'LIVE' AND NEW."publishedSettings" IS NOT NULL)
  EXECUTE FUNCTION app_outbox_emit('theme');
CREATE TRIGGER "StoreTheme_outbox_update" AFTER UPDATE ON "StoreTheme"
  FOR EACH ROW WHEN (OLD."publishedSettings" IS DISTINCT FROM NEW."publishedSettings"
    OR OLD.role IS DISTINCT FROM NEW.role OR OLD."themeKey" IS DISTINCT FROM NEW."themeKey")
  EXECUTE FUNCTION app_outbox_emit('theme');
CREATE TRIGGER "Navigation_outbox" AFTER INSERT OR UPDATE OR DELETE ON "Navigation"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('navigation');

-- ---------------------------------------------------------------------------
-- 6. Every store has a published HOME page (ADR-0030 §9). The starter
--    documents equal @storevia/commerce/blocks STORE_HOME_DOCUMENT
--    (ecommerce) and @storevia/editor/templates SITE_HOME_DOCUMENT (other
--    business types); a test compares them. Deterministic node ids,
--    idempotent, and the owner comes from the store row itself.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_home_document(business_type "BusinessType") RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT CASE WHEN business_type = 'ECOMMERCE' THEN
      '{"schemaVersion":1,"root":[
        {"id":"dfHomeHero01","type":"hero","props":{"heading":"","subheading":"","cta":{"label":"Shop all products","link":{"type":"search"}},"secondaryCta":null,"image":null,"align":"center","height":"standard"},"styles":{}},
        {"id":"dfHomeColls1","type":"collection-list","props":{"heading":"Shop by collection","source":{"type":"all"},"limit":8,"columns":4,"background":"default","spacing":"standard"},"styles":{}},
        {"id":"dfHomeProds1","type":"featured-products","props":{"heading":"Latest products","source":{"type":"catalogue"},"limit":8,"columns":4,"action":null,"background":"default","spacing":"standard"},"styles":{}}
      ]}'::jsonb
    ELSE
      '{"schemaVersion":1,"root":[
        {"id":"dfHomeHero01","type":"hero","props":{"heading":"","subheading":"","cta":null,"secondaryCta":null,"image":null,"align":"center","height":"standard"},"styles":{}}
      ]}'::jsonb
    END
  $$;

CREATE FUNCTION app_ensure_home_page(target_store uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    s record;
    page_id uuid := gen_random_uuid();
    version_id uuid := gen_random_uuid();
    doc jsonb;
  BEGIN
    SELECT id, "organisationId", "businessType" INTO s FROM "Store" WHERE id = target_store;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM "Page" p
               WHERE p."storeId" = s.id AND p.kind = 'HOME' AND p."deletedAt" IS NULL) THEN
      RETURN;
    END IF;
    doc := app_home_document(s."businessType");
    INSERT INTO "Page" (id, "organisationId", "storeId", kind, title, handle, "updatedAt")
      VALUES (page_id, s."organisationId", s.id, 'HOME', 'Home', 'home', now());
    INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state,
        "schemaVersion", document, "documentHash", "publishedAt", "updatedAt")
      VALUES (version_id, s."organisationId", s.id, page_id, 1, 'PUBLISHED', 1, doc,
        encode(sha256(convert_to(doc::text, 'UTF8')), 'hex'), now(), now());
    UPDATE "Page" SET "publishedVersionId" = version_id WHERE id = page_id;
  END
  $$;

CREATE FUNCTION app_store_home_page() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    PERFORM app_ensure_home_page(NEW.id);
    RETURN NULL;
  END
  $$;

CREATE TRIGGER "Store_home_page" AFTER INSERT ON "Store"
  FOR EACH ROW EXECUTE FUNCTION app_store_home_page();

REVOKE ALL ON FUNCTION app_home_document("BusinessType"), app_ensure_home_page(uuid),
  app_store_home_page() FROM PUBLIC;

-- Existing stores (a store whose home page was published in M4 keeps it).
DO $$
DECLARE
  sid uuid;
BEGIN
  FOR sid IN SELECT id FROM "Store" ORDER BY id LOOP
    PERFORM app_ensure_home_page(sid);
  END LOOP;
END
$$;
