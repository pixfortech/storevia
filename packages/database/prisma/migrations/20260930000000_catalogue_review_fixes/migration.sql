-- Milestone 3 security review fixes (docs/architecture/11-testing.md,
-- "Milestone 3 security review"). Hand-written SQL only: no model changes,
-- so Prisma sees no drift.

-- ---------------------------------------------------------------------------
-- 1. Media references must point at live, ready media, and hold it (MEDIUM).
--    The same-store check only proved the asset existed. A reference could be
--    set to a soft-deleted asset, and a concurrent deleteMedia (which locks the
--    asset FOR UPDATE, counts references, then soft-deletes it and releases its
--    bytes) couldn't see an uncommitted reference, so a live product could end
--    up pointing at deleted, uncounted media. FOR SHARE conflicts with that
--    FOR UPDATE: whichever runs second waits, then sees the other's result.
--    ProductMedia gets the same trigger (its composite FK only proves the
--    asset shares the store).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_media_in_same_store() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    col text;
    media_id uuid;
    store_id uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  BEGIN
    FOREACH col IN ARRAY TG_ARGV[1:] LOOP
      media_id := (to_jsonb(NEW) ->> col)::uuid;
      IF media_id IS NOT NULL
        AND (TG_OP = 'INSERT' OR media_id IS DISTINCT FROM (to_jsonb(OLD) ->> col)::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM "MediaAsset" m
          WHERE m.id = media_id AND m."storeId" = store_id
            AND m."deletedAt" IS NULL AND m.status = 'READY'
          FOR SHARE)
      THEN
        RAISE EXCEPTION '%.% must reference ready media in the same store', TG_TABLE_NAME, col
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END LOOP;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER "ProductMedia_media_same_store" BEFORE INSERT OR UPDATE ON "ProductMedia"
  FOR EACH ROW EXECUTE FUNCTION app_media_in_same_store('storeId', 'mediaAssetId');

-- ---------------------------------------------------------------------------
-- 2. Parents and ids never move (LOW, defence in depth).
--    An option moved to another product would break "a variant's option
--    values come from its own product" without re-running that trigger, and
--    an id change on a row the ledger references would cascade into the
--    append-only InventoryMovement rows (ON UPDATE CASCADE) or orphan the
--    trigger-checked media references. The app never does either.
-- ---------------------------------------------------------------------------
CREATE TRIGGER "ProductOption_immutable_parent" BEFORE UPDATE ON "ProductOption"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id', 'productId');
CREATE TRIGGER "ProductOptionValue_immutable_parent" BEFORE UPDATE ON "ProductOptionValue"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id', 'optionId');
CREATE TRIGGER "Product_immutable_id" BEFORE UPDATE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id');
CREATE TRIGGER "ProductVariant_immutable_id" BEFORE UPDATE ON "ProductVariant"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id');
CREATE TRIGGER "InventoryItem_immutable_id" BEFORE UPDATE ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id');
CREATE TRIGGER "Location_immutable_id" BEFORE UPDATE ON "Location"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id');
CREATE TRIGGER "MediaAsset_immutable_id" BEFORE UPDATE ON "MediaAsset"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id');
CREATE TRIGGER "Collection_immutable_id" BEFORE UPDATE ON "Collection"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('id');

-- ---------------------------------------------------------------------------
-- 3. Storage keys follow the key grammar (packages/media/src/keys.ts).
--    Raw uploads move to their own, never-served prefix (MEDIUM: under the
--    asset's prefix a CDN serving the bucket would serve them too), and the
--    LIKE prefix check, which accepted "org/store/id/../../other/…", becomes
--    an exact pattern (LOW).
-- ---------------------------------------------------------------------------
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_storage_key_owned";
UPDATE "MediaAsset"
  SET "storageKey" = 'uploads/' || "organisationId"::text || '/' || "storeId"::text || '/' || id::text
  WHERE "storageKey" LIKE '%/upload';
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_storage_key_owned"
  CHECK (
    "storageKey" = 'uploads/' || "organisationId"::text || '/' || "storeId"::text || '/' || id::text
    OR "storageKey" ~ ('^' || "organisationId"::text || '/' || "storeId"::text || '/' || id::text
      || '/(original\.(jpg|png|webp|gif|avif)|w(320|640|1280|2048)\.webp)$'));

-- Renditions carry non-negative integer byte counts (LOW): a negative or
-- malformed value would lower the media_storage gauge or make it throw.
CREATE FUNCTION app_renditions_valid(renditions jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog
  AS $$
    SELECT renditions IS NULL OR (
      jsonb_typeof(renditions) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(renditions) r
        WHERE jsonb_typeof(r) <> 'object'
          OR coalesce(jsonb_typeof(r -> 'bytes'), 'missing') <> 'number'
          OR (r ->> 'bytes') !~ '^[0-9]{1,15}$'))
  $$;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_renditions_valid"
  CHECK (app_renditions_valid(renditions));

-- Collection descriptions are bounded like product descriptions (LOW).
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_description_html_length"
  CHECK ("descriptionHtml" IS NULL OR char_length("descriptionHtml") <= 200000);

-- ---------------------------------------------------------------------------
-- 4. Least privilege (LOW).
--    Trigger functions are SECURITY DEFINER: no role needs to call them
--    directly (triggers still fire), so nothing can use them to probe other
--    tenants' rows. Platform staff don't need object keys, and the system
--    role never counts usage (the app, worker and platform roles do).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION app_media_in_same_store(), app_variant_option_same_product(),
  app_variant_currency_matches_store() FROM PUBLIC;
REVOKE SELECT (renditions) ON "MediaAsset" FROM storevia_platform;
REVOKE EXECUTE ON FUNCTION app_usage_live_products(uuid), app_usage_media_bytes(uuid)
  FROM storevia_system;
