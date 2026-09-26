import "server-only";
import {
  catalogueTag,
  normalisePageNumber,
  normaliseSearchQuery,
  productTag,
  readStorefront,
  type CollectionDto,
  type ImageDto,
  type PageKindDto,
  type ProductCardDto,
  type ProductDto,
  type SearchDto,
} from "@storevia/commerce/storefront";
import { upgradeDocument, validateDocument, type PageDocument } from "@storevia/editor/document";
import { DEFAULT_REGISTRY, dataRequestKey, type DataRequest } from "@storevia/editor/registry";
import { collectRequirements } from "@storevia/editor/render";
import { DEFAULT_TEMPLATES } from "@storevia/editor/templates";
import { createLogger } from "@storevia/observability";
import { pageDataCache } from "@storevia/site-engine/cache";
import { pagesTag, storeTag } from "@storevia/site-engine/cache-tags";
import type { StoreRequestContext } from "@storevia/site-engine/context";

// Everything one storefront route needs, loaded in one read-only storefront
// transaction (ADR-0028 §7) and cached by store and route, tagged so the
// outbox can invalidate it (§9). This is the composition (ADR-0029): site
// content from the Site Engine's reader, catalogue from commerce's. Inputs are normalised before they become
// cache keys: bounded handles, queries and page numbers only.

const log = createLogger({ component: "storefront" });

export type StoreRoute =
  | { readonly kind: "home" }
  | { readonly kind: "product"; readonly handle: string }
  | { readonly kind: "collection"; readonly handle: string; readonly page: number }
  | { readonly kind: "search"; readonly query: string; readonly page: number }
  | { readonly kind: "page"; readonly handle: string }
  | { readonly kind: "not-found" };

const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A handle from the URL, or null when it can't be one (no lookup, no cache entry). */
export function routeHandle(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return decoded.length <= 100 && HANDLE_RE.test(decoded) ? decoded : null;
}

export const collectionRoute = (handle: string, page: unknown): StoreRoute => ({
  kind: "collection",
  handle,
  page: normalisePageNumber(page),
});

export const searchRoute = (query: unknown, page: unknown): StoreRoute => ({
  kind: "search",
  query: normaliseSearchQuery(query),
  page: normalisePageNumber(page),
});

const PAGE_KIND: Record<StoreRoute["kind"], PageKindDto> = {
  home: "HOME",
  product: "PRODUCT_TEMPLATE",
  collection: "COLLECTION_TEMPLATE",
  search: "SEARCH_TEMPLATE",
  page: "STANDARD",
  "not-found": "NOT_FOUND",
};

export interface PageMeta {
  readonly title: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
}

export interface RouteData {
  readonly found: boolean;
  readonly pageKind: PageKindDto;
  readonly page: PageMeta | null;
  readonly document: PageDocument;
  readonly productLists: readonly (readonly [string, readonly ProductCardDto[]])[];
  readonly product: ProductDto | null;
  readonly collection: CollectionDto | null;
  readonly search: SearchDto | null;
  readonly links: {
    readonly products: readonly (readonly [string, string])[];
    readonly collections: readonly (readonly [string, string])[];
    readonly pages: readonly (readonly [string, string])[];
  };
  readonly media: readonly (readonly [string, ImageDto])[];
}

/** The stored document if it upgrades and validates for its kind; otherwise null (logged). */
function usableDocument(raw: unknown, kind: PageKindDto, storeId: string): PageDocument | null {
  const upgraded = upgradeDocument(raw);
  const result = validateDocument(upgraded, { registry: DEFAULT_REGISTRY, pageKind: kind });
  if (result.ok) return result.document;
  log.warn("published page document is invalid; using the default", {
    storeId,
    kind,
    issues: result.issues.length,
  });
  return null;
}

const NOT_FOUND = (kind: PageKindDto): RouteData => ({
  found: false,
  pageKind: kind,
  page: null,
  document: DEFAULT_TEMPLATES.NOT_FOUND,
  productLists: [],
  product: null,
  collection: null,
  search: null,
  links: { products: [], collections: [], pages: [] },
  media: [],
});

