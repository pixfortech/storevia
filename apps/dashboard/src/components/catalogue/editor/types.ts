// Serializable data the product editor page hands to its client components.
import type { JSONContent } from "@tiptap/react";
import type { ProductStatus } from "@/lib/catalogue";

export interface EditorImage {
  readonly mediaId: string;
  readonly altText: string | null;
  readonly filename: string;
  readonly src: string;
  readonly srcSet: string;
}

export interface EditorVariant {
  readonly id: string;
  readonly title: string;
  /** optionId → valueId */
  readonly optionValues: Readonly<Record<string, string>>;
  readonly sku: string;
  readonly barcode: string;
  /** Decimal strings in the store currency ("999.50"). */
  readonly price: string;
  readonly compareAtPrice: string;
  readonly cost: string;
  readonly inventoryPolicy: "DENY" | "CONTINUE";
  readonly tracked: boolean;
  readonly available: number;
  /** Available per active location id. */
  readonly levels: Readonly<Record<string, number>>;
  readonly imageMediaId: string | null;
  readonly hasInventoryHistory: boolean;
}

export interface EditorOption {
  readonly id: string;
  readonly name: string;
  readonly values: readonly { readonly id: string; readonly value: string }[];
}

export interface EditorProduct {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
  readonly status: ProductStatus;
  readonly description: JSONContent | null;
  readonly vendor: string;
  readonly productType: string;
  readonly tags: readonly string[];
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly currency: string;
  readonly updatedAt: string;
  readonly options: readonly EditorOption[];
  readonly variants: readonly EditorVariant[];
  readonly media: readonly EditorImage[];
  readonly collections: readonly { readonly id: string; readonly title: string }[];
}

export interface EditorLocation {
  readonly id: string;
  readonly name: string;
}

export interface EditorPermissions {
  readonly edit: boolean;
  readonly archive: boolean;
  readonly adjust: boolean;
  readonly collections: boolean;
  readonly uploadMedia: boolean;
}

export interface EditorContext {
  /** The store's public id (bound to every action). */
  readonly storeId: string;
  readonly product: EditorProduct;
  readonly locations: readonly EditorLocation[];
  readonly allCollections: readonly { readonly id: string; readonly title: string }[];
  readonly can: EditorPermissions;
  /** e.g. "acme.storevia.site" for the handle preview. */
  readonly storefrontHost: string | null;
  readonly locale: string;
}
