-- Multi-instance cache invalidation (M8). The worker turns outbox events into
-- cache tags and appends them here; every storefront instance tails the log
-- (id > its cursor, plus a short overlap for late commits) and drops the
-- matching entries from its in-process caches. The signed HTTP post stays as
-- a fast path for the instance that receives it. Tags carry store ids and
-- hostnames only: no tenant data, so the table is global, guarded by grants.
CREATE TABLE "StorefrontInvalidation" (
    "id" BIGSERIAL NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontInvalidation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontInvalidation_createdAt_idx" ON "StorefrontInvalidation"("createdAt");

ALTER TABLE "StorefrontInvalidation"
  ADD CONSTRAINT "StorefrontInvalidation_tags_bounded"
    CHECK (tags IS NOT NULL AND cardinality(tags) BETWEEN 1 AND 5000);

-- The worker writes and purges; storefront instances only read.
GRANT SELECT, INSERT, DELETE ON "StorefrontInvalidation" TO storevia_worker;
GRANT USAGE ON SEQUENCE "StorefrontInvalidation_id_seq" TO storevia_worker;
GRANT SELECT ON "StorefrontInvalidation" TO storevia_storefront;
