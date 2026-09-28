-- Demo purge fix (post-M7 order operations): a completed checkout must name
-- its order (Checkout_completed_order), so the purge now also marks the
-- checkout that produced the demo order as expired when it detaches it.
-- Reserved stock is returned to sale by the service before the purge.
CREATE OR REPLACE FUNCTION app_purge_demo_order(target uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    found_id uuid;
  BEGIN
    SELECT id INTO found_id FROM "Order"
      WHERE id = target AND "storeId" = app_current_store() AND "organisationId" = app_current_org()
        AND app_current_store() IS NOT NULL
      FOR UPDATE;
    IF found_id IS NULL THEN
      RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM "Payment" p JOIN "PaymentProviderConnection" c ON c.id = p."connectionId"
               WHERE p."orderId" = target AND c.mode = 'LIVE') THEN
      RAISE EXCEPTION 'orders with a live payment are never deleted' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('app.purging_demo_order', target::text, true);
    DELETE FROM "StaffNotification" WHERE "orderId" = target;
    DELETE FROM "OrderMessage" WHERE "orderId" = target;
    DELETE FROM "OrderCustomerAccess" WHERE "orderId" = target;
    DELETE FROM "OrderNotification" WHERE "orderId" = target;
    DELETE FROM "OrderEvent" WHERE "orderId" = target;
    DELETE FROM "FulfilmentLine" WHERE "fulfilmentId" IN (SELECT id FROM "Fulfilment" WHERE "orderId" = target);
    DELETE FROM "Fulfilment" WHERE "orderId" = target;
    DELETE FROM "RefundLine" WHERE "refundId" IN (SELECT id FROM "Refund" WHERE "orderId" = target);
    DELETE FROM "Refund" WHERE "orderId" = target;
    DELETE FROM "DiscountRedemption" WHERE "orderId" = target;
    DELETE FROM "InventoryReservation" WHERE "orderId" = target;
    UPDATE "Payment" SET "orderId" = NULL WHERE "orderId" = target;
    DELETE FROM "OrderTaxLine" WHERE "orderId" = target;
    DELETE FROM "OrderShippingLine" WHERE "orderId" = target;
    DELETE FROM "OrderDiscount" WHERE "orderId" = target;
    DELETE FROM "OrderAddress" WHERE "orderId" = target;
    DELETE FROM "OrderLine" WHERE "orderId" = target;
    -- A completed checkout names its order; without it, it reads as expired.
    UPDATE "Checkout" SET "completedOrderId" = NULL, status = 'EXPIRED', "updatedAt" = now()
      WHERE "completedOrderId" = target;
    DELETE FROM "Order" WHERE id = target;
    PERFORM set_config('app.purging_demo_order', '', true);
    RETURN true;
  END
  $$;
