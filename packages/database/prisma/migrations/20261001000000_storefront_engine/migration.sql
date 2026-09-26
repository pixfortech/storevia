-- Milestone 4: storefront engine (ADR-0028). Promotes Page, PageVersion, Cart,
-- CartLine, OutboxEvent and StoreSlugHistory, and adds the storefront role's
-- access: one host resolver, sellable-only row policies and column grants.
-- storevia_storefront (LOGIN NOBYPASSRLS) is created by infrastructure /
-- `pnpm db:setup` beforehand.

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED', 'MERGED');

-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('HOME', 'STANDARD', 'PRODUCT_TEMPLATE', 'COLLECTION_TEMPLATE', 'SEARCH_TEMPLATE', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "PageVersionState" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "StoreSlugHistory" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "retiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSlugHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerId" UUID,
    "currency" CHAR(3) NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartLine" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "attributes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "kind" "PageKind" NOT NULL DEFAULT 'STANDARD',
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedVersionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVersion" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "state" "PageVersionState" NOT NULL DEFAULT 'DRAFT',
    "schemaVersion" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "documentHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "basedOnVersionId" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "publishedById" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreSlugHistory_slug_key" ON "StoreSlugHistory"("slug");

-- CreateIndex
CREATE INDEX "StoreSlugHistory_storeId_idx" ON "StoreSlugHistory"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_tokenHash_key" ON "Cart"("tokenHash");

-- CreateIndex
CREATE INDEX "Cart_storeId_status_updatedAt_idx" ON "Cart"("storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Cart_customerId_idx" ON "Cart"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_id_storeId_key" ON "Cart"("id", "storeId");

-- CreateIndex
CREATE INDEX "CartLine_storeId_idx" ON "CartLine"("storeId");

-- CreateIndex
CREATE INDEX "CartLine_variantId_idx" ON "CartLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartLine_cartId_variantId_key" ON "CartLine"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_publishedVersionId_key" ON "Page"("publishedVersionId");

-- CreateIndex
CREATE INDEX "Page_storeId_kind_idx" ON "Page"("storeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Page_id_storeId_key" ON "Page"("id", "storeId");

-- CreateIndex
CREATE INDEX "PageVersion_pageId_state_idx" ON "PageVersion"("pageId", "state");

-- CreateIndex
CREATE INDEX "PageVersion_storeId_idx" ON "PageVersion"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_pageId_versionNumber_key" ON "PageVersion"("pageId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_id_pageId_key" ON "PageVersion"("id", "pageId");

-- CreateIndex
CREATE INDEX "OutboxEvent_dispatchedAt_occurredAt_idx" ON "OutboxEvent"("dispatchedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_storeId_idx" ON "OutboxEvent"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_id_storeId_key" ON "OutboxEvent"("id", "storeId");

-- AddForeignKey
ALTER TABLE "StoreSlugHistory" ADD CONSTRAINT "StoreSlugHistory_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_cartId_storeId_fkey" FOREIGN KEY ("cartId", "storeId") REFERENCES "Cart"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_variantId_storeId_fkey" FOREIGN KEY ("variantId", "storeId") REFERENCES "ProductVariant"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "PageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_pageId_storeId_fkey" FOREIGN KEY ("pageId", "storeId") REFERENCES "Page"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 1. Row-level security: every new table is store-scoped (03-tenancy §5.2).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['StoreSlugHistory', 'Cart', 'CartLine', 'Page', 'PageVersion',
    'OutboxEvent'] LOOP
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
-- 2. Pages (erd.md §4.6, 07-page-builder-document.md §9).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "Page_handle_live" ON "Page" ("storeId", handle) WHERE "deletedAt" IS NULL;
-- One home, product template, … per store; any number of standard pages.
CREATE UNIQUE INDEX "Page_special_kind_live"
  ON "Page" ("storeId", kind) WHERE kind <> 'STANDARD' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "PageVersion_one_draft" ON "PageVersion" ("pageId") WHERE state = 'DRAFT';
CREATE UNIQUE INDEX "PageVersion_one_published" ON "PageVersion" ("pageId") WHERE state = 'PUBLISHED';

ALTER TABLE "Page"
  ADD CONSTRAINT "Page_title_length" CHECK (char_length(btrim(title)) BETWEEN 1 AND 255),
  ADD CONSTRAINT "Page_handle_format"
    CHECK (handle ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(handle) <= 100),
  ADD CONSTRAINT "Page_seo_length"
    CHECK ((("seoTitle" IS NULL) OR char_length("seoTitle") <= 255)
      AND (("seoDescription" IS NULL) OR char_length("seoDescription") <= 1000));

ALTER TABLE "PageVersion"
  ADD CONSTRAINT "PageVersion_version_positive" CHECK ("versionNumber" >= 1),
  ADD CONSTRAINT "PageVersion_schema_version_positive" CHECK ("schemaVersion" >= 1),
  ADD CONSTRAINT "PageVersion_revision_nonnegative" CHECK (revision >= 0),
  ADD CONSTRAINT "PageVersion_document_hash_format" CHECK ("documentHash" ~ '^[0-9a-f]{64}$'),
  -- 07 §7: a serialised document is at most 1 MiB.
  ADD CONSTRAINT "PageVersion_document_size"
    CHECK (jsonb_typeof(document) = 'object' AND octet_length(document::text) <= 1048576),
  ADD CONSTRAINT "PageVersion_published_has_date" CHECK (state <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

-- A version is frozen once it leaves DRAFT; the only later change is
-- PUBLISHED -> ARCHIVED. A version's page and number never change.
CREATE FUNCTION app_page_version_frozen() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NEW."pageId" IS DISTINCT FROM OLD."pageId"
      OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
      OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'a page version never moves' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.state = 'DRAFT' THEN
      RETURN NEW;
    END IF;
    IF NEW.state = OLD.state AND to_jsonb(NEW) - 'updatedAt' = to_jsonb(OLD) - 'updatedAt' THEN
      RETURN NEW;
    END IF;
    IF OLD.state = 'PUBLISHED' AND NEW.state = 'ARCHIVED'
      AND (to_jsonb(NEW) - 'state' - 'updatedAt') = (to_jsonb(OLD) - 'state' - 'updatedAt') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'page version % is % and can no longer change', OLD.id, OLD.state
      USING ERRCODE = 'check_violation';
  END
  $$;
CREATE TRIGGER "PageVersion_frozen" BEFORE UPDATE ON "PageVersion"
  FOR EACH ROW EXECUTE FUNCTION app_page_version_frozen();

-- At commit, a page's published pointer names one of its own PUBLISHED
-- versions, and no PUBLISHED version is left without its page pointing at
-- it. Deferred, so publishPage() can archive the old version before it swaps
-- the pointer. (A composite FK (publishedVersionId, id) -> (id, pageId) would
-- express "its own", but Prisma can't model it and would drop it as drift.)
CREATE FUNCTION app_page_published_pointer() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    page_id uuid := (to_jsonb(NEW) ->> CASE WHEN TG_TABLE_NAME = 'Page' THEN 'id' ELSE 'pageId' END)::uuid;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM "Page" p JOIN "PageVersion" v ON v.id = p."publishedVersionId"
      WHERE p.id = page_id AND (v.state <> 'PUBLISHED' OR v."pageId" <> p.id))
    THEN
      RAISE EXCEPTION 'page % points at a version that is not its own published one', page_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "PageVersion" v JOIN "Page" p ON p.id = v."pageId"
      WHERE v."pageId" = page_id AND v.state = 'PUBLISHED'
        AND p."publishedVersionId" IS DISTINCT FROM v.id)
    THEN
      RAISE EXCEPTION 'page % has a published version it does not point at', page_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END
  $$;
CREATE CONSTRAINT TRIGGER "Page_published_pointer" AFTER INSERT OR UPDATE ON "Page"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_page_published_pointer();
CREATE CONSTRAINT TRIGGER "PageVersion_published_pointer" AFTER INSERT OR UPDATE ON "PageVersion"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_page_published_pointer();

-- ---------------------------------------------------------------------------
-- 3. Carts (06-storefront.md §6, ADR-0028 §8). No prices are stored.
--    customerId has no foreign key until customers exist (M6).
-- ---------------------------------------------------------------------------
ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_token_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "Cart_currency_format" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Cart_customer_unused" CHECK ("customerId" IS NULL);
ALTER TABLE "CartLine"
  ADD CONSTRAINT "CartLine_quantity_range" CHECK (quantity BETWEEN 1 AND 99),
  ADD CONSTRAINT "CartLine_attributes_object"
    CHECK (attributes IS NULL OR (jsonb_typeof(attributes) = 'object'
      AND octet_length(attributes::text) <= 2000));
CREATE TRIGGER "Cart_immutable_id" BEFORE UPDATE ON "Cart"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id', 'tokenHash', 'currency');
CREATE TRIGGER "CartLine_immutable_parent" BEFORE UPDATE ON "CartLine"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id', 'cartId', 'variantId');

-- A cart is priced in its store's currency.
CREATE FUNCTION app_cart_currency_matches_store() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NEW.currency IS DISTINCT FROM (SELECT currency FROM "Store" WHERE id = NEW."storeId") THEN
      RAISE EXCEPTION 'cart currency % does not match the store currency', NEW.currency
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "Cart_store_currency" BEFORE INSERT ON "Cart"
  FOR EACH ROW EXECUTE FUNCTION app_cart_currency_matches_store();

-- ---------------------------------------------------------------------------
-- 4. Outbox (ADR-0028 §9): written in the same transaction as the change,
--    ids only in the payload, claimed by the worker.
-- ---------------------------------------------------------------------------
ALTER TABLE "OutboxEvent"
  ADD CONSTRAINT "OutboxEvent_type_format" CHECK (type ~ '^[a-z]+(\.[a-z_]+)+$' AND char_length(type) <= 100),
  ADD CONSTRAINT "OutboxEvent_entity_type_format" CHECK ("entityType" ~ '^[A-Z][A-Za-z]{1,49}$'),
  ADD CONSTRAINT "OutboxEvent_payload_object"
    CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 4000);
CREATE INDEX "OutboxEvent_undispatched" ON "OutboxEvent" ("occurredAt") WHERE "dispatchedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Slug history (ADR-0028 §12): a retired slug is never claimable by
--    another store. The check runs as the owner so it sees every store's
--    history, and reports the same unique violation as a taken slug.
-- ---------------------------------------------------------------------------
ALTER TABLE "StoreSlugHistory"
  ADD CONSTRAINT "StoreSlugHistory_slug_format"
    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$');
CREATE FUNCTION app_store_slug_not_retired() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM "StoreSlugHistory" h WHERE h.slug = NEW.slug AND h."storeId" <> NEW.id) THEN
      RAISE EXCEPTION 'duplicate key value violates unique constraint "Store_slug_key"'
        USING ERRCODE = 'unique_violation', CONSTRAINT = 'Store_slug_key';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "Store_slug_not_retired" BEFORE INSERT OR UPDATE OF slug ON "Store"
  FOR EACH ROW EXECUTE FUNCTION app_store_slug_not_retired();
CREATE TRIGGER "StoreSlugHistory_immutable" BEFORE UPDATE ON "StoreSlugHistory"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id', 'slug', 'retiredAt');

-- ---------------------------------------------------------------------------
-- 6. Storefront access (ADR-0028 §2).
-- ---------------------------------------------------------------------------

-- 6a. Host resolution: the only cross-tenant read. ACTIVE domains only; the
--     primary host is the store's ACTIVE primary domain (null if none).
CREATE FUNCTION app_storefront_resolve(host text)
  RETURNS TABLE (
    store_id uuid,
    organisation_id uuid,
    store_status "StoreStatus",
    organisation_status "OrganisationStatus",
    hostname text,
    is_primary boolean,
    primary_hostname text,
    store_name text,
    currency char(3),
    locale text,
    country char(2))
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT s.id, s."organisationId", s.status, o.status, d.hostname, d."isPrimary",
           (SELECT p.hostname FROM "StoreDomain" p
             WHERE p."storeId" = s.id AND p."isPrimary" AND p.status = 'ACTIVE'),
           s.name, s.currency, s.locale, s.country
    FROM "StoreDomain" d
    JOIN "Store" s ON s.id = d."storeId"
    JOIN "Organisation" o ON o.id = s."organisationId"
    WHERE d.hostname = host AND d.status = 'ACTIVE'
  $$;

-- 6b. Availability: one boolean per sellable variant of the current store,
--     never a count. Untracked or oversellable variants are available.
CREATE FUNCTION app_storefront_availability(variant_ids uuid[])
  RETURNS TABLE (variant_id uuid, available boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT v.id,
      CASE WHEN ii.id IS NULL OR NOT ii.tracked OR v."inventoryPolicy" = 'CONTINUE' THEN true
        ELSE coalesce((
          SELECT sum(l.available) FROM "InventoryLevel" l
          JOIN "Location" loc ON loc.id = l."locationId" AND loc."isActive" AND loc."deletedAt" IS NULL
          WHERE l."inventoryItemId" = ii.id), 0) > 0
      END
    FROM "ProductVariant" v
    JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN "InventoryItem" ii ON ii."variantId" = v.id
    WHERE app_current_store() IS NOT NULL
      AND v."storeId" = app_current_store()
      AND v.id = ANY (variant_ids)
      AND v."deletedAt" IS NULL
      AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL
  $$;

REVOKE ALL ON FUNCTION app_storefront_resolve(text), app_storefront_availability(uuid[]),
  app_page_version_frozen(), app_page_published_pointer(), app_cart_currency_matches_store(),
  app_store_slug_not_retired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_storefront_resolve(text), app_storefront_availability(uuid[]),
  app_current_org(), app_current_store(), catalogue_search_document(text, text, text, text, text[])
  TO storevia_storefront;

-- 6c. Restrictive policies: whatever a read model asks for, the storefront
--     role only ever sees its own store's sellable rows.
CREATE POLICY storefront_store ON "Product" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND status = 'ACTIVE' AND "deletedAt" IS NULL);
CREATE POLICY storefront_store ON "ProductVariant" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND "deletedAt" IS NULL
    AND EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId"));
CREATE POLICY storefront_store ON "ProductOption" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId"));
CREATE POLICY storefront_store ON "ProductOptionValue" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store()
    AND EXISTS (SELECT 1 FROM "ProductOption" o WHERE o.id = "optionId"));
