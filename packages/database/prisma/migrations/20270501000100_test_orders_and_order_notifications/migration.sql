-- Final pass, Phase 1.
--
-- CO-1: an order paid through a test connection (the Storevia Test Provider
-- or Razorpay test keys) is a test order, recorded on the order itself when
-- it is created from the payment connection's mode, never inferred from
-- display copy. It is part of the order snapshot: nobody can change it later.
--
-- ORD-1: a new order is announced to staff in-app, once, by the worker
-- (like customer messages): "staffNotifiedAt" marks it done.

-- ---------------------------------------------------------------------------
-- 1. Order."testMode"
-- ---------------------------------------------------------------------------
ALTER TABLE "Order" ADD COLUMN "testMode" BOOLEAN NOT NULL DEFAULT false;

-- Existing orders: test when any of their payments went through a TEST
-- connection (orders are created only from a captured payment).
UPDATE "Order" o SET "testMode" = true
WHERE EXISTS (
  SELECT 1 FROM "Payment" p
  JOIN "PaymentProviderConnection" c ON c.id = p."connectionId"
  WHERE p."orderId" = o.id AND c.mode = 'TEST');

-- Part of the immutable snapshot (same list as before, plus "testMode").
DROP TRIGGER "Order_snapshot_immutable" ON "Order";
CREATE TRIGGER "Order_snapshot_immutable" BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('orderNumber', 'checkoutId', 'email',
    'phone', 'currency', 'pricesIncludeTax', 'subtotalAmount', 'discountAmount', 'shippingAmount',
    'taxAmount', 'totalAmount', 'placedAt', 'sourceName', 'customerLocale', 'stockShortage',
    'testMode');

-- Sales figures and the default order lists skip test orders.
CREATE INDEX "Order_storeId_testMode_placedAt_idx" ON "Order" ("storeId", "testMode", "placedAt");

-- ---------------------------------------------------------------------------
-- 2. New-order announcements
-- ---------------------------------------------------------------------------
ALTER TABLE "Order" ADD COLUMN "staffNotifiedAt" TIMESTAMPTZ(3);
-- Orders placed before this migration are not announced.
UPDATE "Order" SET "staffNotifiedAt" = now();
CREATE INDEX "Order_pending_staff_notification_idx" ON "Order" ("placedAt")
  WHERE "staffNotifiedAt" IS NULL;

-- One new-order notification per member and order.
CREATE UNIQUE INDEX "StaffNotification_userId_orderId_new_order_key"
  ON "StaffNotification" ("userId", "orderId") WHERE kind = 'NEW_ORDER';

-- The worker marks the order announced (and nothing else on it).
GRANT UPDATE ("staffNotifiedAt") ON "Order" TO storevia_worker;
