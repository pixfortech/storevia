-- Product taxonomy and tags (erd.md §4.3, 09-commerce.md "Categories, collections,
-- product types and tags"). Promotes ProductCategory, the global product
-- taxonomy deferred since Milestone 3: platform reference data with no tenant
-- columns, loaded from packages/database/prisma/reference/product-categories.json
-- by `pnpm db:seed` as the schema owner, readable by the dashboard and
-- storefront roles, writable by nobody else. Product.categoryCode becomes a
-- foreign key into it, and Product.tags gets a database-enforced shape and a
-- case-insensitive GIN index for the admin tag filter.

-- ---------------------------------------------------------------------------
-- 1. ProductCategory (Prisma model).
-- ---------------------------------------------------------------------------
CREATE TABLE "ProductCategory" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentCode" TEXT,
    "level" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "ProductCategory_parentCode_position_idx" ON "ProductCategory"("parentCode", "position");
CREATE INDEX "Product_categoryCode_storeId_idx" ON "Product"("categoryCode", "storeId");

-- Categories are deactivated, never deleted (the seed never issues DELETE),
-- so RESTRICT only ever fires on a mistake: a hand-run DELETE of a category
-- still in use fails loudly instead of silently stripping merchants'
-- products of their category (SET NULL) or deleting them (CASCADE).
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "ProductCategory"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No service has ever written categoryCode (it was reserved for this table),
-- so any value is stray; clear it so the foreign key can be added.
UPDATE "Product" SET "categoryCode" = NULL WHERE "categoryCode" IS NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryCode_fkey" FOREIGN KEY ("categoryCode") REFERENCES "ProductCategory"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Well-formed reference rows. Codes are stable slugs; names never contain
--    ">" (the path separator); a top-level category has level 1 and no parent.
--    The seed computes level and path from the parent chain and the
--    integration tests check every row against its parent.
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductCategory"
  ADD CONSTRAINT "ProductCategory_code_format"
    CHECK (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(code) <= 64),
  ADD CONSTRAINT "ProductCategory_name_format"
    CHECK (char_length(name) BETWEEN 1 AND 120 AND name = btrim(name) AND strpos(name, '>') = 0),
  ADD CONSTRAINT "ProductCategory_level_matches_parent"
    CHECK (level BETWEEN 1 AND 10 AND (("parentCode" IS NULL) = (level = 1))),
  ADD CONSTRAINT "ProductCategory_not_own_parent" CHECK ("parentCode" IS DISTINCT FROM code),
  ADD CONSTRAINT "ProductCategory_path_format"
    CHECK (char_length(path) BETWEEN 1 AND 1000 AND right(path, char_length(name)) = name),
  ADD CONSTRAINT "ProductCategory_position_nonnegative" CHECK (position >= 0);

-- Picker search: substring matches anywhere in the breadcrumb.
CREATE INDEX "ProductCategory_path_trgm" ON "ProductCategory" USING GIN (lower(path) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Tags. The commerce service normalises them (trimmed, whitespace
--    collapsed, no control characters or commas, de-duplicated ignoring case,
--    at most 50 of at most 40 characters); the database enforces the shape so
--    no other writer can store anything else. Existing rows are brought into
--    shape first (nothing is deployed yet; this only touches development data).
-- ---------------------------------------------------------------------------
CREATE FUNCTION catalogue_tags_valid(tags text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT tags IS NULL OR (
      cardinality(tags) <= 50
      AND NOT EXISTS (
        SELECT 1 FROM unnest(tags) AS t
        WHERE t IS NULL
          OR char_length(t) NOT BETWEEN 1 AND 40
          OR t <> btrim(t)
          OR t ~ '[[:cntrl:],]'))
  $$;

-- The tag filter matches regardless of case ("Summer" finds "summer").
CREATE FUNCTION catalogue_tags_folded(tags text[]) RETURNS text[]
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT coalesce(array_agg(lower(t)), '{}'::text[]) FROM unnest(tags) AS t
  $$;

UPDATE "Product" SET tags = ARRAY(
    SELECT btrim(left(btrim(regexp_replace(t, '[[:cntrl:],]+', ' ', 'g')), 40))
    FROM unnest(tags) WITH ORDINALITY AS u(t, n)
    WHERE t IS NOT NULL AND btrim(regexp_replace(t, '[[:cntrl:],]+', ' ', 'g')) <> ''
    ORDER BY n
    LIMIT 50)
  WHERE NOT catalogue_tags_valid(tags);

ALTER TABLE "Product" DROP CONSTRAINT "Product_text_lengths";
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_text_lengths"
    CHECK ((vendor IS NULL OR char_length(vendor) <= 255)
      AND ("productType" IS NULL OR char_length("productType") <= 255)),
  ADD CONSTRAINT "Product_tags_valid" CHECK (catalogue_tags_valid(tags));

CREATE INDEX "Product_tags_folded" ON "Product" USING GIN (catalogue_tags_folded(tags));

-- ---------------------------------------------------------------------------
-- 4. Grants. Reference data like the plan catalogue: no row-level security
--    (nothing in it belongs to a tenant), SELECT for the roles that show it,
--    and no write privilege for any application role. Only the schema owner
--    (the seed) writes it.
-- ---------------------------------------------------------------------------
GRANT SELECT ON "ProductCategory" TO storevia_app, storevia_storefront;
GRANT EXECUTE ON FUNCTION catalogue_tags_folded(text[]), catalogue_tags_valid(text[])
  TO storevia_app;
-- The public product page shows the category breadcrumb.
GRANT SELECT ("categoryCode") ON "Product" TO storevia_storefront;
