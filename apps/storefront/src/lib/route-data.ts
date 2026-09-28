import "server-only";
import {
  STOREVIA_REGISTRY,
  STOREVIA_TEMPLATES,
  EMPTY_DOCUMENT_DATA,
  linkHref,
  type DocumentData,
  type StoreviaPageKind,
} from "@storevia/commerce/blocks";
import {
  catalogueTag,
  normalisePageNumber,
  normaliseSearchQuery,
  productTag,
  readStorefront,
  resolveDocumentData,
  type CollectionDto,
  type ProductDto,
  type SearchDto,
} from "@storevia/commerce/storefront";
import { upgradeDocument, validateDocument, type PageDocument } from "@storevia/editor/document";
import { NAVIGATION_HANDLES, usableNavigationItems } from "@storevia/editor/navigation";
import { firstSectionHasHeading } from "@storevia/editor/render";
import { createLogger, recordMetric } from "@storevia/observability";
import { pageDataCache } from "@storevia/site-engine/cache";
import { designTag, pagesTag, storeTag } from "@storevia/site-engine/cache-tags";
import type { StoreRequestContext } from "@storevia/site-engine/context";
import type { MenuLink } from "@storevia/site-engine/shell";
import { THEME_PLATFORM, renderableTheme, type ThemeTokens } from "@storevia/editor/theme";

// Everything one storefront route needs, loaded in one read-only storefront
// transaction (ADR-0028 §7) and cached by store and route, tagged so the
// outbox can invalidate it (§9). This is the composition (ADR-0029,
// ADR-0030): the page from the Site Engine's reader, rendered with the
// Storevia registry, its data resolved in batch by commerce's resolver.
// Inputs are normalised before they become cache keys: bounded handles,
// queries and page numbers only. A preview (a verified, store-bound token)
// reads drafts and never touches the shared cache.

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

const PAGE_KIND: Record<StoreRoute["kind"], StoreviaPageKind> = {
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
  readonly pageKind: StoreviaPageKind;
  readonly page: PageMeta | null;
  readonly document: PageDocument;
  /** False when the first section doesn't carry the page's h1 (the host adds one). */
  readonly hasHeading: boolean;
  readonly data: DocumentData;
  readonly product: ProductDto | null;
  readonly collection: CollectionDto | null;
  readonly search: SearchDto | null;
}

/** The stored document if it upgrades and validates for its kind; otherwise null (logged, never the document). */
function usableDocument(
  raw: unknown,
  kind: StoreviaPageKind,
  storeId: string,
): PageDocument | null {
  const upgraded = upgradeDocument(raw);
  const result = validateDocument(upgraded, { registry: STOREVIA_REGISTRY, pageKind: kind });
  if (result.ok) return result.document;
  log.warn("page document is invalid; using the default", {
    storeId,
    kind,
    issues: result.issues.length,
  });
  recordMetric("storefront.invalid_document", 1, { kind });
  return null;
}

const NOT_FOUND = (kind: StoreviaPageKind): RouteData => ({
  found: false,
  pageKind: kind,
  page: null,
  document: STOREVIA_TEMPLATES.NOT_FOUND,
  hasHeading: true,
  data: EMPTY_DOCUMENT_DATA,
  product: null,
  collection: null,
  search: null,
});

async function loadRoute(
  store: StoreRequestContext,
  route: StoreRoute,
): Promise<{ value: RouteData; tags: string[] }> {
  const kind = PAGE_KIND[route.kind];
  const tags = [storeTag(store.storeId), pagesTag(store.storeId), catalogueTag(store.storeId)];
  const value = await readStorefront(
    store,
    async (reader, site) => {
      const page = await site.page(kind, route.kind === "page" ? route.handle : undefined);
      const stored = page ? usableDocument(page.document, kind, store.storeId) : null;
      if (route.kind === "page" && !stored) return NOT_FOUND(kind);
      const document =
        stored ?? (kind === "STANDARD" ? STOREVIA_TEMPLATES.NOT_FOUND : STOREVIA_TEMPLATES[kind]);

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
      const { data, wants } = await resolveDocumentData(
        [document],
        STOREVIA_REGISTRY,
        reader,
        site,
      );
      const search =
        route.kind === "search" && wants.has("search")
          ? await reader.search(route.query, route.page)
          : null;
      return {
        found: true,
        pageKind: kind,
        page: page
          ? { title: page.title, seoTitle: page.seoTitle, seoDescription: page.seoDescription }
          : null,
        document,
        hasHeading: firstSectionHasHeading(document, STOREVIA_REGISTRY),
        data,
        product,
        collection,
        search,
      } satisfies RouteData;
    },
    { preview: store.preview },
  );
  return { value, tags };
}