async function loadRoute(
  store: StoreRequestContext,
  route: StoreRoute,
): Promise<{ value: RouteData; tags: string[] }> {
  const kind = PAGE_KIND[route.kind];
  const tags = [storeTag(store.storeId), pagesTag(store.storeId), catalogueTag(store.storeId)];
  const value = await readStorefront(store, async (reader, site) => {
    const published = await site.publishedPage(
      kind,
      route.kind === "page" ? route.handle : undefined,
    );
    const stored = published ? usableDocument(published.document, kind, store.storeId) : null;
    if (route.kind === "page" && !stored) return NOT_FOUND(kind);
    const document =
      stored ?? (kind === "STANDARD" ? DEFAULT_TEMPLATES.NOT_FOUND : DEFAULT_TEMPLATES[kind]);

    const requirements = collectRequirements(document, DEFAULT_REGISTRY);
    const wants = (k: DataRequest["kind"]) => requirements.requests.some((r) => r.kind === k);

    let product: ProductDto | null = null;
    if (route.kind === "product") {
      product = await reader.product(route.handle);
      if (!product) return NOT_FOUND(kind);
      tags.push(productTag(product.id));
    }
    let collection: CollectionDto | null = null;
    if (route.kind === "collection") {
      collection = await reader.collection(route.handle, route.page);
      if (!collection) return NOT_FOUND(kind);
    }
    const search =
      route.kind === "search" && wants("search")
        ? await reader.search(route.query, route.page)
        : null;

    const listRequests = requirements.requests.flatMap((r) =>
      r.kind === "product-list"
        ? [{ key: dataRequestKey(r), source: r.source, limit: r.limit }]
        : [],
    );
    const lists = listRequests.length > 0 ? await reader.productLists(listRequests) : new Map();
    const productLists = listRequests.map(
      (r) => [r.key, lists.get(`${JSON.stringify(r.source)}:${String(r.limit)}`) ?? []] as const,
    );
    const ids = (type: "product" | "collection" | "page") =>
      requirements.links.flatMap((l) => (l.type === type ? [l.id] : []));
    const links = await reader.links({
      products: ids("product"),
      collections: ids("collection"),
    });
    const pages = await site.pageLinks(ids("page"));
    const media =
      requirements.media.length > 0
        ? await site.media(requirements.media)
        : new Map<string, ImageDto>();
    return {
      found: true,
      pageKind: kind,
      page: published
        ? {
            title: published.title,
            seoTitle: published.seoTitle,
            seoDescription: published.seoDescription,
          }
        : null,
      document,
      productLists,
      product,
      collection,
      search,
      links: {
        products: [...links.products],
        collections: [...links.collections],
        pages: [...pages],
      },
      media: [...media],
    } satisfies RouteData;
  });
  return { value, tags };
}

/** The data for a route, from the cache or one storefront transaction. */
export function routeData(store: StoreRequestContext, route: StoreRoute): Promise<RouteData> {
  const key = `route:${store.storeId}:${JSON.stringify(route)}`;
  return pageDataCache().get(key, () => loadRoute(store, route));
}

export interface StoreChrome {
  readonly collections: readonly { readonly handle: string; readonly title: string }[];
}

/** Header navigation (collections until menus exist, M5). */
export function storeChrome(store: StoreRequestContext): Promise<StoreChrome> {
  return pageDataCache().get(`chrome:${store.storeId}`, async () => ({
    value: { collections: await readStorefront(store, (r) => r.navigationCollections()) },
    tags: [storeTag(store.storeId), catalogueTag(store.storeId)],
  }));
}

/** Sitemap paths for the store (cached like pages). */
export function storeSitemap(store: StoreRequestContext) {
  return pageDataCache().get(`sitemap:${store.storeId}`, async () => ({
    value: await readStorefront(store, async (reader, site) =>
      [...(await site.sitemapPages()), ...(await reader.sitemap())].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      ),
    ),
    tags: [storeTag(store.storeId), catalogueTag(store.storeId), pagesTag(store.storeId)],
  }));
}