CREATE POLICY storefront_store ON "ProductVariantOptionValue" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store()
    AND EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v.id = "variantId"));
CREATE POLICY storefront_store ON "ProductMedia" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId"));
CREATE POLICY storefront_store ON "Collection" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND "archivedAt" IS NULL AND "deletedAt" IS NULL);
CREATE POLICY storefront_store ON "CollectionProduct" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store()
    AND EXISTS (SELECT 1 FROM "Collection" c WHERE c.id = "collectionId"));
CREATE POLICY storefront_store ON "MediaAsset" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND status = 'READY' AND "deletedAt" IS NULL);
CREATE POLICY storefront_store ON "Page" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND "deletedAt" IS NULL);
CREATE POLICY storefront_store ON "PageVersion" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND state = 'PUBLISHED');
CREATE POLICY storefront_store ON "Cart" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store()) WITH CHECK ("storeId" = app_current_store());
CREATE POLICY storefront_store ON "CartLine" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store()) WITH CHECK ("storeId" = app_current_store());

-- 6d. Column grants: public fields only (no cost, barcode, audit authors,
--     editor JSON, smart-collection rules or storage internals beyond keys).
GRANT SELECT (id, "organisationId", "storeId", title, handle, status, "descriptionHtml",
  "productType", vendor, tags, "seoTitle", "seoDescription", "publishedAt", "createdAt",
  "updatedAt", "deletedAt") ON "Product" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", "productId", title, currency, "priceAmount",
  "compareAtAmount", "imageMediaId", position, "deletedAt") ON "ProductVariant" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", "productId", name, position)
  ON "ProductOption" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", "optionId", value, position)
  ON "ProductOptionValue" TO storevia_storefront;
