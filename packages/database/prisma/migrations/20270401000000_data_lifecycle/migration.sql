-- Data lifecycle (M8, docs/database/data-lifecycle.md).
--
-- 1. Erasing personal data without destroying financial history. Order
--    snapshots are immutable (ADR-0031 §5) and addresses append-only. Erasure
--    is the one exception, and only for the personal fields: the functions
--    below set app.erasing_personal_data for their own transaction. The
--    triggers then let exactly those columns change. No application role
--    holds UPDATE on them, so the setting is useless outside these
--    functions. Amounts, lines, tax, payments and refunds never change.
-- 2. Customer erasure (merchant, customer.manage + step-up).
-- 3. Organisation deletion: a request with a cooling-off period (owner),
--    then the worker erases personal data and detaches everything.
-- 4. User account deletion (the user themself).
-- 5. Retention: one bounded sweep with fixed windows, run by the worker.
-- 6. S11: deleted media whose objects failed to delete are retried.

ALTER TABLE "Customer" ADD COLUMN "anonymisedAt" TIMESTAMPTZ(3);
ALTER TABLE "Organisation" ADD COLUMN "deletionScheduledAt" TIMESTAMPTZ(3);
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_deletion_scheduled"
  CHECK (("deletionScheduledAt" IS NOT NULL) = (status = 'PENDING_DELETION'));
ALTER TABLE "MediaAsset" ADD COLUMN "objectsPurgedAt" TIMESTAMPTZ(3);
CREATE INDEX "MediaAsset_unpurged_idx" ON "MediaAsset" ("deletedAt")
  WHERE status = 'DELETED' AND "objectsPurgedAt" IS NULL;
CREATE INDEX "Organisation_deletion_due_idx" ON "Organisation" ("deletionScheduledAt")
  WHERE status = 'PENDING_DELETION';

-- ---------------------------------------------------------------------------
-- 1. Immutability triggers that step aside for personal fields during
--    erasure only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_forbid_parent_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    col text;
    erasing boolean := current_setting('app.erasing_personal_data', true) = 'on';
  BEGIN
    FOREACH col IN ARRAY TG_ARGV LOOP
      IF erasing AND (TG_TABLE_NAME, col) IN (('Order', 'email'), ('Order', 'phone'),
                                              ('OrderMessage', 'body')) THEN
        CONTINUE;
      END IF;
      IF (to_jsonb(NEW) ->> col) IS DISTINCT FROM (to_jsonb(OLD) ->> col) THEN
        RAISE EXCEPTION '%.% is immutable', TG_TABLE_NAME, col USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    RETURN NEW;
  END
  $$;

CREATE OR REPLACE FUNCTION app_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    -- The demo-order purge (20270201000000_order_operations §7), unchanged.
    IF TG_OP = 'DELETE' AND NULLIF(current_setting('app.purging_demo_order', true), '') IS NOT NULL THEN
      RETURN OLD;
    END IF;
    -- Addresses lose their personal lines on erasure; nothing is ever
    -- deleted. (Nested: NEW has these columns only on OrderAddress.)
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'OrderAddress'
       AND current_setting('app.erasing_personal_data', true) = 'on' THEN
      IF NEW.type = OLD.type AND NEW."orderId" = OLD."orderId"
         AND NEW."countryCode" = OLD."countryCode"
         AND NEW.region IS NOT DISTINCT FROM OLD.region
         AND NEW."regionCode" IS NOT DISTINCT FROM OLD."regionCode" THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END
  $$;

