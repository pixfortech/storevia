import "server-only";
import type { DataSource, LinkTarget } from "@storevia/editor/document";
import {
  dataRequestKey,
  type RenderContext,
  type RenderData,
  type RenderSlots,
} from "@storevia/editor/registry";
import { createLogger } from "@storevia/observability";
import type { RouteData } from "./route-data";
import type { StoreRequestContext } from "./store-header";

const log = createLogger({ component: "storefront" });

/** Store-relative href for a typed link, or null when it doesn't resolve in this store. */
export function linkHref(data: RouteData, target: LinkTarget): string | null {
  const find = (list: readonly (readonly [string, string])[], id: string) =>
    list.find(([key]) => key === id)?.[1] ?? null;
  switch (target.type) {
    case "url":
      return target.href;
    case "home":
      return "/";
    case "search":
      return "/search";
    case "cart":
      return "/cart";
    case "product": {
      const handle = find(data.links.products, target.id);
      return handle ? `/products/${handle}` : null;
    }
    case "collection": {
      const handle = find(data.links.collections, target.id);
      return handle ? `/collections/${handle}` : null;
    }
    case "page": {
      const handle = find(data.links.pages, target.id);
      return handle ? `/pages/${handle}` : null;
    }
  }
}

export function renderData(data: RouteData): RenderData {
  const lists = new Map(data.productLists);
  const media = new Map(data.media);
  return {
    productList: (source: DataSource, limit: number) =>
      lists.get(dataRequestKey({ kind: "product-list", source, limit })) ?? [],
    currentProduct: data.product,
    currentCollection: data.collection,
    search: data.search,
    link: (target) => linkHref(data, target),
    image: (ref) => {
      const view = media.get(ref.mediaId);
      return view ? { ...view, alt: ref.alt ?? view.alt } : null;
    },
  };
}

export function renderContext(
  store: StoreRequestContext,
  data: RouteData,
  options: {
    readonly slots: RenderSlots;
    readonly selectedVariantId?: string | null;
    readonly pageHref?: (page: number) => string;
    readonly variantHref?: (variantId: string) => string;
  },
): RenderContext {
  return {
    pageKind: data.pageKind,
    store: { name: store.name, locale: store.locale, currency: store.currency },
    data: renderData(data),
    slots: options.slots,
    selectedVariantId: options.selectedVariantId ?? null,
    pageHref: options.pageHref ?? ((page) => `?page=${String(page)}`),
    variantHref: options.variantHref ?? ((id) => `?variant=${encodeURIComponent(id)}`),
    onUnknownComponent: (type) => {
      log.warn("unknown component skipped", { storeId: store.storeId, type });
    },
  };
}
