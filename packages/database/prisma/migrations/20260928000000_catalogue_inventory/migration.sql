-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InventoryPolicy" AS ENUM ('DENY', 'CONTINUE');

-- CreateEnum
CREATE TYPE "CollectionType" AS ENUM ('MANUAL', 'SMART');

-- CreateEnum
CREATE TYPE "CollectionSortOrder" AS ENUM ('MANUAL', 'BEST_SELLING', 'TITLE_ASC', 'TITLE_DESC', 'PRICE_ASC', 'PRICE_DESC', 'CREATED_DESC');

-- CreateEnum
CREATE TYPE "InventoryQuantityName" AS ENUM ('AVAILABLE', 'RESERVED', 'INCOMING');

-- CreateEnum
CREATE TYPE "InventoryMovementReason" AS ENUM ('INITIAL', 'SALE', 'RETURN', 'MANUAL_ADJUSTMENT', 'TRANSFER', 'RESTOCK', 'CANCELLATION', 'RESERVATION', 'RESERVATION_RELEASE', 'FULFILMENT', 'RECEIVED', 'CORRECTION');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "declaredMimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT,
    "altText" TEXT,
    "renditions" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "descriptionDoc" JSONB,
    "descriptionHtml" TEXT,
    "productType" TEXT,
    "vendor" TEXT,
    "tags" TEXT[],
    "categoryCode" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "optionSignature" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "currency" CHAR(3) NOT NULL,
    "priceAmount" BIGINT NOT NULL,
    "compareAtAmount" BIGINT,
    "costAmount" BIGINT,
    "weightGrams" INTEGER,
    "requiresShipping" BOOLEAN NOT NULL DEFAULT true,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "taxCode" TEXT,
    "inventoryPolicy" "InventoryPolicy" NOT NULL DEFAULT 'DENY',
    "imageMediaId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantOptionValue" (
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "optionValueId" UUID NOT NULL,

    CONSTRAINT "ProductVariantOptionValue_pkey" PRIMARY KEY ("variantId","optionId")
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "altText" TEXT,

    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "type" "CollectionType" NOT NULL DEFAULT 'MANUAL',
    "rules" JSONB,
    "sortOrder" "CollectionSortOrder" NOT NULL DEFAULT 'MANUAL',
    "descriptionDoc" JSONB,
    "descriptionHtml" TEXT,
    "imageMediaId" UUID,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProduct" (
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2) NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fulfilsOnlineOrders" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "tracked" BOOLEAN NOT NULL DEFAULT true,
    "countryOfOrigin" CHAR(2),
    "hsCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLevel" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "incoming" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "quantityName" "InventoryQuantityName" NOT NULL,
    "delta" INTEGER NOT NULL,
    "resultingValue" INTEGER NOT NULL,
    "reason" "InventoryMovementReason" NOT NULL,
    "referenceType" TEXT,
    "referenceId" UUID,
    "note" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_storeId_createdAt_idx" ON "MediaAsset"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_storeId_kind_status_idx" ON "MediaAsset"("storeId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_id_storeId_key" ON "MediaAsset"("id", "storeId");

-- CreateIndex
CREATE INDEX "Product_storeId_status_updatedAt_idx" ON "Product"("storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Product_createdById_idx" ON "Product"("createdById");

-- CreateIndex
CREATE INDEX "Product_updatedById_idx" ON "Product"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_storeId_key" ON "Product"("id", "storeId");

-- CreateIndex
CREATE INDEX "ProductOption_storeId_idx" ON "ProductOption"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_position_key" ON "ProductOption"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_id_storeId_key" ON "ProductOption"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_id_productId_key" ON "ProductOption"("id", "productId");

-- CreateIndex
CREATE INDEX "ProductOptionValue_storeId_idx" ON "ProductOptionValue"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_optionId_value_key" ON "ProductOptionValue"("optionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_id_storeId_key" ON "ProductOptionValue"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_id_optionId_key" ON "ProductOptionValue"("id", "optionId");

-- CreateIndex
CREATE INDEX "ProductVariant_storeId_sku_idx" ON "ProductVariant"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_optionSignature_key" ON "ProductVariant"("productId", "optionSignature");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_id_storeId_key" ON "ProductVariant"("id", "storeId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_optionValueId_idx" ON "ProductVariantOptionValue"("optionValueId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_storeId_idx" ON "ProductVariantOptionValue"("storeId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_optionId_idx" ON "ProductVariantOptionValue"("optionId");

-- CreateIndex
CREATE INDEX "ProductMedia_productId_position_idx" ON "ProductMedia"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductMedia_storeId_idx" ON "ProductMedia"("storeId");

-- CreateIndex
CREATE INDEX "ProductMedia_mediaAssetId_idx" ON "ProductMedia"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMedia_productId_mediaAssetId_key" ON "ProductMedia"("productId", "mediaAssetId");

-- CreateIndex
CREATE INDEX "Collection_storeId_updatedAt_idx" ON "Collection"("storeId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_id_storeId_key" ON "Collection"("id", "storeId");

-- CreateIndex
CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");

-- CreateIndex
CREATE INDEX "CollectionProduct_collectionId_position_idx" ON "CollectionProduct"("collectionId", "position");

-- CreateIndex
CREATE INDEX "CollectionProduct_storeId_idx" ON "CollectionProduct"("storeId");

-- CreateIndex
CREATE INDEX "Location_storeId_idx" ON "Location"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_id_storeId_key" ON "Location"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_variantId_key" ON "InventoryItem"("variantId");

-- CreateIndex
CREATE INDEX "InventoryItem_storeId_idx" ON "InventoryItem"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_id_storeId_key" ON "InventoryItem"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_variantId_storeId_key" ON "InventoryItem"("variantId", "storeId");

-- CreateIndex
CREATE INDEX "InventoryLevel_locationId_idx" ON "InventoryLevel"("locationId");

-- CreateIndex
CREATE INDEX "InventoryLevel_storeId_idx" ON "InventoryLevel"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLevel_inventoryItemId_locationId_key" ON "InventoryLevel"("inventoryItemId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryItemId_createdAt_idx" ON "InventoryMovement"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_createdAt_idx" ON "InventoryMovement"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_locationId_idx" ON "InventoryMovement"("locationId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_storeId_fkey" FOREIGN KEY ("productId", "storeId") REFERENCES "Product"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_storeId_fkey" FOREIGN KEY ("optionId", "storeId") REFERENCES "ProductOption"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_storeId_fkey" FOREIGN KEY ("productId", "storeId") REFERENCES "Product"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_variantId_storeId_fkey" FOREIGN KEY ("variantId", "storeId") REFERENCES "ProductVariant"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_optionId_storeId_fkey" FOREIGN KEY ("optionId", "storeId") REFERENCES "ProductOption"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_optionValueId_optionId_fkey" FOREIGN KEY ("optionValueId", "optionId") REFERENCES "ProductOptionValue"("id", "optionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_storeId_fkey" FOREIGN KEY ("productId", "storeId") REFERENCES "Product"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_mediaAssetId_storeId_fkey" FOREIGN KEY ("mediaAssetId", "storeId") REFERENCES "MediaAsset"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_storeId_fkey" FOREIGN KEY ("collectionId", "storeId") REFERENCES "Collection"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_storeId_fkey" FOREIGN KEY ("productId", "storeId") REFERENCES "Product"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_variantId_storeId_fkey" FOREIGN KEY ("variantId", "storeId") REFERENCES "ProductVariant"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLevel" ADD CONSTRAINT "InventoryLevel_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLevel" ADD CONSTRAINT "InventoryLevel_inventoryItemId_storeId_fkey" FOREIGN KEY ("inventoryItemId", "storeId") REFERENCES "InventoryItem"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLevel" ADD CONSTRAINT "InventoryLevel_locationId_storeId_fkey" FOREIGN KEY ("locationId", "storeId") REFERENCES "Location"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_storeId_fkey" FOREIGN KEY ("inventoryItemId", "storeId") REFERENCES "InventoryItem"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_storeId_fkey" FOREIGN KEY ("locationId", "storeId") REFERENCES "Location"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Hand-written SQL (ADR-0020, ADR-0027, erd.md §6). Prisma cannot express the
-- constraints below; each is covered by integration tests.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Optional media references stay inside their store (erd.md §6, rule 5).
--    A composite FK with ON DELETE SET NULL (col) would express this, but
--    Prisma can't model it and would drop it as drift, so a trigger checks
--    it instead. Media rows are never hard-deleted by the app role (no DELETE
--    grant); the purge job clears references before removing an asset.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_media_in_same_store() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    col text;
    media_id uuid;
    store_id uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  BEGIN
    FOREACH col IN ARRAY TG_ARGV[1:] LOOP
      media_id := (to_jsonb(NEW) ->> col)::uuid;
      IF media_id IS NOT NULL
        AND (TG_OP = 'INSERT' OR media_id IS DISTINCT FROM (to_jsonb(OLD) ->> col)::uuid)
        AND NOT EXISTS (SELECT 1 FROM "MediaAsset" m WHERE m.id = media_id AND m."storeId" = store_id)
      THEN
        RAISE EXCEPTION '%.% must reference media in the same store', TG_TABLE_NAME, col
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END LOOP;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "ProductVariant_media_same_store" BEFORE INSERT OR UPDATE ON "ProductVariant"
  FOR EACH ROW EXECUTE FUNCTION app_media_in_same_store('storeId', 'imageMediaId');
CREATE TRIGGER "Collection_media_same_store" BEFORE INSERT OR UPDATE ON "Collection"
  FOR EACH ROW EXECUTE FUNCTION app_media_in_same_store('storeId', 'imageMediaId');
-- Promised by the first migration: a store's logo and favicon are its own media.
CREATE TRIGGER "Store_media_same_store" BEFORE INSERT OR UPDATE ON "Store"
  FOR EACH ROW EXECUTE FUNCTION app_media_in_same_store('id', 'logoMediaId', 'faviconMediaId');

-- ---------------------------------------------------------------------------
-- 2. Immutable ownership columns (organisationId / storeId never move).
-- ---------------------------------------------------------------------------
CREATE TRIGGER "MediaAsset_immutable_owner" BEFORE UPDATE ON "MediaAsset"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "Product_immutable_owner" BEFORE UPDATE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "ProductOption_immutable_owner" BEFORE UPDATE ON "ProductOption"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "ProductOptionValue_immutable_owner" BEFORE UPDATE ON "ProductOptionValue"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "ProductVariant_immutable_owner" BEFORE UPDATE ON "ProductVariant"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "ProductVariantOptionValue_immutable_owner" BEFORE UPDATE ON "ProductVariantOptionValue"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "ProductMedia_immutable_owner" BEFORE UPDATE ON "ProductMedia"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "Collection_immutable_owner" BEFORE UPDATE ON "Collection"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "CollectionProduct_immutable_owner" BEFORE UPDATE ON "CollectionProduct"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "Location_immutable_owner" BEFORE UPDATE ON "Location"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "InventoryItem_immutable_owner" BEFORE UPDATE ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "InventoryLevel_immutable_owner" BEFORE UPDATE ON "InventoryLevel"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();
CREATE TRIGGER "InventoryMovement_immutable_owner" BEFORE UPDATE ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change();

-- A variant's parent product and an inventory row's item/location never change.
CREATE FUNCTION app_forbid_parent_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    col text;
  BEGIN
    FOREACH col IN ARRAY TG_ARGV LOOP
      IF (to_jsonb(NEW) ->> col) IS DISTINCT FROM (to_jsonb(OLD) ->> col) THEN
        RAISE EXCEPTION '%.% is immutable', TG_TABLE_NAME, col USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "ProductVariant_immutable_parent" BEFORE UPDATE ON "ProductVariant"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('productId', 'currency');
CREATE TRIGGER "InventoryItem_immutable_parent" BEFORE UPDATE ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('variantId');
CREATE TRIGGER "InventoryLevel_immutable_parent" BEFORE UPDATE ON "InventoryLevel"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('inventoryItemId', 'locationId');

-- A variant's option values belong to options of the variant's own product
-- (the composite FKs only prove they share a store).
CREATE FUNCTION app_variant_option_same_product() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF (SELECT "productId" FROM "ProductVariant" WHERE id = NEW."variantId")
      IS DISTINCT FROM (SELECT "productId" FROM "ProductOption" WHERE id = NEW."optionId") THEN
      RAISE EXCEPTION 'variant and option belong to different products'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "ProductVariantOptionValue_same_product"
  BEFORE INSERT OR UPDATE ON "ProductVariantOptionValue"
  FOR EACH ROW EXECUTE FUNCTION app_variant_option_same_product();

-- Every price in a store is in the store's currency (ADR-0027 §3). The store
-- currency is not updatable by the app role, so checking on insert suffices.
CREATE FUNCTION app_variant_currency_matches_store() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NEW.currency IS DISTINCT FROM (SELECT currency FROM "Store" WHERE id = NEW."storeId") THEN
      RAISE EXCEPTION 'variant currency % does not match the store currency', NEW.currency
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "ProductVariant_store_currency" BEFORE INSERT ON "ProductVariant"
  FOR EACH ROW EXECUTE FUNCTION app_variant_currency_matches_store();

-- ---------------------------------------------------------------------------
-- 3. Partial unique indexes and CHECK constraints (erd.md §6).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "Product_handle_live" ON "Product" ("storeId", handle) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Collection_handle_live" ON "Collection" ("storeId", handle) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ProductVariant_sku_live"
  ON "ProductVariant" ("storeId", sku) WHERE sku IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Location_code_live" ON "Location" ("storeId", code) WHERE "deletedAt" IS NULL;
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant" ("storeId", barcode) WHERE barcode IS NOT NULL;

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_filename_length" CHECK (char_length(filename) BETWEEN 1 AND 255),
  ADD CONSTRAINT "MediaAsset_alt_length" CHECK ("altText" IS NULL OR char_length("altText") <= 512),
  ADD CONSTRAINT "MediaAsset_size_nonnegative" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0),
  ADD CONSTRAINT "MediaAsset_dimensions_positive"
    CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
  ADD CONSTRAINT "MediaAsset_storage_key_owned"
    CHECK ("storageKey" LIKE "organisationId"::text || '/' || "storeId"::text || '/' || id::text || '/%');

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_title_length" CHECK (char_length(btrim(title)) BETWEEN 1 AND 255),
  ADD CONSTRAINT "Product_handle_format"
    CHECK (handle ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(handle) <= 100),
  ADD CONSTRAINT "Product_archived_matches_status"
    CHECK ((status = 'ARCHIVED') = ("archivedAt" IS NOT NULL)),
  ADD CONSTRAINT "Product_seo_length"
    CHECK ((("seoTitle" IS NULL) OR char_length("seoTitle") <= 255)
      AND (("seoDescription" IS NULL) OR char_length("seoDescription") <= 1000)),
  ADD CONSTRAINT "Product_text_lengths"
    CHECK ((vendor IS NULL OR char_length(vendor) <= 255)
      AND ("productType" IS NULL OR char_length("productType") <= 255)
      AND cardinality(tags) <= 250),
  ADD CONSTRAINT "Product_description_html_length"
    CHECK ("descriptionHtml" IS NULL OR char_length("descriptionHtml") <= 200000);

ALTER TABLE "ProductOption"
  ADD CONSTRAINT "ProductOption_name_length" CHECK (char_length(btrim(name)) BETWEEN 1 AND 255),
  ADD CONSTRAINT "ProductOption_position_range" CHECK (position BETWEEN 0 AND 2);
ALTER TABLE "ProductOptionValue"
  ADD CONSTRAINT "ProductOptionValue_value_length" CHECK (char_length(btrim(value)) BETWEEN 1 AND 255),
  ADD CONSTRAINT "ProductOptionValue_position_nonnegative" CHECK (position >= 0);

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_title_length" CHECK (char_length(title) BETWEEN 1 AND 800),
  ADD CONSTRAINT "ProductVariant_currency_format" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("priceAmount" >= 0),
  ADD CONSTRAINT "ProductVariant_cost_nonnegative" CHECK ("costAmount" IS NULL OR "costAmount" >= 0),
  ADD CONSTRAINT "ProductVariant_compare_at_above_price"
    CHECK ("compareAtAmount" IS NULL OR "compareAtAmount" > "priceAmount"),
  ADD CONSTRAINT "ProductVariant_weight_nonnegative" CHECK ("weightGrams" IS NULL OR "weightGrams" >= 0),
  ADD CONSTRAINT "ProductVariant_sku_format"
    CHECK (sku IS NULL OR (char_length(sku) BETWEEN 1 AND 255 AND sku = btrim(sku))),
  ADD CONSTRAINT "ProductVariant_barcode_format"
    CHECK (barcode IS NULL OR (char_length(barcode) BETWEEN 1 AND 64 AND barcode = btrim(barcode))),
  ADD CONSTRAINT "ProductVariant_position_nonnegative" CHECK (position >= 0),
  -- A live variant's signature is its option values; a deleted one is freed.
  ADD CONSTRAINT "ProductVariant_signature_matches_state"
    CHECK (("deletedAt" IS NULL) = ("optionSignature" NOT LIKE 'deleted:%'));

ALTER TABLE "ProductMedia"
  ADD CONSTRAINT "ProductMedia_position_nonnegative" CHECK (position >= 0),
  ADD CONSTRAINT "ProductMedia_alt_length" CHECK ("altText" IS NULL OR char_length("altText") <= 512);

ALTER TABLE "Collection"
  ADD CONSTRAINT "Collection_title_length" CHECK (char_length(btrim(title)) BETWEEN 1 AND 255),
  ADD CONSTRAINT "Collection_handle_format"
    CHECK (handle ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(handle) <= 100),
  ADD CONSTRAINT "Collection_rules_match_type" CHECK ((type = 'SMART') = (rules IS NOT NULL)),
  ADD CONSTRAINT "Collection_seo_length"
    CHECK ((("seoTitle" IS NULL) OR char_length("seoTitle") <= 255)
      AND (("seoDescription" IS NULL) OR char_length("seoDescription") <= 1000));
ALTER TABLE "CollectionProduct"
  ADD CONSTRAINT "CollectionProduct_position_nonnegative" CHECK (position >= 0);

ALTER TABLE "Location"
  ADD CONSTRAINT "Location_name_length" CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  ADD CONSTRAINT "Location_code_format" CHECK (code ~ '^[A-Z0-9](?:[A-Z0-9-]{0,18}[A-Z0-9])?$'),
  ADD CONSTRAINT "Location_country_format" CHECK ("countryCode" ~ '^[A-Z]{2}$');

ALTER TABLE "InventoryLevel"
  ADD CONSTRAINT "InventoryLevel_reserved_nonnegative" CHECK (reserved >= 0),
  ADD CONSTRAINT "InventoryLevel_incoming_nonnegative" CHECK (incoming >= 0);
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_delta_nonzero" CHECK (delta <> 0),
  ADD CONSTRAINT "InventoryMovement_note_length" CHECK (note IS NULL OR char_length(note) <= 500),
  ADD CONSTRAINT "InventoryMovement_reference_pair"
    CHECK (("referenceType" IS NULL) = ("referenceId" IS NULL));

-- ---------------------------------------------------------------------------
-- 4. Search (ADR-0018): an expression GIN index over the searchable text, and
-- trigram indexes for fuzzy title/SKU look-ups. 'simple' keeps every language
-- searchable without stemming. The function is IMMUTABLE by construction
-- (text[] output is deterministic), which expression indexes require.
-- ---------------------------------------------------------------------------
CREATE FUNCTION catalogue_search_document(
  title text, handle text, vendor text, product_type text, tags text[]
) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT setweight(to_tsvector('simple', coalesce(title, '')), 'A')
      || setweight(to_tsvector('simple', replace(coalesce(handle, ''), '-', ' ')), 'B')
      || setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'B')
      || setweight(to_tsvector('simple', coalesce(vendor, '') || ' ' || coalesce(product_type, '')), 'C')
  $$;
CREATE INDEX "Product_search" ON "Product"
  USING GIN (catalogue_search_document(title, handle, vendor, "productType", tags));
CREATE INDEX "Product_title_trgm" ON "Product" USING GIN (lower(title) gin_trgm_ops);
CREATE INDEX "ProductVariant_sku_trgm" ON "ProductVariant"
  USING GIN (lower(sku) gin_trgm_ops) WHERE sku IS NOT NULL;
CREATE INDEX "Collection_title_trgm" ON "Collection" USING GIN (lower(title) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 5. Row-level security: every catalogue table is store-scoped (03-tenancy §5.2).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['MediaAsset', 'Product', 'ProductOption', 'ProductOptionValue',
    'ProductVariant', 'ProductVariantOptionValue', 'ProductMedia', 'Collection',
    'CollectionProduct', 'Location', 'InventoryItem', 'InventoryLevel', 'InventoryMovement'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organisationId" = app_current_org()
           AND (app_current_store() IS NULL OR "storeId" = app_current_store()))
         WITH CHECK ("organisationId" = app_current_org()
           AND (app_current_store() IS NULL OR "storeId" = app_current_store()))', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants. Products and collections are archived, never deleted; the
-- inventory ledger is append-only and levels change only through the
-- inventory service's conditional updates (ADR-0027 §8).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION catalogue_search_document(text, text, text, text, text[]) TO storevia_app;
GRANT SELECT, INSERT, UPDATE ON "MediaAsset", "Product", "Collection", "Location" TO storevia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProductOption", "ProductOptionValue", "ProductVariant",
  "ProductVariantOptionValue", "ProductMedia", "CollectionProduct", "InventoryItem" TO storevia_app;
GRANT SELECT, INSERT, UPDATE ON "InventoryLevel" TO storevia_app;
GRANT SELECT, INSERT ON "InventoryMovement" TO storevia_app;

-- Platform staff: read-only diagnostics (counts), never catalogue content.
GRANT SELECT (id, "organisationId", "storeId", status, "deletedAt") ON "Product" TO storevia_platform;
GRANT SELECT (id, "organisationId", "storeId", "deletedAt") ON "ProductVariant" TO storevia_platform;
GRANT SELECT (id, "organisationId", "storeId", "isActive", "deletedAt") ON "Location" TO storevia_platform;
GRANT SELECT (id, "organisationId", "storeId", tracked) ON "InventoryItem" TO storevia_platform;
GRANT SELECT ("organisationId", "storeId", available, reserved) ON "InventoryLevel" TO storevia_platform;
GRANT SELECT (id, "organisationId", "storeId", status, "sizeBytes", renditions, "deletedAt")
  ON "MediaAsset" TO storevia_platform;

-- ---------------------------------------------------------------------------
-- 7. Gauge sources for product_limit and media_storage (ADR-0027 §7, §9).
-- They count organisation-wide, but products and media are store-scoped, so a
-- merchant request (which runs in one store's RLS scope) could only count its
-- own store. These SECURITY DEFINER functions count across the organisation's
-- stores, and only for the organisation in the caller's tenant context, or
-- for roles that bypass RLS anyway (worker and platform reconciliation).
-- They return a number, never rows.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_usage_caller_may_count(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    -- coalesce: a NULL here must refuse, never fall through IF NOT.
    SELECT coalesce(org = app_current_org(), false)
      OR (app_current_org() IS NULL
          AND coalesce((SELECT rolbypassrls FROM pg_roles WHERE rolname = session_user), false))
  $$;

CREATE FUNCTION app_usage_live_products(org uuid) RETURNS bigint
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT app_usage_caller_may_count(org) THEN
      RAISE EXCEPTION 'usage can only be counted for the current organisation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (SELECT count(*) FROM "Product"
      WHERE "organisationId" = org AND status <> 'ARCHIVED' AND "deletedAt" IS NULL);
  END
  $$;

-- Stored bytes: the original plus every rendition (renditions carry "bytes").
CREATE FUNCTION app_usage_media_bytes(org uuid) RETURNS bigint
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT app_usage_caller_may_count(org) THEN
      RAISE EXCEPTION 'usage can only be counted for the current organisation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (SELECT coalesce(sum(coalesce(m."sizeBytes", 0) + coalesce((
        SELECT sum((r ->> 'bytes')::bigint) FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(m.renditions) = 'array' THEN m.renditions ELSE '[]'::jsonb END) r
      ), 0)), 0)::bigint
      FROM "MediaAsset" m
      WHERE m."organisationId" = org AND m.status = 'READY' AND m."deletedAt" IS NULL);
  END
  $$;

REVOKE ALL ON FUNCTION app_usage_caller_may_count(uuid), app_usage_live_products(uuid),
  app_usage_media_bytes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_usage_live_products(uuid), app_usage_media_bytes(uuid)
  TO storevia_app, storevia_worker, storevia_platform, storevia_system;