-- The erasure itself, for a set of orders and customers of one
-- organisation. Internal: callable only by the functions below.
CREATE FUNCTION app_erase_personal_data(org uuid, order_ids uuid[], customer_ids uuid[],
    emails text[])
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    n_orders bigint; n_addresses bigint; n_messages bigint; n_checkouts bigint;
    n_customers bigint; n_notifications bigint; n_links bigint; n_redemptions bigint;
  BEGIN
    PERFORM set_config('app.erasing_personal_data', 'on', true);
    UPDATE "Order" SET email = NULL, phone = NULL, note = NULL, "updatedAt" = now()
      WHERE "organisationId" = org AND id = ANY (order_ids)
        AND (email IS NOT NULL OR phone IS NOT NULL OR note IS NOT NULL);
    GET DIAGNOSTICS n_orders = ROW_COUNT;
    -- Region and country stay: they are the tax place of supply.
    UPDATE "OrderAddress" SET "firstName" = NULL, "lastName" = NULL, company = NULL,
        line1 = 'Removed', line2 = NULL, city = NULL, "postalCode" = NULL, phone = NULL
      WHERE "organisationId" = org AND "orderId" = ANY (order_ids) AND line1 <> 'Removed';
    GET DIAGNOSTICS n_addresses = ROW_COUNT;
    UPDATE "OrderMessage" SET body = 'This message was removed with the customer''s personal data.'
      WHERE "organisationId" = org AND "orderId" = ANY (order_ids)
        AND body <> 'This message was removed with the customer''s personal data.';
    GET DIAGNOSTICS n_messages = ROW_COUNT;
    -- Unsent emails are never sent; sent ones forget the address.
    UPDATE "OrderNotification" SET recipient = 'removed',
        status = CASE WHEN status = 'PENDING' THEN 'FAILED'::"NotificationStatus" ELSE status END,
        "lastError" = CASE WHEN status = 'PENDING' THEN 'personal data erased' ELSE "lastError" END,
        "updatedAt" = now()
      WHERE "organisationId" = org AND "orderId" = ANY (order_ids) AND recipient <> 'removed';
    GET DIAGNOSTICS n_notifications = ROW_COUNT;
    UPDATE "OrderCustomerAccess" SET "revokedAt" = now()
      WHERE "organisationId" = org AND "orderId" = ANY (order_ids) AND "revokedAt" IS NULL;
    GET DIAGNOSTICS n_links = ROW_COUNT;
    UPDATE "Checkout" SET email = NULL, "shippingAddress" = NULL, "billingAddress" = NULL,
        "updatedAt" = now()
      WHERE "organisationId" = org
        AND (id IN (SELECT "checkoutId" FROM "Order" WHERE id = ANY (order_ids) AND "checkoutId" IS NOT NULL)
             OR "customerId" = ANY (customer_ids)
             OR lower(email) = ANY (emails))
        AND (email IS NOT NULL OR "shippingAddress" IS NOT NULL OR "billingAddress" IS NOT NULL);
    GET DIAGNOSTICS n_checkouts = ROW_COUNT;
    UPDATE "DiscountRedemption" SET email = NULL, "updatedAt" = now()
      WHERE "organisationId" = org AND email IS NOT NULL
        AND ("orderId" = ANY (order_ids) OR "customerId" = ANY (customer_ids)
             OR lower(email) = ANY (emails));
    GET DIAGNOSTICS n_redemptions = ROW_COUNT;
    UPDATE "Customer" SET email = NULL, phone = NULL, "firstName" = NULL, "lastName" = NULL,
        note = NULL, tags = '{}', "anonymisedAt" = now(), "deletedAt" = coalesce("deletedAt", now()),
        "updatedAt" = now()
      WHERE "organisationId" = org AND id = ANY (customer_ids) AND "anonymisedAt" IS NULL;
    GET DIAGNOSTICS n_customers = ROW_COUNT;
    PERFORM set_config('app.erasing_personal_data', '', true);
    RETURN jsonb_build_object('customers', n_customers, 'orders', n_orders,
      'addresses', n_addresses, 'messages', n_messages, 'checkouts', n_checkouts,
      'notifications', n_notifications, 'orderLinks', n_links, 'redemptions', n_redemptions);
  END
  $$;
