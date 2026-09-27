// Commerce link kinds and data sources (ADR-0030 §3): what Storevia adds to
// the Site Engine's url/home/page links. Ids are TypeIds; the server checks
// on save that each belongs to the same store, and at render time one that
// doesn't resolve renders as nothing. Pure.
import { typeIdSchema, type LinkKindDefinition } from "@storevia/editor/document";
import { z } from "zod";

export const COMMERCE_LINK_KINDS: readonly LinkKindDefinition[] = [
  {
    type: "product",
    label: "Product",
    idKind: "product",
    schema: z.strictObject({ type: z.literal("product"), id: typeIdSchema("product") }),
  },
  {
    type: "collection",
    label: "Collection",
    idKind: "collection",
    schema: z.strictObject({ type: z.literal("collection"), id: typeIdSchema("collection") }),
  },
  {
    type: "search",
    label: "All products",
    schema: z.strictObject({ type: z.literal("search") }),
  },
  { type: "cart", label: "Cart", schema: z.strictObject({ type: z.literal("cart") }) },
];

export const MAX_FEATURED_PRODUCTS = 48;
export const MAX_LISTED_COLLECTIONS = 24;

export const dataSourceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("collection"), id: typeIdSchema("collection") }),
  z.strictObject({
    type: z.literal("products"),
    ids: z.array(typeIdSchema("product")).min(1).max(MAX_FEATURED_PRODUCTS),
  }),
  /** The store's newest active products. */
  z.strictObject({ type: z.literal("catalogue") }),
]);
export type DataSource = z.infer<typeof dataSourceSchema>;

export const collectionListSourceSchema = z.discriminatedUnion("type", [
  /** Every live collection, in title order. */
  z.strictObject({ type: z.literal("all") }),
  z.strictObject({
    type: z.literal("collections"),
    ids: z.array(typeIdSchema("collection")).min(1).max(MAX_LISTED_COLLECTIONS),
  }),
]);
export type CollectionListSource = z.infer<typeof collectionListSourceSchema>;

/** Product and collection ids a props value names through data sources (for the same-store check). */
export function collectCatalogueIds(value: unknown): { products: string[]; collections: string[] } {
  const products: string[] = [];
  const collections: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    const source = dataSourceSchema.safeParse(v);
    if (source.success) {
      if (source.data.type === "collection") collections.push(source.data.id);
      if (source.data.type === "products") products.push(...source.data.ids);
      return;
    }
    const list = collectionListSourceSchema.safeParse(v);
    if (list.success) {
      if (list.data.type === "collections") collections.push(...list.data.ids);
      return;
    }
    for (const child of Object.values(v)) walk(child);
  };
  walk(value);
  return { products, collections };
}
