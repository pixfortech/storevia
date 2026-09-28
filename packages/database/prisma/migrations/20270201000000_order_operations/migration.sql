-- Post-M7 product pass: order operations and customer order messages.
--
-- 1. Orders are archived, never deleted (commercial history). Completion is
--    an explicit merchant step, recorded.
-- 2. Fulfilments gain a method (carrier shipping or local delivery) and a
--    shipment status with its dates; tracking stays editable, quantities
--    and the order/location never change.
-- 3. OrderCustomerAccess: the opaque link a guest shopper uses to see their
--    order. Only a SHA-256 hash of the token is stored; the token itself is
--    derived from the row id with a server secret (so the confirmation email
--    and the checkout's thank-you page can show it) and never logged.
-- 4. OrderMessage: an append-only conversation between the shopper and the
--    store, separate from the merchant-only Order.note.
-- 5. StaffNotification: an in-app notification for one staff member, written
--    by the worker for users whose role grants the order-message permission
--    and who can access the store.
-- 6. Demo orders (development/test data only) can be purged by a guarded
--    function; any order with a LIVE-mode payment is refused by the database.

-- ---------------------------------------------------------------------------
-- 1. Orders: archive and completion.
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "archivedById" UUID,
  ADD COLUMN "completedAt" TIMESTAMPTZ(3),
  ADD COLUMN "completedById" UUID;
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_archived_by" CHECK ("archivedById" IS NULL OR "archivedAt" IS NOT NULL),
  ADD CONSTRAINT "Order_completed_by" CHECK ("completedById" IS NULL OR "completedAt" IS NOT NULL),
  -- A cancelled order is never complete, and a completed one is never cancelled.
  ADD CONSTRAINT "Order_completed_open" CHECK ("completedAt" IS NULL OR status = 'OPEN');
CREATE INDEX "Order_storeId_archivedAt_placedAt_idx" ON "Order"("storeId", "archivedAt", "placedAt");
GRANT UPDATE ("archivedAt", "archivedById", "completedAt", "completedById") ON "Order" TO storevia_app;

-- ---------------------------------------------------------------------------
-- 2. Fulfilment lifecycle.
-- ---------------------------------------------------------------------------
CREATE TYPE "FulfilmentMethod" AS ENUM ('SHIPPING', 'LOCAL_DELIVERY');
CREATE TYPE "ShipmentStatus" AS ENUM ('READY', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED');

ALTER TABLE "Fulfilment"
  ADD COLUMN "method" "FulfilmentMethod" NOT NULL DEFAULT 'SHIPPING',
  ADD COLUMN "shipmentStatus" "ShipmentStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "deliveredAt" TIMESTAMPTZ(3);
-- Fulfilments created before this change were recorded as shipped.
UPDATE "Fulfilment" SET "shipmentStatus" = 'SHIPPED', "shippedAt" = coalesce("shippedAt", "createdAt")
  WHERE state = 'SUCCESS';
ALTER TABLE "Fulfilment"
  ADD CONSTRAINT "Fulfilment_local_statuses"
    CHECK (method <> 'LOCAL_DELIVERY' OR "shipmentStatus" IN ('READY', 'OUT_FOR_DELIVERY', 'DELIVERED')),
  ADD CONSTRAINT "Fulfilment_delivered_at"
    CHECK (("shipmentStatus" = 'DELIVERED') = ("deliveredAt" IS NOT NULL)),
  ADD CONSTRAINT "Fulfilment_dispatched_at"
    CHECK ("shipmentStatus" = 'READY' OR "shippedAt" IS NOT NULL),
  ADD CONSTRAINT "Fulfilment_date_order"
    CHECK ("deliveredAt" IS NULL OR "shippedAt" IS NULL OR "deliveredAt" >= "shippedAt"),
  ADD CONSTRAINT "Fulfilment_tracking_url"
    CHECK ("trackingUrl" IS NULL OR ("trackingUrl" ~* '^https?://[^[:space:]]+$' AND char_length("trackingUrl") <= 500)),
  ADD CONSTRAINT "Fulfilment_tracking_text"
    CHECK (char_length(coalesce("trackingCompany", '')) <= 100 AND char_length(coalesce("trackingNumber", '')) <= 100);
GRANT UPDATE (method, "shipmentStatus", "trackingCompany", "trackingNumber", "trackingUrl",
  "shippedAt", "deliveredAt", "updatedAt") ON "Fulfilment" TO storevia_app;

-- ---------------------------------------------------------------------------
-- 3. Customer order access.
-- ---------------------------------------------------------------------------
CREATE TABLE "OrderCustomerAccess" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderCustomerAccess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderCustomerAccess_token_hash" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "OrderCustomerAccess_expiry" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "OrderCustomerAccess_tokenHash_key" ON "OrderCustomerAccess"("tokenHash");
CREATE INDEX "OrderCustomerAccess_orderId_idx" ON "OrderCustomerAccess"("orderId");
CREATE INDEX "OrderCustomerAccess_storeId_idx" ON "OrderCustomerAccess"("storeId");
ALTER TABLE "OrderCustomerAccess" ADD CONSTRAINT "OrderCustomerAccess_storeId_organisationId_fkey"
  FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderCustomerAccess" ADD CONSTRAINT "OrderCustomerAccess_orderId_storeId_fkey"
  FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The order an access token (its hash in app.order_access) opens, in the
-- current store, while it is neither expired nor revoked.
CREATE FUNCTION app_current_order_access() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT a."orderId" FROM "OrderCustomerAccess" a
    WHERE a."tokenHash" = NULLIF(current_setting('app.order_access', true), '')
      AND a."storeId" = app_current_store() AND app_current_store() IS NOT NULL
      AND a."revokedAt" IS NULL AND a."expiresAt" > now()
  $$;
REVOKE ALL ON FUNCTION app_current_order_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_order_access() TO storevia_checkout;

-- ---------------------------------------------------------------------------
-- 4. Order messages.
-- ---------------------------------------------------------------------------
CREATE TYPE "OrderMessageAuthor" AS ENUM ('CUSTOMER', 'STAFF');
CREATE TABLE "OrderMessage" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "authorType" "OrderMessageAuthor" NOT NULL,
    "authorUserId" UUID,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "staffNotifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderMessage_body" CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000),
    CONSTRAINT "OrderMessage_author"
      CHECK (("authorType" = 'STAFF') = ("authorUserId" IS NOT NULL))
);
CREATE INDEX "OrderMessage_orderId_createdAt_idx" ON "OrderMessage"("orderId", "createdAt");
CREATE INDEX "OrderMessage_storeId_idx" ON "OrderMessage"("storeId");
CREATE INDEX "OrderMessage_pending_staff_notification_idx" ON "OrderMessage"("createdAt")
  WHERE "authorType" = 'CUSTOMER' AND "staffNotifiedAt" IS NULL;
