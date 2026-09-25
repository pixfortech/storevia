import "server-only";

// @storevia/commerce: catalogue, inventory and search services (ADR-0027).
// Server-only; the pure helpers (money, handles, rich text, variant
// planning) have client-safe entry points of their own.

export {
  adjustInventory,
  getProductStock,
  listInventory,
  listMovements,
  moveInventory,
  setInventory,
  setInventoryTracking,
  LOW_STOCK_THRESHOLD,
} from "./inventory";
export type {
  InventoryChange,
  InventoryRow,
  InventoryStockFilter,
  MovementView,
  VariantStock,
} from "./inventory";
export {
  createLocation,
  getLocation,
  listLocations,
  setLocationActive,
  updateLocation,
} from "./locations";
export type { LocationView } from "./locations";
export {
  archiveProduct,
  createProduct,
  getProduct,
  restoreProduct,
  setProductStatus,
  updateProduct,
  STALE_EDIT_MESSAGE,
} from "./products";
export type {
  BulkResult,
  MediaRendition,
  ProductDetails,
  ProductMediaView,
  ProductStatus,
  VariantView,
} from "./products";
export { changeProductOptions, updateVariants } from "./product-variants";
export type { OptionChangeResult, VariantRemoval } from "./product-variants";
export {
  attachProductMedia,
  detachProductMedia,
  reorderProductMedia,
  setProductMediaAlt,
} from "./product-media";
export {
  addProductsToCollection,
  createCollection,
  getCollection,
  listCollections,
  removeProductsFromCollection,
  reorderCollectionProducts,
  setCollectionArchived,
  updateCollection,
} from "./collections";
export type { CollectionDetails, CollectionSummary } from "./collections";
export { listProducts, searchProducts, PostgresSearchIndex } from "./search";
export type { ProductListItem, ProductListResult, ProductSearchQuery, SearchIndex } from "./search";
export { bulkProductAction } from "./bulk";
export { getCatalogueOverview } from "./overview";
export type { CatalogueOverview } from "./overview";
export { csvExporter, exportProducts } from "./import-export";
export type { ProductExporter, ProductImporter } from "./import-export";
export { getCatalogue } from "./catalogue";
export type { CatalogueProduct, CatalogueVariant } from "./catalogue";
