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
export { getCategoryPath, listProductCategories, listProductTags } from "./taxonomy";
export type { CategoryRef, CategoryView, TagSuggestion } from "./taxonomy";
export { getCatalogueOverview } from "./overview";
export type { CatalogueOverview } from "./overview";
export { csvExporter, exportProducts } from "./import-export";
export type { ProductExporter, ProductImporter } from "./import-export";
export { getCatalogue } from "./catalogue";
export type { CatalogueProduct, CatalogueVariant } from "./catalogue";

// Orders, customers and store settings (ADR-0031).
export { getOrder, listOrders, loadOrderDetail } from "./orders/read";
export type { OrderDetail, OrderListItem, OrderListResult, OrderStatusFilter } from "./orders/read";
export {
  cancelOrder,
  fulfilOrder,
  refundOrder,
  resolvePendingRefund,
  updateOrderNote,
} from "./orders/manage";
export type { CancelResult, FulfilInput, RefundInput, RefundOutcome } from "./orders/manage";
export {
  completeOrder,
  deleteDemoOrder,
  demoOrderDeletionEnabled,
  markFulfilmentDelivered,
  resetCustomerOrderLink,
  setOrderArchived,
  updateFulfilment,
} from "./orders/operations";
export type { CompleteInput, FulfilmentUpdateInput } from "./orders/operations";
export * from "./orders/lifecycle";
export { ORDER_MESSAGE_MAX } from "./orders/customer";
export { orderMessages, replyToOrderMessage } from "./orders/messages";
export type { OrderMessageView } from "./orders/messages";
export {
  markStaffNotificationsRead,
  staffNotifications,
  unreadStaffNotifications,
} from "./orders/staff-notifications";
export type { StaffNotificationList, StaffNotificationView } from "./orders/staff-notifications";
export { eraseCustomer, getCustomer, listCustomers, updateCustomer } from "./customers";
export type { CustomerDetail, CustomerErasure, CustomerListItem } from "./customers";
export {
  createShippingRate,
  createShippingZone,
  deleteShippingRate,
  deleteShippingZone,
  getShippingSettings,
  updateShippingRate,
  updateShippingZone,
} from "./settings/shipping";
export type { ShippingRateView, ShippingZoneInput, ShippingZoneView } from "./settings/shipping";
export {
  createTaxRate,
  deleteTaxRate,
  getTaxSettings,
  percentToPpm,
  ppmToPercent,
  updateTaxRate,
  updateTaxSettings,
} from "./settings/tax";
export type { TaxRateView, TaxSettings } from "./settings/tax";
export {
  createDiscount,
  deleteDiscount,
  listDiscounts,
  setDiscountActive,
  updateDiscount,
} from "./settings/discounts";
export type { DiscountInput, DiscountState, DiscountView } from "./settings/discounts";
export {
  connectRazorpay,
  connectTestPayments,
  getPaymentSettings,
  setPaymentConnectionActive,
  testPaymentsSetupProblem,
} from "./settings/payments";
export type { PaymentConnectionView, PaymentSettings } from "./settings/payments";
export {
  orderMetrics,
  storeCustomerSummary,
  storeSalesSummary,
  SALES_MAX_DAYS,
} from "./orders/metrics";
export type {
  CustomerDay,
  CustomerPeriod,
  OrderMetrics,
  SalesDay,
  SalesPeriod,
  StoreCustomerSummary,
  StoreSalesSummary,
  TopProduct,
} from "./orders/metrics";

// Launch readiness (final pass, DB-1).
export { commerceLaunchChecks } from "./readiness";

// Seller identity and store policies (final pass, Phase 2A).
export {
  EMPTY_SELLER_PROFILE,
  REQUIRED_SELLER_FIELDS,
  getSellerProfile,
  isValidGstin,
  sellerProfileGaps,
  updateSellerProfile,
} from "./settings/seller";
export type { SellerProfile } from "./settings/seller";
export {
  getPolicy,
  listPolicies,
  policyBodyText,
  policyStarter,
  publishPolicy,
  savePolicyDraft,
  unpublishPolicy,
} from "./settings/policies";
export type { PolicyStatus, StorePolicyView } from "./settings/policies";
export * from "./policy-kinds";