CREATE UNIQUE INDEX "OrderMessage_id_storeId_key" ON "OrderMessage"("id", "storeId");
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_storeId_organisationId_fkey"
  FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_orderId_storeId_fkey"
  FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Append-only conversation: only the read marker and the worker's
-- notification marker change after a message is written.
CREATE TRIGGER "OrderMessage_immutable" BEFORE UPDATE ON "OrderMessage"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('orderId', 'authorType', 'authorUserId',
    'body', 'createdAt');

-- ---------------------------------------------------------------------------
-- 5. Staff notifications.
-- ---------------------------------------------------------------------------
CREATE TYPE "StaffNotificationKind" AS ENUM ('ORDER_MESSAGE');
CREATE TABLE "StaffNotification" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "StaffNotificationKind" NOT NULL,
    "orderId" UUID NOT NULL,
    "orderMessageId" UUID,
    "title" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffNotification_title" CHECK (char_length("title") BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX "StaffNotification_userId_orderMessageId_key" ON "StaffNotification"("userId", "orderMessageId");
CREATE INDEX "StaffNotification_userId_organisationId_createdAt_idx"
  ON "StaffNotification"("userId", "organisationId", "createdAt");
CREATE INDEX "StaffNotification_storeId_idx" ON "StaffNotification"("storeId");
CREATE INDEX "StaffNotification_orderId_idx" ON "StaffNotification"("orderId");
CREATE INDEX "StaffNotification_orderMessageId_idx" ON "StaffNotification"("orderMessageId");
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_storeId_organisationId_fkey"
  FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_orderId_storeId_fkey"
  FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_orderMessageId_storeId_fkey"
  FOREIGN KEY ("orderMessageId", "storeId") REFERENCES "OrderMessage"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TRIGGER "StaffNotification_immutable" BEFORE UPDATE ON "StaffNotification"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('userId', 'kind', 'orderId',
    'orderMessageId', 'title', 'createdAt');

-- ---------------------------------------------------------------------------
-- Row-level security: every new table is tenant-scoped; the owner columns
-- never change.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['OrderCustomerAccess', 'OrderMessage', 'StaffNotification'] LOOP
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

-- A staff member sees only their own notifications, and a staff reply is
-- written as themselves.
CREATE POLICY own_notifications ON "StaffNotification" AS RESTRICTIVE TO storevia_app
  USING ("userId" = app_current_user());
