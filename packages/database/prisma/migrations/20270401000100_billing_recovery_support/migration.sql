-- Billing recovery and support tooling (M8).
--
-- 1. Billing notices: trial ending, payment overdue and plan ended emails to
--    an organisation's owners and billing address. The ledger stores no
--    address, only which notice was sent for which date, so a changed date
--    (a grace extension, a new trial) notifies again and nothing twice.
-- 2. Platform support actions: suspend/restore a store or an organisation,
--    retry failed order emails, and read-only diagnostics. The platform role
--    stays read-only on tenant tables: each action is one narrow SECURITY
--    DEFINER function; permission, step-up, reason and audit are enforced by
--    the service (packages/billing/src/support.ts).

-- ---------------------------------------------------------------------------
-- 1. Billing notices.
-- ---------------------------------------------------------------------------
CREATE TABLE "BillingNotice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingNotice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BillingNotice_kind" CHECK (kind IN ('trial_ending', 'payment_overdue', 'plan_ended'))
);
CREATE UNIQUE INDEX "BillingNotice_dedupeKey_key" ON "BillingNotice"("dedupeKey");
CREATE INDEX "BillingNotice_organisationId_idx" ON "BillingNotice"("organisationId");
ALTER TABLE "BillingNotice" ADD CONSTRAINT "BillingNotice_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingNotice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingNotice" FORCE ROW LEVEL SECURITY;
-- No policies and no grants: only the functions below touch it.

