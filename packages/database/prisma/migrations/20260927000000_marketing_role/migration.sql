-- Milestone 2.5: marketing-site role (ADR-0025). No schema changes.
-- storevia_marketing (LOGIN NOBYPASSRLS) is created by infrastructure /
-- `pnpm db:setup` beforehand.

-- The public plan catalogue: read-only. The pricing page shows only public,
-- ACTIVE plans (filtered in loadPublicCatalogue); none of these tables hold
-- tenant data.
GRANT SELECT ON "Plan", "PlanPrice", "Feature", "PlanFeature" TO storevia_marketing;

-- Contact-form rate limits share the RateLimit table. Row-level security
-- confines the marketing role to its own "marketing:" buckets, so it can never
-- read or reset sign-in and password-reset limits. storevia_system (BYPASSRLS)
-- and the table owner are unaffected; no other role has privileges on it.
ALTER TABLE "RateLimit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_own_buckets ON "RateLimit" TO storevia_marketing
  USING (key LIKE 'marketing:%')
  WITH CHECK (key LIKE 'marketing:%');
GRANT SELECT, INSERT, UPDATE ON "RateLimit" TO storevia_marketing;
