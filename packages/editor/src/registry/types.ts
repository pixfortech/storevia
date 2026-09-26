// The component registry contract (07-page-builder-document.md §5). Components
// are registered, not hard-coded into the editor or renderer: each declares
// its props schema, where it may appear, what data it needs (collected once
// per page and resolved in batch), and a server renderer shared by the
// storefront and, from M5, the editor canvas.
import type { RichTextDoc } from "@storevia/commerce/rich-text";
import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import type { DataSource, LinkTarget, MediaRef } from "../document/refs";
import type { BuilderNode, PageKind } from "../document/types";

// ---------------------------------------------------------------------------
// Data requests: what a page needs, gathered before rendering (06 §4).
// ---------------------------------------------------------------------------

export type DataRequest =
  | { readonly kind: "product-list"; readonly source: DataSource; readonly limit: number }
  | { readonly kind: "current-product" }
  /** The collection or search page being viewed; the host decides the page size. */
  | { readonly kind: "current-collection" }
  | { readonly kind: "search" };

/** A stable key per request, so identical requests resolve once. */
export function dataRequestKey(request: DataRequest): string {
  switch (request.kind) {
    case "product-list":
      return `product-list:${JSON.stringify(request.source)}:${String(request.limit)}`;
    case "current-product":
      return "current-product";
    case "current-collection":
      return "current-collection";
    case "search":
      return "search";
  }
}

// ---------------------------------------------------------------------------
// Views: the public shapes renderers read. The storefront's read models
// return structurally compatible DTOs (no cost, no stock counts).
// ---------------------------------------------------------------------------

export interface PriceView {
  /** Minor units as a decimal string (no precision loss). */
  readonly amount: string;
  readonly currency: string;
}

export interface ImageView {
  readonly url: string;
  /** `url 320w, url 640w, …` */
  readonly srcSet: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string;
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

export interface SearchView extends PagedProducts {
  /** The normalised query ("" lists every product). */
  readonly query: string;
}

/** Resolved data for one render. Anything unresolved reads as empty/null. */
export interface RenderData {
  productList(source: DataSource, limit: number): readonly ProductCardView[];
  readonly currentProduct: ProductView | null;
  readonly currentCollection: CollectionView | null;
  readonly search: SearchView | null;
  /** The href for a typed link in this store, or null when it doesn't resolve. */
  link(target: LinkTarget): string | null;
  image(ref: MediaRef): ImageView | null;
}

/** Interactive leaves the host app provides (the storefront's cart form; a no-op in the canvas). */
export interface RenderSlots {
  readonly AddToCart: ComponentType<{
    readonly product: ProductView;
    readonly variant: VariantView | null;
  }>;
}

export interface RenderContext {
  readonly pageKind: PageKind;
  readonly store: { readonly name: string; readonly locale: string; readonly currency: string };
  readonly data: RenderData;
  readonly slots: RenderSlots;
  /** Variant chosen through `?variant=` on a product page (validated by the host). */
  readonly selectedVariantId: string | null;
  /** The href of page `n` of the current listing (collection or search). */
  pageHref(page: number): string;
  /** The href that selects a variant on the current product page. */
  variantHref(variantId: string): string;
  /** Unknown component types are skipped and reported here (07 §7). */
  onUnknownComponent?(type: string): void;
}

// ---------------------------------------------------------------------------
// Component definitions.
// ---------------------------------------------------------------------------

export type ComponentCategory =
  "layout" | "basic" | "media" | "commerce" | "marketing" | "advanced";

/** Declarative property controls: the editor (M5) renders them, so adding a component needs no editor change. */
export interface PropertyControl {
  readonly prop: string;
  readonly kind:
    | "text"
    | "textarea"
    | "richtext"
    | "media"
    | "link"
    | "select"
    | "toggle"
    | "number"
    | "product"
    | "collection"
    | "data-source";
  readonly label: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export interface RenderArgs<P> {
  readonly node: BuilderNode;
  readonly props: P;
  /** `n-{id}`: the node's scoped class for its compiled styles. */
  readonly className: string;
  readonly children: ReactNode;
  readonly ctx: RenderContext;
}

export interface ComponentDefinition<P extends object = Record<string, unknown>> {
  readonly type: string;
  readonly label: string;
  readonly icon: string;
  readonly category: ComponentCategory;
  /** Inferred from the schema, never from the defaults. */
  readonly defaultProps: NoInfer<P>;
  readonly propertySchema: z.ZodType<P>;
  readonly allowedChildren: "none" | "any" | readonly string[];
  readonly allowedParents?: readonly string[];
  readonly allowedPageKinds?: readonly PageKind[];
  /** Data this node needs, gathered once per page before rendering. */
  readonly dataRequirements?: (props: P) => readonly DataRequest[];
  /** Custom properties for the node's scoped rule, e.g. `{ "--sv-columns": "4" }` (base and responsive props). */
  readonly cssVariables?: (props: Partial<P>) => Readonly<Record<string, string>>;
  /** Entitlement a document using this component needs (checked on save and publish, M5). */
  readonly entitlement?: string;
  readonly editorControls: readonly PropertyControl[];
  readonly render: (args: RenderArgs<P>) => ReactNode;
}

export interface Registry {
  get(type: string): ComponentDefinition | undefined;
  readonly types: readonly string[];
}