GRANT SELECT ("organisationId", "storeId", "variantId", "optionId", "optionValueId")
  ON "ProductVariantOptionValue" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", "productId", "mediaAssetId", position, "altText")
  ON "ProductMedia" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", title, handle, "sortOrder", "descriptionHtml",
  "imageMediaId", "seoTitle", "seoDescription", "createdAt", "updatedAt", "archivedAt", "deletedAt")
  ON "Collection" TO storevia_storefront;
GRANT SELECT ("organisationId", "storeId", "collectionId", "productId", position, "createdAt")
  ON "CollectionProduct" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", status, "mimeType", width, height, "storageKey",
  "altText", renditions, "deletedAt") ON "MediaAsset" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", kind, title, handle, "seoTitle", "seoDescription",
  "publishedVersionId", "updatedAt", "deletedAt") ON "Page" TO storevia_storefront;
GRANT SELECT (id, "organisationId", "storeId", "pageId", state, "schemaVersion", document,
  "publishedAt") ON "PageVersion" TO storevia_storefront;
GRANT SELECT, INSERT, UPDATE ON "Cart" TO storevia_storefront;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CartLine" TO storevia_storefront;

-- 6e. Cart rate limits share the RateLimit table, confined to "storefront:"
--     buckets as the marketing role is to its own (ADR-0025).
CREATE POLICY storefront_own_buckets ON "RateLimit" TO storevia_storefront
  USING (key LIKE 'storefront:%') WITH CHECK (key LIKE 'storefront:%');
GRANT SELECT, INSERT, UPDATE ON "RateLimit" TO storevia_storefront;

-- ---------------------------------------------------------------------------
-- 7. Other roles.
-- ---------------------------------------------------------------------------
-- Services write outbox events without reading them back.
GRANT INSERT ON "OutboxEvent" TO storevia_app, storevia_platform;
-- The worker claims, marks and purges them.
GRANT SELECT, UPDATE ("dispatchedAt"), DELETE ON "OutboxEvent" TO storevia_worker;
-- Slug changes (ADR-0028 §12): the store's own history, and its slug.
GRANT SELECT, INSERT ON "StoreSlugHistory" TO storevia_app;
GRANT UPDATE (slug) ON "Store" TO storevia_app;
