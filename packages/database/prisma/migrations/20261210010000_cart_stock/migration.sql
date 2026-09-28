-- M6 correction: one stock rule for the cart, the product page and checkout
-- (ADR-0031 §3). A tracked variant that may not be oversold (inventory
-- policy DENY) can be bought up to the largest `available` quantity at a
-- single active, online-fulfilling location: that is exactly what checkout
-- can reserve, because a line is reserved whole at one location.
-- Untracked and oversellable (CONTINUE) variants have no stock ceiling.

-- 1. The rule. max_quantity is NULL when stock doesn't limit the variant;
--    otherwise 0..100 (100 means "at least 100": the cart holds at most 99
--    of a line, so the storefront never needs a larger number, and the exact
--    stock level isn't disclosed beyond that).
CREATE FUNCTION app_variant_stock(variant_ids uuid[])
  RETURNS TABLE (variant_id uuid, max_quantity integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT v.id,
      CASE WHEN ii.id IS NULL OR NOT ii.tracked OR v."inventoryPolicy" = 'CONTINUE' THEN NULL
        ELSE LEAST(GREATEST(coalesce((
          SELECT max(l.available) FROM "InventoryLevel" l
          JOIN "Location" loc ON loc.id = l."locationId" AND loc."isActive"
            AND loc."fulfilsOnlineOrders" AND loc."deletedAt" IS NULL
          WHERE l."inventoryItemId" = ii.id), 0), 0), 100)
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

-- 2. Availability is the same rule: at least one can be bought. (It used to
--    sum every active location, including ones that don't fulfil online
--    orders, so a product could look in stock and then be sold out at checkout.)
CREATE OR REPLACE FUNCTION app_storefront_availability(variant_ids uuid[])
  RETURNS TABLE (variant_id uuid, available boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT s.variant_id, s.max_quantity IS NULL OR s.max_quantity > 0
    FROM app_variant_stock(variant_ids) s
  $$;

REVOKE ALL ON FUNCTION app_variant_stock(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_variant_stock(uuid[]) TO storevia_storefront, storevia_checkout;

-- 3. Whether a location fulfils online orders now decides availability, so
--    changing it invalidates cached product pages like (de)activating does.
DROP TRIGGER "Location_outbox" ON "Location";
CREATE TRIGGER "Location_outbox" AFTER UPDATE OF "isActive", "deletedAt", "fulfilsOnlineOrders" ON "Location"
  FOR EACH ROW WHEN (OLD."isActive" IS DISTINCT FROM NEW."isActive"
    OR OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt"
    OR OLD."fulfilsOnlineOrders" IS DISTINCT FROM NEW."fulfilsOnlineOrders")
  EXECUTE FUNCTION app_outbox_emit('location');
