-- Milestone 7: custom domains (ADR-0032). StoreDomain already has the
-- columns M4 planned; this adds the verification worker's bookkeeping and
-- the invariants the lifecycle relies on.

-- 1. Verification bookkeeping: checks since the last state change (drives
--    backoff and the monitoring streak) and the provider's DNS instructions,
--    kept so the dashboard never waits on the provider.
ALTER TABLE "StoreDomain"
  ADD COLUMN "checkAttempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "dnsRecords" jsonb;

-- Tokens written before this migration that don't meet the format are
-- replaced (they have never been published: no custom domain existed).
UPDATE "StoreDomain" SET "verificationToken" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "verificationToken" !~ '^[A-Za-z0-9_-]{32,128}$';

ALTER TABLE "StoreDomain"
  ADD CONSTRAINT "StoreDomain_check_attempts" CHECK ("checkAttempts" >= 0),
  ADD CONSTRAINT "StoreDomain_dns_records"
    CHECK ("dnsRecords" IS NULL OR (jsonb_typeof("dnsRecords") = 'array'
      AND jsonb_array_length("dnsRecords") <= 10 AND octet_length("dnsRecords"::text) <= 4096)),
  -- The primary is always served: never PENDING, VERIFYING or FAILED.
  ADD CONSTRAINT "StoreDomain_primary_active" CHECK (NOT "isPrimary" OR status = 'ACTIVE'),
  -- Storevia's own subdomains need no verification and never lapse.
  ADD CONSTRAINT "StoreDomain_platform_active" CHECK (type <> 'PLATFORM_SUBDOMAIN' OR status = 'ACTIVE'),
  -- Ownership tokens are random and published in DNS: long, URL-safe.
  ADD CONSTRAINT "StoreDomain_token_format" CHECK ("verificationToken" ~ '^[A-Za-z0-9_-]{32,128}$'),
  ADD CONSTRAINT "StoreDomain_failure_reason" CHECK ("failureReason" IS NULL OR char_length("failureReason") <= 64),
  ADD CONSTRAINT "StoreDomain_provider_ref" CHECK ("providerRef" IS NULL OR char_length("providerRef") <= 255);

-- 2. A row is one claim on one hostname: it can't be repointed at another
--    hostname or change kind (a new claim is a new row with a new token).
CREATE FUNCTION app_store_domain_immutable() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.hostname IS DISTINCT FROM OLD.hostname OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW."verificationToken" IS DISTINCT FROM OLD."verificationToken" THEN
      RAISE EXCEPTION 'StoreDomain hostname, type and token are immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "StoreDomain_immutable_claim" BEFORE UPDATE ON "StoreDomain"
  FOR EACH ROW EXECUTE FUNCTION app_store_domain_immutable();

-- 3. Invalidation only when routing changes (status, primary): the worker's
--    periodic lastCheckedAt/checkAttempts updates must not flush caches.
DROP TRIGGER "StoreDomain_outbox" ON "StoreDomain";
CREATE TRIGGER "StoreDomain_outbox_insert_delete" AFTER INSERT OR DELETE ON "StoreDomain"
  FOR EACH ROW EXECUTE FUNCTION app_outbox_emit('domain');
CREATE TRIGGER "StoreDomain_outbox_update" AFTER UPDATE ON "StoreDomain"
  FOR EACH ROW WHEN ((OLD.status, OLD."isPrimary") IS DISTINCT FROM (NEW.status, NEW."isPrimary"))
  EXECUTE FUNCTION app_outbox_emit('domain');

-- 4. The verification worker (storevia_worker: BYPASSRLS, column grants only).
GRANT SELECT (id, "organisationId", "storeId", hostname, type, status, "verificationToken",
  "isPrimary", "verifiedAt", "lastCheckedAt", "failureReason", "providerRef", "checkAttempts",
  "dnsRecords", "createdAt") ON "StoreDomain" TO storevia_worker;
GRANT UPDATE (status, "isPrimary", "verifiedAt", "lastCheckedAt", "failureReason", "providerRef",
  "checkAttempts", "dnsRecords", "updatedAt") ON "StoreDomain" TO storevia_worker;
GRANT SELECT (slug) ON "Store" TO storevia_worker;