-- What is due, with its recipients. Only organisations that are ACTIVE;
-- recipients are active owners and the billing address, deduplicated.
CREATE FUNCTION app_billing_notices_due(lim int)
  RETURNS TABLE (
    dedupe_key text, kind text, organisation_id uuid, subscription_id uuid,
    organisation_name text, plan_name text, due_at timestamptz, recipients text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    WITH due AS (
      SELECT s.id AS sub, s."organisationId" AS org, 'trial_ending'::text AS kind,
             s."trialEndsAt" AS at
      FROM "Subscription" s
      WHERE s.status = 'TRIAL' AND s."trialEndsAt" > now()
        AND s."trialEndsAt" <= now() + interval '3 days'
      UNION ALL
      SELECT s.id, s."organisationId", 'payment_overdue', s."graceEndsAt"
      FROM "Subscription" s
      WHERE s.status = 'PAST_DUE' AND s."graceEndsAt" > now()
      UNION ALL
      SELECT s.id, s."organisationId", 'plan_ended', s."endedAt"
      FROM "Subscription" s
      WHERE s.status = 'EXPIRED' AND s."endedAt" > now() - interval '2 days'
    )
    SELECT d.sub::text || ':' || d.kind || ':' || to_char(d.at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS'),
           d.kind, d.org, d.sub, o.name, p.name, d.at,
           ARRAY(
             SELECT DISTINCT lower(e) FROM (
               SELECT u.email::text AS e FROM "Membership" m JOIN "User" u ON u.id = m."userId"
               WHERE m."organisationId" = d.org AND m.role = 'OWNER' AND m.status = 'ACTIVE'
                 AND u."deletedAt" IS NULL AND u.status = 'ACTIVE'
               UNION ALL
               SELECT o."billingEmail" WHERE o."billingEmail" IS NOT NULL
             ) r)
    FROM due d
    JOIN "Organisation" o ON o.id = d.org AND o.status = 'ACTIVE'
    JOIN "Subscription" s ON s.id = d.sub
    JOIN "Plan" p ON p.id = s."planId"
    WHERE NOT EXISTS (
      SELECT 1 FROM "BillingNotice" n
      WHERE n."dedupeKey" = d.sub::text || ':' || d.kind || ':' || to_char(d.at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS'))
    ORDER BY d.at
    LIMIT least(greatest(lim, 1), 500)
  $$;
REVOKE ALL ON FUNCTION app_billing_notices_due(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_billing_notices_due(int) TO storevia_worker;

-- One worker claims a notice before sending; a failed send releases it for
-- the next run, a successful one stamps sentAt.
CREATE FUNCTION app_claim_billing_notice(key text, notice_kind text, org uuid, sub uuid)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    INSERT INTO "BillingNotice" ("organisationId", "subscriptionId", kind, "dedupeKey")
    VALUES (org, sub, notice_kind, key)
    ON CONFLICT ("dedupeKey") DO NOTHING;
    RETURN FOUND;
  END
  $$;
CREATE FUNCTION app_complete_billing_notice(key text, sent boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF sent THEN
      UPDATE "BillingNotice" SET "sentAt" = now() WHERE "dedupeKey" = key AND "sentAt" IS NULL;
    ELSE
      DELETE FROM "BillingNotice" WHERE "dedupeKey" = key AND "sentAt" IS NULL;
    END IF;
  END
  $$;
REVOKE ALL ON FUNCTION app_claim_billing_notice(text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_complete_billing_notice(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_claim_billing_notice(text, text, uuid, uuid) TO storevia_worker;
GRANT EXECUTE ON FUNCTION app_complete_billing_notice(text, boolean) TO storevia_worker;

-- ---------------------------------------------------------------------------
-- 2. Platform support actions.
-- ---------------------------------------------------------------------------
-- A suspended store returns to the status it had (a draft store doesn't
-- go live on restore).
ALTER TABLE "Store" ADD COLUMN "suspendedFromStatus" "StoreStatus";

-- Suspend (ACTIVE or DRAFT → SUSPENDED) or restore. Returns the new status,
-- or NULL when there was nothing to change. The Store_outbox trigger
-- invalidates every storefront instance.
CREATE FUNCTION app_platform_set_store_suspension(target uuid, suspend boolean, why text)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    s record;
    next_status "StoreStatus";
  BEGIN
    SELECT id, status, "suspendedFromStatus" INTO s FROM "Store" WHERE id = target FOR UPDATE;
    IF s.id IS NULL THEN
      RETURN NULL;
    END IF;
    IF suspend THEN
      IF s.status NOT IN ('ACTIVE', 'DRAFT') THEN
        RETURN NULL;
      END IF;
      UPDATE "Store" SET status = 'SUSPENDED', "suspendedFromStatus" = s.status,
          "suspendedAt" = now(), "suspensionReason" = left(why, 500), "updatedAt" = now()
        WHERE id = target;
      RETURN 'SUSPENDED';
    END IF;
    IF s.status <> 'SUSPENDED' THEN
      RETURN NULL;
    END IF;
    next_status := coalesce(s."suspendedFromStatus", 'DRAFT');
    UPDATE "Store" SET status = next_status, "suspendedFromStatus" = NULL, "suspendedAt" = NULL,
        "suspensionReason" = NULL, "updatedAt" = now()
      WHERE id = target;
    RETURN next_status::text;
  END
  $$;

-- ACTIVE → SUSPENDED or back. Deletion states are left alone.
CREATE FUNCTION app_platform_set_organisation_suspension(target uuid, suspend boolean)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF suspend THEN
      UPDATE "Organisation" SET status = 'SUSPENDED', "suspendedAt" = now(), "updatedAt" = now()
        WHERE id = target AND status = 'ACTIVE';
    ELSE
      UPDATE "Organisation" SET status = 'ACTIVE', "suspendedAt" = NULL, "updatedAt" = now()
        WHERE id = target AND status = 'SUSPENDED';
    END IF;
    RETURN FOUND;
  END
  $$;

-- Failed order emails of one organisation go back to the queue (not the
-- ones whose recipient was erased).
CREATE FUNCTION app_platform_retry_order_notifications(org uuid) RETURNS bigint
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    n bigint;
  BEGIN
    UPDATE "OrderNotification" SET status = 'PENDING', attempts = 0, "nextAttemptAt" = now(),
        "lastError" = NULL, "updatedAt" = now()
      WHERE "organisationId" = org AND status = 'FAILED' AND recipient <> 'removed';
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
  END
  $$;

-- Read-only diagnostics: counts per store, never rows or personal data.
CREATE FUNCTION app_support_diagnostics(org uuid)
  RETURNS TABLE (store_id uuid, metric text, value bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT s.id, m.metric, m.value FROM "Store" s
    CROSS JOIN LATERAL (VALUES
      ('orders_30d', (SELECT count(*) FROM "Order" o WHERE o."storeId" = s.id
                        AND o."placedAt" > now() - interval '30 days')),
      ('last_order_epoch', (SELECT coalesce(extract(epoch FROM max(o."placedAt"))::bigint, 0)
                              FROM "Order" o WHERE o."storeId" = s.id)),
      ('orders_unfulfilled', (SELECT count(*) FROM "Order" o WHERE o."storeId" = s.id
                                AND o.status = 'OPEN' AND o."paymentStatus" = 'PAID'
                                AND o."fulfilmentStatus" = 'UNFULFILLED')),
      ('payment_webhooks_failed_7d', (SELECT count(*) FROM "PaymentWebhookEvent" w
                                        WHERE w."storeId" = s.id AND w.status = 'FAILED'
                                          AND w."receivedAt" > now() - interval '7 days')),
      ('notifications_failed', (SELECT count(*) FROM "OrderNotification" n
                                  WHERE n."storeId" = s.id AND n.status = 'FAILED'
                                    AND n.recipient <> 'removed')),
      ('notifications_pending', (SELECT count(*) FROM "OrderNotification" n
                                   WHERE n."storeId" = s.id AND n.status = 'PENDING')),
      ('media_processing', (SELECT count(*) FROM "MediaAsset" a WHERE a."storeId" = s.id
                              AND a.status IN ('PENDING_UPLOAD', 'PROCESSING'))),
      ('media_rejected_7d', (SELECT count(*) FROM "MediaAsset" a WHERE a."storeId" = s.id
                               AND a.status = 'REJECTED' AND a."updatedAt" > now() - interval '7 days')),
      ('domains_not_active', (SELECT count(*) FROM "StoreDomain" d WHERE d."storeId" = s.id
                                AND d.type = 'CUSTOM' AND d.status <> 'ACTIVE')),
      ('checkouts_open', (SELECT count(*) FROM "Checkout" c WHERE c."storeId" = s.id
                            AND c.status = 'OPEN'))
    ) AS m(metric, value)
    WHERE s."organisationId" = org
  $$;

REVOKE ALL ON FUNCTION app_platform_set_store_suspension(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_platform_set_organisation_suspension(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_platform_retry_order_notifications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_support_diagnostics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_platform_set_store_suspension(uuid, boolean, text) TO storevia_platform;
GRANT EXECUTE ON FUNCTION app_platform_set_organisation_suspension(uuid, boolean) TO storevia_platform;
GRANT EXECUTE ON FUNCTION app_platform_retry_order_notifications(uuid) TO storevia_platform;
GRANT EXECUTE ON FUNCTION app_support_diagnostics(uuid) TO storevia_platform;
