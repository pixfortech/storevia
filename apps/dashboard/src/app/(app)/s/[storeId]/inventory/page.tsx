import { listInventory, listLocations, LOW_STOCK_THRESHOLD } from "@storevia/commerce";
import { hasPermission } from "@storevia/tenancy";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Card, EmptyState } from "@storevia/ui/surfaces";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { InventoryFilters } from "@/components/catalogue/inventory-filters";
import { InventoryTable, type InventoryTableRow } from "@/components/catalogue/inventory-table";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { PageHeader } from "@/components/shell/app-shell";
import { inventoryPath, inventoryTabs, productPath, productsPath } from "@/lib/catalogue";
import { imageSource } from "@/lib/media-urls";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeId } = await params;
  const search = await searchParams;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/inventory`);
  if (!hasPermission(ctx, "inventory.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Inventory" />
        <AccessNotice title="You don't have access to inventory">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const stock =
    search["stock"] === "low_stock" || search["stock"] === "out_of_stock"
      ? search["stock"]
      : undefined;
  const [page, locations] = await Promise.all([
    listInventory(ctx, { q: search["q"], stock, after: search["after"], limit: 50 }),
    listLocations(ctx),
  ]);
  const active = locations.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }));
  const canAdjust =
    hasPermission(ctx, "inventory.adjust") &&
    ctx.storeStatus !== "ARCHIVED" &&
    ctx.storeStatus !== "SUSPENDED";
  const rows: InventoryTableRow[] = page.rows.map((r) => {
    const image = imageSource(r.image ? { renditions: r.image.renditions } : null);
    return {
      key: r.variantId,
      productHref: productPath(ctx.storeId, r.productId),
      productTitle: r.productTitle,
      variantId: r.variantId,
      variantTitle: r.variantTitle,
      sku: r.sku,
      tracked: r.tracked,
      oversell: r.inventoryPolicy === "CONTINUE",
      levels: r.levels,
      available: r.available,
      image: image ? { src: image.src, alt: "" } : null,
      low: r.tracked && r.available > 0 && r.available <= LOW_STOCK_THRESHOLD,
      out: r.tracked && r.inventoryPolicy === "DENY" && r.available <= 0,
    };
  });
  const filtered = Boolean(search["q"]) || Boolean(stock);
  const qs = (after?: string) => {
    const next = new URLSearchParams();
    if (search["q"]) next.set("q", search["q"]);
    if (stock) next.set("stock", stock);
    if (after) next.set("after", after);
    const s = next.toString();
    return inventoryPath(ctx.storeId, s ? `?${s}` : "");
  };
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Inventory"
        description={`Stock across ${String(active.length)} active ${active.length === 1 ? "location" : "locations"}. Low stock means ${String(LOW_STOCK_THRESHOLD)} or fewer available.`}
      />
      <LinkTabs
        label="Inventory sections"
        className="mb-6"
        tabs={inventoryTabs(ctx.storeId, "stock")}
      />
      <Card className="overflow-hidden">
        <InventoryFilters />
        {rows.length === 0 ? (
          <EmptyState
            compact
            titleAs="h2"
            illustration={
              <Illustration name={filtered ? "empty-search" : "empty-products"} size="sm" />
            }
            title={filtered ? "Nothing matches" : "No products to stock yet"}
            description={
              filtered
                ? "Try another search or filter."
                : "Add products and their stock will show here."
            }
            action={
              !filtered ? (
                <Link
                  href={productsPath(ctx.storeId)}
                  className="font-medium text-brand-700 hover:underline"
                >
                  Go to products
                </Link>
              ) : undefined
            }
          />
        ) : (
          <InventoryTable storeId={storeId} rows={rows} locations={active} canAdjust={canAdjust} />
        )}
        {search["after"] || page.nextCursor ? (
          <nav
            aria-label="Pages"
            className="flex items-center justify-between border-t border-line px-4 py-3 text-body-sm sm:px-6"
          >
            {search["after"] ? (
              <Link
                href={qs()}
                className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
              >
                <Icon icon={ArrowLeft} size="sm" />
                First page
              </Link>
            ) : (
              <span />
            )}
            {page.nextCursor ? (
              <Link
                href={qs(page.nextCursor)}
                className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
              >
                Next page
                <Icon icon={ArrowRight} size="sm" />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
