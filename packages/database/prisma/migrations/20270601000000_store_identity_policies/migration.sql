-- Final pass, Phase 2A: store identity, policies and launch basics.
--
-- 1. StoreSellerProfile: the public seller identity a shopper sees on the
--    storefront (legal name, phone, business address; GSTIN held for Phase
--    2B). Kept apart from organisation and account data. One per store.
-- 2. StorePolicy: merchant-written policies (shipping, refunds,
--    cancellation, privacy, terms, contact), a draft and a published copy.
--    Storevia never writes their text.
-- 3. Product."hsnCode": the classification Phase 2B's GST rates will key on
--    (stored and validated only; no tax is calculated from it yet).
-- 4. The storefront reads the public identity through one function and only
--    published policies; changes invalidate the store's cached pages.
-- 5. Deleting an organisation erases the seller profile and policies.

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------
CREATE TYPE "StorePolicyKind" AS ENUM ('SHIPPING', 'REFUND', 'CANCELLATION', 'PRIVACY', 'TERMS', 'CONTACT');

CREATE TABLE "StoreSellerProfile" (
    "storeId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "legalName" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2),
    "gstin" TEXT,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreSellerProfile_pkey" PRIMARY KEY ("storeId")
);

CREATE TABLE "StorePolicy" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "kind" "StorePolicyKind" NOT NULL,
    "title" TEXT NOT NULL,
    "bodyDoc" JSONB,
    "publishedTitle" TEXT,
    "publishedDoc" JSONB,
    "publishedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StorePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreSellerProfile_storeId_organisationId_key" ON "StoreSellerProfile"("storeId", "organisationId");
CREATE UNIQUE INDEX "StorePolicy_storeId_kind_key" ON "StorePolicy"("storeId", "kind");
CREATE UNIQUE INDEX "StorePolicy_id_storeId_key" ON "StorePolicy"("id", "storeId");