CREATE POLICY staff_messages ON "OrderMessage" AS RESTRICTIVE FOR INSERT TO storevia_app
  WITH CHECK ("authorType" = 'STAFF' AND "authorUserId" = app_current_user());

-- The checkout role: a checkout sees its own order as before, and an order
-- access token opens exactly one order of the current store (read only,
-- plus the shopper's own messages).
ALTER POLICY checkout_scope ON "Order"
  USING ("storeId" = app_current_store()
    AND ("checkoutId" = app_current_checkout() OR id = app_current_order_access()));
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Fulfilment', 'FulfilmentLine', 'OrderCustomerAccess'] LOOP
    EXECUTE format('CREATE POLICY checkout_scope ON %I AS RESTRICTIVE TO storevia_checkout
      USING ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Order" o WHERE o.id = %s))
      WITH CHECK ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Order" o WHERE o.id = %s))',
      t,
      CASE t WHEN 'FulfilmentLine' THEN '(SELECT f."orderId" FROM "Fulfilment" f WHERE f.id = "fulfilmentId")' ELSE '"orderId"' END,
      CASE t WHEN 'FulfilmentLine' THEN '(SELECT f."orderId" FROM "Fulfilment" f WHERE f.id = "fulfilmentId")' ELSE '"orderId"' END);
  END LOOP;
END
$$;
CREATE POLICY checkout_scope ON "OrderMessage" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId"))
  WITH CHECK ("storeId" = app_current_store() AND "authorType" = 'CUSTOMER' AND "authorUserId" IS NULL
    AND "orderId" = app_current_order_access());

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "OrderCustomerAccess" TO storevia_checkout;
GRANT SELECT ON "Fulfilment", "FulfilmentLine" TO storevia_checkout;
GRANT SELECT, INSERT ON "OrderMessage" TO storevia_checkout;

GRANT SELECT ON "OrderCustomerAccess" TO storevia_app;
GRANT UPDATE ("revokedAt") ON "OrderCustomerAccess" TO storevia_app;
GRANT SELECT, INSERT ON "OrderMessage" TO storevia_app;
GRANT UPDATE ("readAt") ON "OrderMessage" TO storevia_app;
GRANT SELECT ON "StaffNotification" TO storevia_app;
GRANT UPDATE ("readAt") ON "StaffNotification" TO storevia_app;

-- The worker: confirmation/reply emails carry the order link; customer
-- messages fan out to the staff allowed to answer them.
GRANT SELECT ON "OrderCustomerAccess" TO storevia_worker;
GRANT SELECT ON "OrderMessage" TO storevia_worker;
GRANT UPDATE ("staffNotifiedAt") ON "OrderMessage" TO storevia_worker;
GRANT SELECT, INSERT ON "StaffNotification" TO storevia_worker;
GRANT SELECT (id, "organisationId", "userId", role, status, "allStores") ON "Membership" TO storevia_worker;
GRANT SELECT ON "MembershipStoreAccess" TO storevia_worker;
GRANT SELECT (id, status) ON "User" TO storevia_worker;
GRANT SELECT ("storeId", hostname, "isPrimary", status) ON "StoreDomain" TO storevia_worker;

-- The platform role reads everything (support), read only.
GRANT SELECT ON "OrderCustomerAccess", "OrderMessage", "StaffNotification" TO storevia_platform;

-- ---------------------------------------------------------------------------
-- 6. Shopper emails: a reply from the store.
-- ---------------------------------------------------------------------------
ALTER TYPE "NotificationKind" ADD VALUE 'ORDER_MESSAGE_REPLY';

-- ---------------------------------------------------------------------------
-- 7. Demo orders (development and test data). The dashboard offers this only
--    where STOREVIA_ENV allows it; the database refuses any order that took a
--    LIVE-mode payment, whatever the caller. Snapshot rows are append-only for
--    every role; the purge sets a transaction-local marker the append-only
--    trigger honours only for DELETE, and only this function (running as the
--    owner) holds DELETE on those tables.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'DELETE' AND NULLIF(current_setting('app.purging_demo_order', true), '') IS NOT NULL THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END
  $$;

CREATE FUNCTION app_purge_demo_order(target uuid) RETURNS boolean
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
    UPDATE "Checkout" SET "completedOrderId" = NULL WHERE "completedOrderId" = target;
    DELETE FROM "Order" WHERE id = target;
    PERFORM set_config('app.purging_demo_order', '', true);
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION app_purge_demo_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_purge_demo_order(uuid) TO storevia_app;
