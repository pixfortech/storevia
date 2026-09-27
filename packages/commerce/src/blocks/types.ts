// Storevia commerce's extension of the Site Engine's render contract
// (ADR-0030 §2): the public catalogue views blocks read, the data requests
// they make, and the render context the storefront (and the builder canvas)
// provides. The storefront's read models return structurally compatible
// DTOs (no cost, no stock counts). Pure and client-safe.
import type { RichTextDoc } from "@storevia/editor/rich-text";
import type { ImageView, SiteRenderContext, SiteRenderData } from "@storevia/editor/registry";
import type { ComponentType } from "react";
import type { CollectionListSource, DataSource } from "./links";

export type { ImageView };

export interface PriceView {
  /** Minor units as a decimal string (no precision loss). */
  readonly amount: string;
  readonly currency: string;
}

export interface ProductCardView {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly price: PriceView;
  readonly compareAtPrice: PriceView | null;
  /** Variants have different prices: show "From …". */
  readonly priceVaries: boolean;
  readonly image: ImageView | null;
  readonly available: boolean;
}

export interface VariantView {
  readonly id: string;
  readonly title: string;
  readonly price: PriceView;
  readonly compareAtPrice: PriceView | null;
  readonly available: boolean;
  /** One value per product option, in option order. */
  readonly optionValues: readonly string[];
  readonly image: ImageView | null;
}

export interface ProductView {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly vendor: string | null;
  readonly description: RichTextDoc | null;
  readonly images: readonly ImageView[];
  readonly options: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly variants: readonly VariantView[];
}

export interface PagedProducts {
  readonly products: readonly ProductCardView[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

export interface CollectionView extends PagedProducts {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: RichTextDoc | null;
  readonly image: ImageView | null;
}

export interface CollectionCardView {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly image: ImageView | null;
}

export interface SearchView extends PagedProducts {
  /** The normalised query ("" lists every product). */
  readonly query: string;
}

/** What commerce blocks ask for, gathered once per page and resolved in batch. */
export type CommerceDataRequest =
  | { readonly kind: "product-list"; readonly source: DataSource; readonly limit: number }
  | {
      readonly kind: "collection-list";
      readonly source: CollectionListSource;
      readonly limit: number;
    }
  | { readonly kind: "current-product" }
  /** The collection or search page being viewed; the host decides the page size. */
  | { readonly kind: "current-collection" }
  | { readonly kind: "search" };

export interface CommerceRenderData extends SiteRenderData {
  productList(source: DataSource, limit: number): readonly ProductCardView[];
  collectionList(source: CollectionListSource, limit: number): readonly CollectionCardView[];
  readonly currentProduct: ProductView | null;
  readonly currentCollection: CollectionView | null;
  readonly search: SearchView | null;
}

/** Interactive leaves the host app provides (the storefront's cart form; inert in the builder canvas). */
export interface CommerceRenderSlots {
  readonly AddToCart: ComponentType<{
    readonly product: ProductView;
    readonly variant: VariantView | null;
  }>;
}

export interface CommerceRenderContext extends SiteRenderContext {
  readonly data: CommerceRenderData;
  readonly slots: CommerceRenderSlots;
  /** Variant chosen through `?variant=` on a product page (validated by the host). */
  readonly selectedVariantId: string | null;
  /** The href of page `n` of the current listing (collection or search). */
  pageHref(page: number): string;
  /** The href that selects a variant on the current product page. */
  variantHref(variantId: string): string;
}