ALTER TABLE "StoreSellerProfile" ADD CONSTRAINT "StoreSellerProfile_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorePolicy" ADD CONSTRAINT "StorePolicy_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bounded, printable values (no control characters, so nothing can break a
-- header, an email or a page), checked here as well as by the services.
ALTER TABLE "StoreSellerProfile"
  ADD CONSTRAINT "StoreSellerProfile_legal_name" CHECK ("legalName" IS NULL
    OR (char_length(btrim("legalName")) BETWEEN 1 AND 200 AND "legalName" !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "StoreSellerProfile_phone" CHECK (phone IS NULL OR phone ~ '^\+?[0-9][0-9 ()-]{5,30}$'),
  ADD CONSTRAINT "StoreSellerProfile_address_line1" CHECK ("addressLine1" IS NULL
    OR (char_length(btrim("addressLine1")) BETWEEN 1 AND 200 AND "addressLine1" !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "StoreSellerProfile_address_line2" CHECK ("addressLine2" IS NULL
    OR (char_length(btrim("addressLine2")) BETWEEN 1 AND 200 AND "addressLine2" !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "StoreSellerProfile_city" CHECK (city IS NULL
    OR (char_length(btrim(city)) BETWEEN 1 AND 100 AND city !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "StoreSellerProfile_region" CHECK (region IS NULL
    OR (char_length(btrim(region)) BETWEEN 1 AND 100 AND region !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "StoreSellerProfile_postal_code" CHECK ("postalCode" IS NULL
    OR "postalCode" ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,18}[A-Za-z0-9]$'),
  ADD CONSTRAINT "StoreSellerProfile_country" CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$'),
  -- India's GSTIN: state code, PAN, entity number, 'Z', check character.
  ADD CONSTRAINT "StoreSellerProfile_gstin" CHECK (gstin IS NULL
    OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

ALTER TABLE "StorePolicy"
  ADD CONSTRAINT "StorePolicy_title" CHECK (char_length(btrim(title)) BETWEEN 1 AND 120
    AND title !~ '[[:cntrl:]]'),
  ADD CONSTRAINT "StorePolicy_published_title" CHECK ("publishedTitle" IS NULL
    OR (char_length(btrim("publishedTitle")) BETWEEN 1 AND 120 AND "publishedTitle" !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "StorePolicy_body" CHECK ("bodyDoc" IS NULL
    OR (jsonb_typeof("bodyDoc") = 'object' AND octet_length("bodyDoc"::text) <= 262144)),
  ADD CONSTRAINT "StorePolicy_published_body" CHECK ("publishedDoc" IS NULL
    OR (jsonb_typeof("publishedDoc") = 'object' AND octet_length("publishedDoc"::text) <= 262144)),
  -- Published together or not at all.
  ADD CONSTRAINT "StorePolicy_published_together" CHECK (
    ("publishedDoc" IS NULL) = ("publishedTitle" IS NULL)
    AND ("publishedDoc" IS NULL) = ("publishedAt" IS NULL)),
  ADD CONSTRAINT "StorePolicy_revision_nonnegative" CHECK (revision >= 0);

-- ---------------------------------------------------------------------------
-- 6. Product classification for Phase 2B (HSN: 4, 6 or 8 digits).
-- ---------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN "hsnCode" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_hsn_code" CHECK ("hsnCode" IS NULL
  OR "hsnCode" ~ '^[0-9]{4}([0-9]{2}){0,2}$');

-- ---------------------------------------------------------------------------
-- 2. Row-level security: store-scoped like every tenant table (03 §5.2).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['StoreSellerProfile', 'StorePolicy'] LOOP
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

-- A policy's kind never changes (one row per kind and store).
CREATE TRIGGER "StorePolicy_kind_immutable" BEFORE UPDATE ON "StorePolicy"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('kind');

-- ---------------------------------------------------------------------------
-- 3. Merchant role: every write goes through @storevia/commerce's settings
--    services (RBAC, validation, concurrency).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "StoreSellerProfile", "StorePolicy" TO storevia_app;
GRANT UPDATE ("legalName", phone, "addressLine1", "addressLine2", city, region, "postalCode",
  "countryCode", gstin, "updatedById", "updatedAt") ON "StoreSellerProfile" TO storevia_app;
GRANT UPDATE (title, "bodyDoc", "publishedTitle", "publishedDoc", "publishedAt", revision,
  "updatedById", "updatedAt") ON "StorePolicy" TO storevia_app;
GRANT UPDATE ("hsnCode") ON "Product" TO storevia_app;

-- ---------------------------------------------------------------------------
-- 4. Storefront role: published policies only, and the public identity
--    through one function (the Store row itself stays unreadable).
-- ---------------------------------------------------------------------------
CREATE POLICY storefront_store ON "StorePolicy" AS RESTRICTIVE TO storevia_storefront
  USING ("storeId" = app_current_store() AND "publishedDoc" IS NOT NULL);
GRANT SELECT (id, "organisationId", "storeId", kind, "publishedTitle", "publishedDoc", "publishedAt")
  ON "StorePolicy" TO storevia_storefront;

-- The store's public identity: what the header, footer, favicon and contact
-- page show. GSTIN isn't returned until Phase 2B decides where it appears.
CREATE FUNCTION app_storefront_identity()
  RETURNS TABLE (name text, support_email text, contact_email text, logo_media_id uuid,
    favicon_media_id uuid, legal_name text, phone text, address_line1 text, address_line2 text,
    city text, region text, postal_code text, country_code text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT s.name, s."supportEmail", s."contactEmail", s."logoMediaId", s."faviconMediaId",
      p."legalName", p.phone, p."addressLine1", p."addressLine2", p.city, p.region,
      p."postalCode", p."countryCode"
    FROM "Store" s
    LEFT JOIN "StoreSellerProfile" p ON p."storeId" = s.id
    WHERE app_current_store() IS NOT NULL AND s.id = app_current_store()
  $$;
REVOKE ALL ON FUNCTION app_storefront_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_storefront_identity() TO storevia_storefront;

-- ---------------------------------------------------------------------------
-- 5. Invalidation: the seller identity, published policies and the store's
--    public emails change what every page's footer shows.
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
      WHEN 'store-child' THEN
        -- A row that belongs to one store and changes what its pages show
        -- (seller identity, published policies): the whole store.
        entity_type := 'Store';
        entity_id := store_id;
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

CREATE TRIGGER "StoreSellerProfile_outbox" AFTER INSERT OR UPDATE ON "StoreSellerProfile"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('store-child');
CREATE TRIGGER "StorePolicy_outbox_insert" AFTER INSERT ON "StorePolicy"
  FOR EACH ROW WHEN (NEW."publishedDoc" IS NOT NULL) EXECUTE FUNCTION app_outbox_emit('store-child');
CREATE TRIGGER "StorePolicy_outbox_update" AFTER UPDATE ON "StorePolicy"
  FOR EACH ROW WHEN ((OLD."publishedTitle", OLD."publishedDoc", OLD."publishedAt")
    IS DISTINCT FROM (NEW."publishedTitle", NEW."publishedDoc", NEW."publishedAt"))
  EXECUTE FUNCTION app_outbox_emit('store-child');

DROP TRIGGER "Store_outbox" ON "Store";
CREATE TRIGGER "Store_outbox" AFTER UPDATE ON "Store"
  FOR EACH ROW WHEN (
    (OLD.name, OLD.slug, OLD.status, OLD.currency, OLD.locale, OLD.country, OLD."logoMediaId",
      OLD."faviconMediaId", OLD."supportEmail", OLD."contactEmail")
    IS DISTINCT FROM
    (NEW.name, NEW.slug, NEW.status, NEW.currency, NEW.locale, NEW.country, NEW."logoMediaId",
      NEW."faviconMediaId", NEW."supportEmail", NEW."contactEmail"))
  EXECUTE FUNCTION app_outbox_emit('store');

-- ---------------------------------------------------------------------------
-- 7. Organisation deletion also erases the seller profile, policies and the
--    store's public emails and brand images.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_delete_organisation(target uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    o record;
    erased jsonb;
    n_members bigint; n_domains bigint; n_media bigint; n_connections bigint;
  BEGIN
    SELECT id INTO o FROM "Organisation"
      WHERE id = target AND status = 'PENDING_DELETION' AND "deletionScheduledAt" <= now()
      FOR UPDATE;
    IF o.id IS NULL THEN
      RETURN NULL;
    END IF;
    erased := app_erase_personal_data(target,
      (SELECT coalesce(array_agg(id), '{}') FROM "Order" WHERE "organisationId" = target),
      (SELECT coalesce(array_agg(id), '{}') FROM "Customer" WHERE "organisationId" = target),
      (SELECT coalesce(array_agg(DISTINCT lower(email)), '{}') FROM "Customer"
         WHERE "organisationId" = target AND email IS NOT NULL));
    -- Guest checkouts that never became orders or customers.
    UPDATE "Checkout" SET email = NULL, "shippingAddress" = NULL, "billingAddress" = NULL,
        "updatedAt" = now()
      WHERE "organisationId" = target
        AND (email IS NOT NULL OR "shippingAddress" IS NOT NULL OR "billingAddress" IS NOT NULL);
    DELETE FROM "StaffNotification" WHERE "organisationId" = target;
    DELETE FROM "MembershipStoreAccess" WHERE "organisationId" = target;
    DELETE FROM "Membership" WHERE "organisationId" = target;
    GET DIAGNOSTICS n_members = ROW_COUNT;
    UPDATE "Invitation" SET status = 'REVOKED', "updatedAt" = now()
      WHERE "organisationId" = target AND status = 'PENDING';
    DELETE FROM "StoreDomain" WHERE "organisationId" = target;
    GET DIAGNOSTICS n_domains = ROW_COUNT;
    UPDATE "PaymentProviderConnection" SET "credentialsCiphertext" = NULL, "keyVersion" = NULL,
        "credentialHint" = NULL, "externalAccountId" = NULL, status = 'DISABLED', "updatedAt" = now()
      WHERE "organisationId" = target;
    GET DIAGNOSTICS n_connections = ROW_COUNT;
    UPDATE "MediaAsset" SET status = 'DELETED', "deletedAt" = coalesce("deletedAt", now()),
        "updatedAt" = now()
      WHERE "organisationId" = target AND status <> 'DELETED';
    GET DIAGNOSTICS n_media = ROW_COUNT;
    -- Public seller identity and store policies (final pass, Phase 2A): a
    -- sole trader's name, address and phone are personal data.
    DELETE FROM "StoreSellerProfile" WHERE "organisationId" = target;
    DELETE FROM "StorePolicy" WHERE "organisationId" = target;
    UPDATE "Store" SET status = 'ARCHIVED', "supportEmail" = NULL, "contactEmail" = NULL,
        "logoMediaId" = NULL, "faviconMediaId" = NULL, "updatedAt" = now()
      WHERE "organisationId" = target;
    UPDATE "Subscription" SET status = 'EXPIRED', "endedAt" = coalesce("endedAt", now()),
        "updatedAt" = now()
      WHERE "organisationId" = target AND status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
    UPDATE "Organisation" SET status = 'DELETED', "deletedAt" = now(), "deletionScheduledAt" = NULL,
        name = 'Deleted organisation', "billingEmail" = NULL, "updatedAt" = now()
      WHERE id = target;
    INSERT INTO "AuditLog" (id, "organisationId", "actorType", action, "entityType", "entityId",
      metadata)
    VALUES (gen_random_uuid(), target, 'SYSTEM', 'organisation.deleted', 'Organisation', target,
      jsonb_build_object('count', n_members));
    RETURN erased || jsonb_build_object('members', n_members, 'domains', n_domains,
      'media', n_media, 'paymentConnections', n_connections);
  END
  $$;
