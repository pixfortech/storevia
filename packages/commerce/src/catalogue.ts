import "server-only";
import type { TenantContext } from "@storevia/tenancy";
import { inStore, internalId, publicId, publicIdOrNull } from "./internal";
import type { MoneyJson } from "./money";
import { parseRenditions, type MediaRendition } from "./products";

// A presentation-neutral read of the sellable catalogue: active products with
// their live variants, prices and images. The storefront (M4) and orders
// (M6) build on this shape; nothing here knows about pages or carts.

export interface CatalogueVariant {
  readonly id: string;
  readonly title: string;
  readonly sku: string | null;
  readonly price: MoneyJson;
  readonly compareAtPrice: MoneyJson | null;
  readonly options: readonly { readonly name: string; readonly value: string }[];
  readonly imageMediaId: string | null;
  readonly inventoryPolicy: "DENY" | "CONTINUE";
  readonly tracked: boolean;
  /** Across active locations; only meaningful when tracked. */
  readonly available: number;
  readonly taxable: boolean;
  readonly requiresShipping: boolean;
  readonly weightGrams: number | null;
}

export interface CatalogueProduct {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly descriptionHtml: string | null;
  readonly vendor: string | null;
  readonly productType: string | null;
  readonly tags: readonly string[];
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly options: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly variants: readonly CatalogueVariant[];
  readonly media: readonly {
    readonly mediaId: string;
    readonly altText: string | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly storageKey: string;
    readonly renditions: readonly MediaRendition[];
  }[];
}

export async function getCatalogue(
  ctx: TenantContext,
  options: {
    readonly collectionId?: string;
    readonly after?: string;
    readonly limit?: number;
  } = {},
): Promise<{ readonly products: readonly CatalogueProduct[]; readonly nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const collectionId = options.collectionId
    ? internalId("collection", options.collectionId)
    : undefined;
  const after = options.after ? internalId("product", options.after) : undefined;
  return inStore(ctx, "product.read", async (tx) => {
    const rows = await tx.product.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        ...(collectionId ? { collections: { some: { collectionId } } } : {}),
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: {
        id: true,
        handle: true,
        title: true,
        descriptionHtml: true,
        vendor: true,
        productType: true,
        tags: true,
        seoTitle: true,
        seoDescription: true,
        options: {
          orderBy: { position: "asc" },
          select: { name: true, values: { orderBy: { position: "asc" }, select: { value: true } } },
        },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            sku: true,
            currency: true,
            priceAmount: true,
            compareAtAmount: true,
            imageMediaId: true,
            inventoryPolicy: true,
            taxable: true,
            requiresShipping: true,
            weightGrams: true,
            optionValues: {
              orderBy: { option: { position: "asc" } },
              select: {
                option: { select: { name: true } },
                optionValue: { select: { value: true } },
              },
            },
            inventoryItem: {
              select: {
                tracked: true,
                levels: {
                  where: { location: { isActive: true, deletedAt: null } },
                  select: { available: true },
                },
              },
            },
          },
        },
        media: {
          where: { mediaAsset: { deletedAt: null, status: "READY" } },
          orderBy: { position: "asc" },
          select: {
            altText: true,
            mediaAsset: {
              select: {
                id: true,
                altText: true,
                width: true,
                height: true,
                storageKey: true,
                renditions: true,
              },
            },
          },
        },
      },
    });
    const page = rows.slice(0, limit);
    return {
      products: page.map((p) => ({
        id: publicId("product", p.id),
        handle: p.handle,
        title: p.title,
        descriptionHtml: p.descriptionHtml,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.tags,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        options: p.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })),
        variants: p.variants.map((v) => ({
          id: publicId("variant", v.id),
          title: v.title,
          sku: v.sku,
          price: { amount: v.priceAmount.toString(), currency: v.currency },
          compareAtPrice:
            v.compareAtAmount === null
              ? null
              : { amount: v.compareAtAmount.toString(), currency: v.currency },
          options: v.optionValues.map((ov) => ({
            name: ov.option.name,
            value: ov.optionValue.value,
          })),
          imageMediaId: publicIdOrNull("media", v.imageMediaId),
          inventoryPolicy: v.inventoryPolicy,
          tracked: v.inventoryItem?.tracked ?? false,
          available: (v.inventoryItem?.levels ?? []).reduce((n, l) => n + l.available, 0),
          taxable: v.taxable,
          requiresShipping: v.requiresShipping,
          weightGrams: v.weightGrams,
        })),
        media: p.media.map((m) => ({
          mediaId: publicId("media", m.mediaAsset.id),
          altText: m.altText ?? m.mediaAsset.altText,
          width: m.mediaAsset.width,
          height: m.mediaAsset.height,
          storageKey: m.mediaAsset.storageKey,
          renditions: parseRenditions(m.mediaAsset.renditions),
        })),
      })),
      nextCursor:
        rows.length > limit && page.at(-1) ? publicId("product", page.at(-1)?.id ?? "") : null,
    };
  });
}
