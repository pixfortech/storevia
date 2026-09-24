-- Milestone 1 hardening from the independent security review.
-- SQL-only (no Prisma model changes); see docs/architecture/03-tenancy.md §5.

-- Nobody but the schema owner may create objects in public (default on
-- PostgreSQL 15+, made explicit for older servers and restored databases).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Member-read policies apply only BEFORE an organisation is selected.
--    Inside an organisation/store scope, SELECT is limited by the strict
--    tenant policy alone, so a query that forgets its organisation predicate
--    can't return stores of the user's other organisations.
-- ---------------------------------------------------------------------------
DROP POLICY member_read ON "Organisation";
CREATE POLICY member_read ON "Organisation" FOR SELECT
  USING (app_current_org() IS NULL AND id IN (SELECT app_member_organisation_ids()));

DROP POLICY member_read ON "Store";
CREATE POLICY member_read ON "Store" FOR SELECT
  USING (app_current_org() IS NULL AND "organisationId" IN (SELECT app_member_organisation_ids()));

-- ---------------------------------------------------------------------------
-- 2. Column-level UPDATE grants for the application role. Platform-controlled
--    columns (status/suspension of organisations, suspension of stores) are
--    not writable by tenant code.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON "Organisation", "Store", "Membership", "Invitation" FROM storevia_app;
GRANT UPDATE (name, country, "billingEmail", "updatedAt") ON "Organisation" TO storevia_app;
GRANT UPDATE (name, locale, timezone, "contactEmail", "supportEmail", status, "archivedAt",
  "logoMediaId", "faviconMediaId", "updatedAt") ON "Store" TO storevia_app;
GRANT UPDATE (role, status, "allStores", "updatedAt") ON "Membership" TO storevia_app;
GRANT UPDATE (status, "acceptedById", "acceptedAt", "updatedAt") ON "Invitation" TO storevia_app;

-- Stores: tenant code may archive but never enter or leave SUSPENDED (a
-- platform decision). Roles with BYPASSRLS (platform, migrator) are exempt.
CREATE FUNCTION app_guard_store_suspension() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status
      AND (OLD.status = 'SUSPENDED' OR NEW.status = 'SUSPENDED')
      AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
      RAISE EXCEPTION 'store suspension can only be changed by the platform'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER "Store_guard_suspension" BEFORE UPDATE ON "Store"
  FOR EACH ROW EXECUTE FUNCTION app_guard_store_suspension();

-- ---------------------------------------------------------------------------
-- 3. Owner invariant: at commit, every non-deleted organisation touched by a
--    membership change has exactly one ACTIVE OWNER. Deferred so an ownership
--    transfer (demote then promote) is checked as a whole. SECURITY DEFINER so
--    the check sees all memberships regardless of the caller's RLS scope.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_check_single_active_owner() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    org uuid;
    owners integer;
  BEGIN
    FOREACH org IN ARRAY ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."organisationId" END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW."organisationId" END
    ] LOOP
      CONTINUE WHEN org IS NULL;
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM "Organisation" o WHERE o.id = org AND o.status <> 'DELETED');
      SELECT count(*) INTO owners FROM "Membership" m
        WHERE m."organisationId" = org AND m.role = 'OWNER' AND m.status = 'ACTIVE';
      IF owners <> 1 THEN
        RAISE EXCEPTION 'organisation % must have exactly one active owner (found %)', org, owners
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    RETURN NULL;
  END
  $$;

REVOKE ALL ON FUNCTION app_check_single_active_owner() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER "Membership_single_active_owner"
  AFTER INSERT OR UPDATE OR DELETE ON "Membership"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_check_single_active_owner();
