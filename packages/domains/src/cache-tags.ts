// Cache tags (ADR-0028 §9): the storefront tags cached data with these, and
// the worker turns outbox events into them. One module so both always agree.
//
//   store:{storeId}      everything cached for a store
//   catalogue:{storeId}  product lists, collections, search, navigation, sitemap
//   product:{productId}  one product page
//   pages:{storeId}      published content pages
//   host:{hostname}      one host resolution (in-process resolver cache)

export type CacheTag =
  `${"store" | "catalogue" | "product" | "pages"}:${string}` | `host:${string}`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TAG_RE = new RegExp(`^(?:(?:store|catalogue|product|pages):${UUID}|host:[a-z0-9.-]{1,253})$`);

export const storeTag = (storeId: string): CacheTag => `store:${storeId}`;
export const catalogueTag = (storeId: string): CacheTag => `catalogue:${storeId}`;
export const productTag = (productId: string): CacheTag => `product:${productId}`;
export const pagesTag = (storeId: string): CacheTag => `pages:${storeId}`;
export const hostTag = (hostname: string): CacheTag => `host:${hostname}`;

export function isCacheTag(value: unknown): value is CacheTag {
  return typeof value === "string" && TAG_RE.test(value);
}

export interface OutboxEventLike {
  readonly type: string;
  readonly storeId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: unknown;
}

/** The tags an outbox event invalidates. Unknown event types invalidate the whole store. */
export function cacheTagsForEvent(event: OutboxEventLike): CacheTag[] {
  switch (event.type) {
    case "product.changed":
    case "product.availability_changed":
      return [productTag(event.entityId), catalogueTag(event.storeId)];
    case "collection.changed":
      return [catalogueTag(event.storeId)];
    case "page.changed":
      return [pagesTag(event.storeId)];
    case "domain.changed": {
      const hostnames =
        typeof event.payload === "object" && event.payload !== null
          ? (event.payload as { hostnames?: unknown }).hostnames
          : undefined;
      const hosts = Array.isArray(hostnames)
        ? hostnames.filter((h): h is string => typeof h === "string").map(hostTag)
        : [];
      return [storeTag(event.storeId), ...hosts];
    }
    default:
      return [storeTag(event.storeId)];
  }
}
