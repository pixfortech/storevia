-- Worker reliability and operational visibility (M8).
--
-- 1. Media sweep: an upload whose processing was interrupted (a crashed or
--    redeployed instance) stayed PROCESSING forever, and abandoned uploads
--    stayed PENDING_UPLOAD, counting against the store's pending-upload cap.
--    The worker ends both as REJECTED and removes their raw upload objects.
--    It sees only what it needs: no filenames, alt text or uploader.
GRANT SELECT (id, "organisationId", "storeId", status, "createdAt", "updatedAt")
  ON "MediaAsset" TO storevia_worker;
GRANT UPDATE (status, "updatedAt") ON "MediaAsset" TO storevia_worker;

-- 2. Queue health, as platform-wide aggregates only (no tenant rows, ids
--    or content): what the worker publishes as ops.* gauges every minute
--    and platform-admin shows on its Operations page. SECURITY DEFINER so
--    neither role needs read access to the tables themselves.
CREATE FUNCTION app_operations_snapshot()
  RETURNS TABLE (metric text, value double precision)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT 'outbox_backlog', count(*)::float8
      FROM "OutboxEvent" WHERE "dispatchedAt" IS NULL
    UNION ALL
    SELECT 'outbox_oldest_seconds',
      COALESCE(EXTRACT(EPOCH FROM now() - min("occurredAt")), 0)::float8
      FROM "OutboxEvent" WHERE "dispatchedAt" IS NULL
    UNION ALL
    SELECT 'notifications_pending', count(*)::float8
      FROM "OrderNotification" WHERE status = 'PENDING'
    UNION ALL
    SELECT 'notifications_oldest_pending_seconds',
      COALESCE(EXTRACT(EPOCH FROM now() - min("createdAt")), 0)::float8
      FROM "OrderNotification" WHERE status = 'PENDING'
    UNION ALL
    SELECT 'notifications_failed', count(*)::float8
      FROM "OrderNotification" WHERE status = 'FAILED'
    UNION ALL
    SELECT 'messages_unannounced_oldest_seconds',
      COALESCE(EXTRACT(EPOCH FROM now() - min("createdAt")), 0)::float8
      FROM "OrderMessage" WHERE "authorType" = 'CUSTOMER' AND "staffNotifiedAt" IS NULL
    UNION ALL
    SELECT 'payment_webhooks_failed', count(*)::float8
      FROM "PaymentWebhookEvent" WHERE status = 'FAILED'
    UNION ALL
    SELECT 'jobs_failing', count(*)::float8
      FROM "ScheduledJob" WHERE "consecutiveFailures" >= 3
    UNION ALL
    -- Due for three intervals (at least three minutes) without running:
    -- no worker is claiming it.
    SELECT 'jobs_overdue', count(*)::float8
      FROM "ScheduledJob"
      WHERE "nextRunAt" < now() - make_interval(secs => GREATEST("intervalSeconds", 60) * 3)
    UNION ALL
    SELECT 'media_processing', count(*)::float8
      FROM "MediaAsset" WHERE status = 'PROCESSING'
    UNION ALL
    SELECT 'domains_failed', count(*)::float8
      FROM "StoreDomain" WHERE status = 'FAILED'
  $$;

REVOKE ALL ON FUNCTION app_operations_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_operations_snapshot() TO storevia_worker, storevia_platform;
