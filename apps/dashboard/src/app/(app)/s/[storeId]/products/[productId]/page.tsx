import { getProduct, getProductStock, listCollections, listLocations } from "@storevia/commerce";
import { toDecimalString, fromJSON, type MoneyJson } from "@storevia/commerce/money";
import { getStore, hasPermission } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { Alert, Badge } from "@storevia/ui/surfaces";
import type { JSONContent } from "@tiptap/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/catalogue/editor/product-editor";
import type { EditorContext } from "@/components/catalogue/editor/types";
import { PageHeader } from "@/components/shell/app-shell";
import { PRODUCT_STATUS, productsPath } from "@/lib/catalogue";
import { editorImages } from "@/lib/media-urls";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Edit product" };

const decimal = (value: MoneyJson | null) => (value ? toDecimalString(fromJSON(value)) : "");

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; productId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeId, productId } = await params;
  const created = (await searchParams)["created"] === "1";
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/products/${productId}`);
  const load = async () => {
    try {
      return await Promise.all([
        getProduct(ctx, productId),
        getProductStock(ctx, productId),
        listLocations(ctx),
        listCollections(ctx),
        getStore(ctx),
      ]);
    } catch (error) {
      // Another store's product, a malformed id or no permission: not found.
      if (isDomainError(error)) notFound();
      throw error;
    }
  };
  const [product, stock, locations, collections, store] = await load();
  const active = locations.filter((l) => l.isActive);
  const levels = new Map(
    stock.map((s) => [
      s.variantId,
      Object.fromEntries(
        s.levels.filter((l) => l.isActive).map((l) => [l.locationId, l.available]),
      ),
    ]),
  );
  const context: EditorContext = {
    storeId,
    locale: store.locale,
    storefrontHost: store.primaryHostname,
    allCollections: collections.map((c) => ({ id: c.id, title: c.title })),
    locations: active.map((l) => ({ id: l.id, name: l.name })),
    can: {
      edit:
        hasPermission(ctx, "product.update") &&
        product.status !== "ARCHIVED" &&
        ctx.storeStatus !== "ARCHIVED",
      archive: hasPermission(ctx, "product.archive"),
      adjust: hasPermission(ctx, "inventory.adjust"),
      collections: hasPermission(ctx, "collection.manage"),
      uploadMedia: hasPermission(ctx, "media.manage"),
    },
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      description: product.description as JSONContent | null,
      vendor: product.vendor ?? "",
      productType: product.productType ?? "",
      tags: product.tags,
      seoTitle: product.seoTitle ?? "",
      seoDescription: product.seoDescription ?? "",
      currency: product.currency,
      updatedAt: product.updatedAt.toISOString(),
      options: product.options.map((o) => ({
        id: o.id,
        name: o.name,
        values: o.values.map((v) => ({ id: v.id, value: v.value })),
      })),
      variants: product.variants.map((v) => ({
        id: v.id,
        title: v.title,
        optionValues: v.optionValues,
        sku: v.sku ?? "",
        barcode: v.barcode ?? "",
        price: decimal(v.price),
        compareAtPrice: decimal(v.compareAtPrice),
        cost: decimal(v.cost),
        inventoryPolicy: v.inventoryPolicy,
        tracked: v.tracked,
        available: v.available,
        levels: levels.get(v.id) ?? {},
        imageMediaId: v.imageMediaId,
        hasInventoryHistory: v.hasInventoryHistory,
      })),
      media: editorImages(product.media),
      collections: product.collections,
    },
  };
  const status = PRODUCT_STATUS[product.status];
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={productsPath(ctx.storeId)} className="hover:text-ink">
            Products
          </Link>
        }
        title={product.title}
        meta={
          <Badge variant="dot" tone={status.tone}>
            {status.label}
          </Badge>
        }
      />
      {created ? (
        <Alert tone="success" className="mb-6" title="Product saved">
          Add images, options such as size or colour, and anything else below.
        </Alert>
      ) : null}
      {product.status === "ARCHIVED" ? (
        <Alert tone="neutral" className="mb-6">
          This product is archived. Restore it to make changes.
        </Alert>
      ) : null}
      <ProductEditor key={product.id} context={context} />
    </>
  );
}
