// A page's resolved data in serialisable form, and the render data blocks
// read from it (ADR-0030 §2). The storefront builds it inside its storefront
// transaction; the builder canvas receives it from a server action and
// renders the same blocks in the browser. Links that don't resolve in the
// store (another store's ids, deleted or unpublished records) are simply
// absent, so they render as nothing. Pure and client-safe.
import type { LinkTarget } from "@storevia/editor/document";
import { dataRequestKey } from "@storevia/editor/registry";
import type { CollectionListSource, DataSource } from "./links";
import type {
  CollectionCardView,
  CollectionView,
  CommerceRenderData,
  ImageView,
  ProductCardView,
  ProductView,
  SearchView,
} from "./types";

type Pairs<T> = readonly (readonly [string, T])[];

export interface DocumentData {
  /** Keyed by `dataRequestKey` of the block's request. */
  readonly productLists: Pairs<readonly ProductCardView[]>;
  readonly collectionLists: Pairs<readonly CollectionCardView[]>;
  /** TypeId → handle, for records that resolve in this store. */
  readonly links: {
    readonly products: Pairs<string>;
    readonly collections: Pairs<string>;
    readonly pages: Pairs<string>;
  };
  /** Media TypeId → public image. */
  readonly media: Pairs<ImageView>;
}

export const EMPTY_DOCUMENT_DATA: DocumentData = {
  productLists: [],
  collectionLists: [],
  links: { products: [], collections: [], pages: [] },
  media: [],
};

export const productListKey = (source: DataSource, limit: number) =>
  dataRequestKey({ kind: "product-list", source, limit });
export const collectionListKey = (source: CollectionListSource, limit: number) =>
  dataRequestKey({ kind: "collection-list", source, limit });

const find = (list: Pairs<string>, id: string | undefined) =>
  id === undefined ? null : (list.find(([key]) => key === id)?.[1] ?? null);

/** The store-relative href for a typed link, or null when it doesn't resolve in this store. */
export function linkHref(data: DocumentData, target: LinkTarget): string | null {
  const id = "id" in target ? target.id : undefined;
  switch (target.type) {
    case "url":
      return "href" in target && typeof target.href === "string" ? target.href : null;
    case "home":
      return "/";
    case "search":
      return "/search";
    case "cart":
      return "/cart";
    case "product": {
      const handle = find(data.links.products, id);
      return handle ? `/products/${encodeURIComponent(handle)}` : null;
    }
    case "collection": {
      const handle = find(data.links.collections, id);
      return handle ? `/collections/${encodeURIComponent(handle)}` : null;
    }
    case "page": {
      const handle = find(data.links.pages, id);
      return handle ? `/pages/${encodeURIComponent(handle)}` : null;
    }
    default:
      return null;
  }
}

export function documentRenderData(
  data: DocumentData,
  current: {
    readonly product?: ProductView | null;
    readonly collection?: CollectionView | null;
    readonly search?: SearchView | null;
  } = {},
): CommerceRenderData {
  const products = new Map(data.productLists);
  const collections = new Map(data.collectionLists);
  const media = new Map(data.media);
  return {
    productList: (source, limit) => products.get(productListKey(source, limit)) ?? [],
    collectionList: (source, limit) => collections.get(collectionListKey(source, limit)) ?? [],
    currentProduct: current.product ?? null,
    currentCollection: current.collection ?? null,
    search: current.search ?? null,
    link: (target) => linkHref(data, target),
    image: (ref) => {
      const view = media.get(ref.mediaId);
      return view ? { ...view, alt: ref.alt ?? view.alt } : null;
    },
  };
}
