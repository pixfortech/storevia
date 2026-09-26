-- Milestone 4: cache invalidation events (ADR-0028 §9). Every change a
-- shopper could see writes an OutboxEvent in the same transaction, from the
-- database itself, so no service (dashboard, platform staff, worker, or one
-- written later) can forget to. Events carry ids only; the worker maps them
-- to cache tags. No schema change, so Prisma sees no drift.

CREATE FUNCTION app_outbox_emit() RETURNS trigger
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

-- Catalogue content.
CREATE TRIGGER "Product_outbox" AFTER INSERT OR UPDATE OR DELETE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('product');
CREATE TRIGGER "ProductVariant_outbox" AFTER INSERT OR UPDATE OR DELETE ON "ProductVariant"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('product');
CREATE TRIGGER "ProductOption_outbox" AFTER INSERT OR UPDATE OR DELETE ON "ProductOption"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('product');
CREATE TRIGGER "ProductOptionValue_outbox" AFTER INSERT OR UPDATE OR DELETE ON "ProductOptionValue"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('option-value');
CREATE TRIGGER "ProductMedia_outbox" AFTER INSERT OR UPDATE OR DELETE ON "ProductMedia"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('product');
CREATE TRIGGER "Collection_outbox" AFTER INSERT OR UPDATE OR DELETE ON "Collection"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('collection');
CREATE TRIGGER "CollectionProduct_outbox" AFTER INSERT OR UPDATE OR DELETE ON "CollectionProduct"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('collection');

-- Availability: only when a level crosses zero, tracking changes, or a
-- location is activated or deactivated (not on every stock movement).
CREATE TRIGGER "InventoryLevel_outbox_insert" AFTER INSERT ON "InventoryLevel"
  FOR EACH ROW WHEN (NEW.available > 0) EXECUTE FUNCTION app_outbox_emit('inventory-level');
CREATE TRIGGER "InventoryLevel_outbox_update" AFTER UPDATE ON "InventoryLevel"
  FOR EACH ROW WHEN ((OLD.available > 0) IS DISTINCT FROM (NEW.available > 0))
  EXECUTE FUNCTION app_outbox_emit('inventory-level');
CREATE TRIGGER "InventoryItem_outbox" AFTER UPDATE OF tracked ON "InventoryItem"
  FOR EACH ROW WHEN (OLD.tracked IS DISTINCT FROM NEW.tracked)
  EXECUTE FUNCTION app_outbox_emit('inventory-item');
CREATE TRIGGER "Location_outbox" AFTER UPDATE OF "isActive", "deletedAt" ON "Location"
  FOR EACH ROW WHEN (OLD."isActive" IS DISTINCT FROM NEW."isActive" OR OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt")
  EXECUTE FUNCTION app_outbox_emit('location');

-- Content pages.
CREATE TRIGGER "Page_outbox" AFTER INSERT OR UPDATE OR DELETE ON "Page"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('page');
CREATE TRIGGER "PageVersion_outbox" AFTER UPDATE OF state ON "PageVersion"
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION app_outbox_emit('page');

-- The store itself: what the storefront shows (not, e.g., order numbers).
CREATE TRIGGER "Store_outbox" AFTER UPDATE ON "Store"
  FOR EACH ROW WHEN (
    (OLD.name, OLD.slug, OLD.status, OLD.currency, OLD.locale, OLD.country, OLD."logoMediaId", OLD."faviconMediaId")
    IS DISTINCT FROM
    (NEW.name, NEW.slug, NEW.status, NEW.currency, NEW.locale, NEW.country, NEW."logoMediaId", NEW."faviconMediaId"))
  EXECUTE FUNCTION app_outbox_emit('store');
CREATE TRIGGER "StoreDomain_outbox" AFTER INSERT OR UPDATE OR DELETE ON "StoreDomain"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('domain');

-- An organisation's status decides whether all of its stores are served.
CREATE FUNCTION app_outbox_organisation_status() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    INSERT INTO "OutboxEvent" (id, "organisationId", "storeId", type, "entityType", "entityId", payload)
      SELECT gen_random_uuid(), s."organisationId", s.id, 'store.changed', 'Store', s.id, '{}'::jsonb
      FROM "Store" s WHERE s."organisationId" = NEW.id;
    RETURN NULL;
  END
  $$;
CREATE TRIGGER "Organisation_outbox" AFTER UPDATE OF status ON "Organisation"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION app_outbox_organisation_status();

REVOKE ALL ON FUNCTION app_outbox_emit(), app_outbox_organisation_status() FROM PUBLIC;

-- Events come from these triggers only (for now): services neither write
-- nor read them directly. The worker claims, marks and purges them.
REVOKE INSERT ON "OutboxEvent" FROM storevia_app, storevia_platform;
