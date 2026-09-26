// Commerce cache tags (ADR-0029): catalogue and product data composed into
// the Site Engine's tag grammar and event mapping.
//
//   catalogue:{storeId}  product lists, collections, search, navigation, sitemap
//   product:{productId}  one product page
import {
  SITE_TAG_NAMESPACES,
  cacheTagGrammar,
  composeEventTags,
  type CacheTag,
  type OutboxEventLike,
} from "@storevia/site-engine/cache-tags";

export const COMMERCE_TAG_NAMESPACES = ["catalogue", "product"] as const;

export const catalogueTag = (storeId: string): CacheTag => `catalogue:${storeId}`;
export const productTag = (productId: string): CacheTag => `product:${productId}`;

/** Catalogue events, or null for events that aren't commerce's. */
export function commerceCacheTagsForEvent(event: OutboxEventLike): CacheTag[] | null {
  switch (event.type) {
    case "product.changed":
    case "product.availability_changed":
      return [productTag(event.entityId), catalogueTag(event.storeId)];
    case "collection.changed":
      return [catalogueTag(event.storeId)];
    default:
      return null;
  }
}

/** Every tag a Storevia store uses: the Site Engine's and commerce's. */
export const isStorefrontCacheTag = cacheTagGrammar([
  ...SITE_TAG_NAMESPACES,
  ...COMMERCE_TAG_NAMESPACES,
]);

/** Storevia's event → tag mapping: commerce first, then the Site Engine. */
export const storefrontCacheTagsForEvent = composeEventTags(commerceCacheTagsForEvent);
