-- Custom-domain squatting (M8 security review S2). A hostname is globally
-- unique, and a claim that never proved ownership used to hold it forever:
-- any store with the custom_domain feature could block a domain's real
-- owner. An unproven claim now holds a hostname only while it is being
-- verified: once it has FAILED, or has stayed unverified for 72 hours,
-- another store adding the same hostname releases it. ACTIVE domains (DNS
-- ownership proven) are never released this way; they fail and become
-- releasable only after persistently losing their ownership record.
--
-- SECURITY DEFINER: the adding store can't see (or delete) another tenant's
-- row under RLS. The function deletes only a releasable row for exactly
-- this hostname, returns nothing about it, and records the release in the
-- previous owner's audit log.
CREATE FUNCTION app_release_stale_domain(host text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    released record;
  BEGIN
    DELETE FROM "StoreDomain" d
      WHERE d.hostname = host
        AND d.type = 'CUSTOM'
        AND d.status <> 'ACTIVE'
        AND NOT d."isPrimary"
        AND (d.status = 'FAILED' OR d."createdAt" < now() - interval '72 hours')
      RETURNING d.id, d."organisationId", d."storeId", d.status::text AS status
      INTO released;
    IF released.id IS NULL THEN
      RETURN false;
    END IF;
    INSERT INTO "AuditLog" (id, "organisationId", "storeId", "actorType", action, "entityType",
      "entityId", metadata)
    VALUES (gen_random_uuid(), released."organisationId", released."storeId", 'SYSTEM',
      'domain.released', 'StoreDomain', released.id,
      jsonb_build_object('hostname', host, 'status', released.status,
        'reason', 'Claimed by another store while unverified'));
    RETURN true;
  END
  $$;

REVOKE ALL ON FUNCTION app_release_stale_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_release_stale_domain(text) TO storevia_app;