/** The data for a route: from the cache or one storefront transaction (previews bypass the cache). */
export function routeData(store: StoreRequestContext, route: StoreRoute): Promise<RouteData> {
  if (store.preview) return loadRoute(store, route).then((r) => r.value);
  const key = `route:${store.storeId}:${JSON.stringify(route)}`;
  return pageDataCache().get(key, () => loadRoute(store, route));
}

// ---------------------------------------------------------------------------
// Chrome: theme and menus, shared by every page of the store.
// ---------------------------------------------------------------------------

export interface StoreChrome {
  readonly theme: ThemeTokens;
  /** The theme package that renders the store (the default when the stored one can't be used). */
  readonly themeKey: string;
  /** In a preview of an installed theme that isn't live: its name (for the preview banner). */
  readonly previewingTheme: string | null;
  readonly mainMenu: readonly MenuLink[];
  readonly footerMenu: readonly MenuLink[];
}

async function loadChrome(store: StoreRequestContext): Promise<StoreChrome> {
  return readStorefront(
    store,
    async (reader, site) => {
      const [themeRow, menus] = await Promise.all([
        site.theme(),
        site.navigation(NAVIGATION_HANDLES),
      ]);
      // The theme package by the stored key, its settings migrated and
      // validated; an unknown or incompatible theme, or invalid settings,
      // render the default instead of a broken store.
      const rendered = renderableTheme(themeRow, THEME_PLATFORM);
      if (rendered.fallback) {
        log.warn("store theme can't be used as stored; using a fallback", {
          storeId: store.storeId,
          themeKey: themeRow?.themeKey,
          reason: rendered.fallback,
        });
      }
      const main = usableNavigationItems(menus.get("main"), STOREVIA_REGISTRY.linkSchema);
      const footer = usableNavigationItems(menus.get("footer"), STOREVIA_REGISTRY.linkSchema);
      const { data } = await resolveDocumentData([], STOREVIA_REGISTRY, reader, site, [
        ...main.map((i) => i.link),
        ...footer.map((i) => i.link),
      ]);
      const links = (items: typeof main): MenuLink[] =>
        items.flatMap((item) => {
          const href = linkHref(data, item.link);
          return href ? [{ key: item.id, label: item.label, href }] : [];
        });
      // Until a store saves a main menu of its own, the header lists its
      // collections, as it did before menus existed (M4).
      const mainMenu = menus.has("main")
        ? links(main)
        : (await reader.navigationCollections()).map((c) => ({
            key: c.handle,
            label: c.title,
            href: `/collections/${c.handle}`,
          }));
      return {
        theme: rendered.tokens,
        themeKey: rendered.theme.key,
        previewingTheme: store.preview && themeRow && !themeRow.live ? rendered.theme.name : null,
        mainMenu,
        footerMenu: links(footer),
      };
    },
    { preview: store.preview },
  );
}

/** The store's theme and menus (cached like pages; previews read the draft theme uncached). */
export function storeChrome(store: StoreRequestContext): Promise<StoreChrome> {
  if (store.preview) return loadChrome(store);
  return pageDataCache().get(`chrome:${store.storeId}`, async () => ({
    value: await loadChrome(store),
    tags: [
      storeTag(store.storeId),
      designTag(store.storeId),
      pagesTag(store.storeId),
      catalogueTag(store.storeId),
    ],
  }));
}

/** Sitemap paths for the store (cached like pages; never drafts). */
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