REVOKE ALL ON FUNCTION app_erase_personal_data(uuid, uuid[], uuid[], text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Customer erasure, from the merchant's own tenant transaction: the
--    customer must belong to the current store. Their orders are found by
--    customer id and, for guest checkouts, by email within that store.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_erase_customer(target uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    c record;
    order_ids uuid[];
  BEGIN
    IF app_current_store() IS NULL THEN
      RAISE EXCEPTION 'a store scope is required' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT id, "organisationId", "storeId", lower(email) AS email INTO c FROM "Customer"
      WHERE id = target AND "storeId" = app_current_store()
        AND "organisationId" = app_current_org()
      FOR UPDATE;
    IF c.id IS NULL THEN
      RETURN NULL;
    END IF;
    SELECT coalesce(array_agg(id), '{}') INTO order_ids FROM "Order"
      WHERE "storeId" = c."storeId"
        AND ("customerId" = c.id OR (c.email IS NOT NULL AND lower(email) = c.email));
    RETURN app_erase_personal_data(c."organisationId", order_ids, ARRAY[c.id],
      CASE WHEN c.email IS NULL THEN '{}'::text[] ELSE ARRAY[c.email] END);
  END
  $$;
REVOKE ALL ON FUNCTION app_erase_customer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_erase_customer(uuid) TO storevia_app;

-- ---------------------------------------------------------------------------
-- 3. Organisation deletion.
-- ---------------------------------------------------------------------------
-- Request (owner, from the tenant transaction): stores go offline at once
-- (the Organisation_outbox trigger invalidates every storefront cache).
CREATE FUNCTION app_request_organisation_deletion(target uuid, cooling_off_days int)
  RETURNS timestamptz
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    due timestamptz;
  BEGIN
    IF target IS DISTINCT FROM app_current_org() THEN
      RAISE EXCEPTION 'not the current organisation' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF cooling_off_days < 7 OR cooling_off_days > 90 THEN
      RAISE EXCEPTION 'cooling-off period out of range' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE "Organisation" SET status = 'PENDING_DELETION',
        "deletionScheduledAt" = now() + make_interval(days => cooling_off_days), "updatedAt" = now()
      WHERE id = target AND status = 'ACTIVE'
      RETURNING "deletionScheduledAt" INTO due;
    RETURN due;
  END
  $$;
REVOKE ALL ON FUNCTION app_request_organisation_deletion(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_request_organisation_deletion(uuid, int) TO storevia_app;

CREATE FUNCTION app_cancel_organisation_deletion(target uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF target IS DISTINCT FROM app_current_org() THEN
      RAISE EXCEPTION 'not the current organisation' USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE "Organisation" SET status = 'ACTIVE', "deletionScheduledAt" = NULL, "updatedAt" = now()
      WHERE id = target AND status = 'PENDING_DELETION' AND "deletionScheduledAt" > now();
    RETURN FOUND;
  END
  $$;
REVOKE ALL ON FUNCTION app_cancel_organisation_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cancel_organisation_deletion(uuid) TO storevia_app;

-- The deletion itself (worker, once the cooling-off period is over). The
-- worker has already removed custom domains from the hosting provider.
-- Kept: orders, lines, payments, refunds, tax and fulfilment records (with
-- personal fields erased), audit logs and billing history, for as long as
-- the law requires (data-lifecycle.md). Removed: personal data, members,
-- invitations, domains, payment credentials and media objects.
CREATE FUNCTION app_delete_organisation(target uuid) RETURNS jsonb
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
    UPDATE "Store" SET status = 'ARCHIVED', "updatedAt" = now() WHERE "organisationId" = target;
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
REVOKE ALL ON FUNCTION app_delete_organisation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_delete_organisation(uuid) TO storevia_worker;

-- The worker finds due deletions and each one's custom domains (to remove
-- them from the hosting provider first).
GRANT SELECT ("deletionScheduledAt") ON "Organisation" TO storevia_worker;
GRANT SELECT (id, "organisationId", type, "providerRef") ON "StoreDomain" TO storevia_worker;

-- ---------------------------------------------------------------------------
-- 4. User account deletion (packages/auth, system role). Refused while the
--    user owns a live organisation or is platform staff. Memberships go;
--    the user row stays as an anonymous tombstone so audit entries and
--    order history keep a valid actor id.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_delete_user_account(target uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    u record;
    m record;
  BEGIN
    SELECT id, email INTO u FROM "User" WHERE id = target AND "deletedAt" IS NULL FOR UPDATE;
    IF u.id IS NULL THEN
      RETURN 'not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM "Membership" ms JOIN "Organisation" o ON o.id = ms."organisationId"
               WHERE ms."userId" = target AND ms.role = 'OWNER' AND o.status <> 'DELETED') THEN
      RETURN 'owns_organisation';
    END IF;
    IF EXISTS (SELECT 1 FROM "PlatformStaff" WHERE "userId" = target AND active) THEN
      RETURN 'platform_staff';
    END IF;
    FOR m IN SELECT id, "organisationId" FROM "Membership" WHERE "userId" = target LOOP
      DELETE FROM "MembershipStoreAccess" WHERE "membershipId" = m.id;
      DELETE FROM "Membership" WHERE id = m.id;
      INSERT INTO "AuditLog" (id, "organisationId", "actorType", "actorId", action, "entityType",
        "entityId", metadata)
      VALUES (gen_random_uuid(), m."organisationId", 'USER', target, 'member.left', 'Membership',
        m.id, jsonb_build_object('reason', 'Account deleted'));
    END LOOP;
    UPDATE "Invitation" SET status = 'REVOKED', "updatedAt" = now()
      WHERE lower(email) = lower(u.email) AND status = 'PENDING';
    DELETE FROM "StaffNotification" WHERE "userId" = target;
    DELETE FROM "Session" WHERE "userId" = target;
    DELETE FROM "Account" WHERE "userId" = target;
    DELETE FROM "StaffMfa" WHERE "userId" = target;
    DELETE FROM "Verification" WHERE position(lower(u.email) IN lower(identifier)) > 0;
    UPDATE "User" SET email = 'deleted-' || id::text || '@deleted.invalid', name = 'Deleted user',
        image = NULL, "emailVerified" = false, status = 'DISABLED', "deletedAt" = now(),
        "updatedAt" = now()
      WHERE id = target;
    RETURN 'deleted';
  END
  $$;
REVOKE ALL ON FUNCTION app_delete_user_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_delete_user_account(uuid) TO storevia_system;

-- ---------------------------------------------------------------------------
-- 5. Retention. Fixed windows (never parameters, so a misconfigured caller
--    can't shorten them), at most `batch` rows per item per run.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_retention_sweep(batch int DEFAULT 5000)
  RETURNS TABLE (item text, affected bigint)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    n bigint;
    ids uuid[];
    lim int := least(greatest(batch, 1), 50000);
  BEGIN
    DELETE FROM "Session" WHERE id IN (SELECT id FROM "Session"
      WHERE "expiresAt" < now() - interval '7 days' LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'sessions'; affected := n; RETURN NEXT;

    DELETE FROM "Verification" WHERE id IN (SELECT id FROM "Verification"
      WHERE "expiresAt" < now() - interval '1 day' LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'verifications'; affected := n; RETURN NEXT;

    DELETE FROM "RateLimit" WHERE id IN (SELECT id FROM "RateLimit"
      WHERE "lastRequest" < (extract(epoch FROM now() - interval '2 days') * 1000)::bigint
      LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'rate_limits'; affected := n; RETURN NEXT;

    DELETE FROM "JobRun" WHERE id IN (SELECT id FROM "JobRun"
      WHERE (status = 'SUCCEEDED' AND "startedAt" < now() - interval '30 days')
         OR (status = 'FAILED' AND "startedAt" < now() - interval '90 days')
      LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'job_runs'; affected := n; RETURN NEXT;

    -- Carts no checkout refers to, untouched for 90 days (no personal
    -- data); their lines cascade.
    DELETE FROM "Cart" WHERE id IN (SELECT c.id FROM "Cart" c
      WHERE c."updatedAt" < now() - interval '90 days'
        AND NOT EXISTS (SELECT 1 FROM "Checkout" k WHERE k."cartId" = c.id)
      LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'carts'; affected := n; RETURN NEXT;

    -- Settled payment webhooks: normalised meaning only (no personal data);
    -- 90 days, far beyond any provider's retry window.
    DELETE FROM "PaymentWebhookEvent" WHERE id IN (SELECT id FROM "PaymentWebhookEvent"
      WHERE "receivedAt" < now() - interval '90 days'
        AND status IN ('PROCESSED', 'IGNORED', 'FAILED')
      LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'payment_webhooks'; affected := n; RETURN NEXT;

    DELETE FROM "BillingWebhookEvent" WHERE id IN (SELECT id FROM "BillingWebhookEvent"
      WHERE "receivedAt" < now() - interval '90 days'
        AND status IN ('PROCESSED', 'IGNORED', 'FAILED')
      LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'billing_webhooks'; affected := n; RETURN NEXT;

    DELETE FROM "StaffNotification" WHERE id IN (SELECT id FROM "StaffNotification"
      WHERE ("readAt" IS NOT NULL AND "createdAt" < now() - interval '90 days')
         OR "createdAt" < now() - interval '180 days'
      LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'staff_notifications'; affected := n; RETURN NEXT;

    -- Order emails keep their row (it stops a resend), not the address.
    UPDATE "OrderNotification" SET recipient = 'removed', "updatedAt" = now()
      WHERE id IN (SELECT id FROM "OrderNotification"
        WHERE status IN ('SENT', 'FAILED') AND recipient <> 'removed'
          AND "updatedAt" < now() - interval '90 days'
        LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'notification_recipients'; affected := n; RETURN NEXT;

    DELETE FROM "OrderCustomerAccess" WHERE id IN (SELECT id FROM "OrderCustomerAccess"
      WHERE "expiresAt" < now() - interval '30 days' LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'order_links'; affected := n; RETURN NEXT;

    -- Conversations about orders placed over three years ago (their staff
    -- notifications first: the reference is RESTRICT).
    SELECT coalesce(array_agg(m.id), '{}') INTO ids FROM (
      SELECT m.id FROM "OrderMessage" m JOIN "Order" o ON o.id = m."orderId"
      WHERE o."placedAt" < now() - interval '3 years' LIMIT lim) m;
    DELETE FROM "StaffNotification" WHERE "orderMessageId" = ANY (ids);
    DELETE FROM "OrderMessage" WHERE id = ANY (ids);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'order_messages'; affected := n; RETURN NEXT;

    DELETE FROM "AuditLog" WHERE (id, "createdAt") IN (SELECT id, "createdAt" FROM "AuditLog"
      WHERE "createdAt" < now() - interval '2 years' LIMIT lim);
    GET DIAGNOSTICS n = ROW_COUNT; item := 'audit_logs'; affected := n; RETURN NEXT;
  END
  $$;
REVOKE ALL ON FUNCTION app_retention_sweep(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_retention_sweep(int) TO storevia_worker;

-- ---------------------------------------------------------------------------
-- 6. Media object deletion retried (S11). The worker sees only what it
--    needs to find and delete a deleted asset's objects.
-- ---------------------------------------------------------------------------
GRANT SELECT ("storageKey", renditions, "deletedAt", "objectsPurgedAt") ON "MediaAsset"
  TO storevia_worker;
GRANT UPDATE ("objectsPurgedAt") ON "MediaAsset" TO storevia_worker;
