import { listCollections, listProducts } from "@storevia/commerce";
import { getAllowance, hasPermission } from "@storevia/tenancy";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Alert, Card, EmptyState } from "@storevia/ui/surfaces";
import { ArrowLeft, ArrowRight, Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { ProductFilters } from "@/components/catalogue/product-filters";
import {
  ProductList,
  type BulkOption,
  type ProductListRow,
} from "@/components/catalogue/product-list";
import { PageHeader } from "@/components/shell/app-shell";
import {
  collectionsPath,
  formatPriceRange,
  productPath,
  productsPath,
  stockSummary,
} from "@/lib/catalogue";
import { relativeTime } from "@/lib/dashboard/activity";
import { imageSource } from "@/lib/media-urls";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Products" };

const BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-control px-4 text-label font-medium transition-colors pointer-coarse:h-11";
const PRIMARY = `${BUTTON} bg-brand-600 text-white shadow-xs hover:bg-brand-700`;
const SECONDARY = `${BUTTON} border border-line-control bg-surface text-ink shadow-xs hover:bg-subtle`;

type Search = Record<string, string | undefined>;

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Search>;
}) {
  const { storeId } = await params;
  const search = await searchParams;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/products`);
  if (!hasPermission(ctx, "product.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Products" />
        <AccessNotice title="You don't have access to products" illustration="empty-products">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const status = ["ACTIVE", "DRAFT", "ARCHIVED"].includes(search["status"] ?? "")
    ? (search["status"] as "ACTIVE" | "DRAFT" | "ARCHIVED")
    : undefined;
  const [result, collections, allowance] = await Promise.all([
    listProducts(ctx, {
      q: search["q"],
      status,
      vendor: search["vendor"],
      productType: search["productType"],
      collectionId: search["collection"],
      stock: search["stock"],
      sort: search["sort"],
      cursor: search["cursor"],
      limit: 25,
    }),
    listCollections(ctx),
    hasPermission(ctx, "product.create") ? getAllowance(ctx, "product_limit") : null,
  ]);

  const canCreate = hasPermission(ctx, "product.create");
  const atLimit =
    allowance !== null && allowance.limit !== "unlimited" && allowance.usage >= allowance.limit;
  const now = new Date();
  const rows: ProductListRow[] = result.items.map((item) => ({
    id: item.id,
    href: productPath(ctx.storeId, item.id),
    title: item.title,
    handle: item.handle,
    status: item.status,
    vendor: item.vendor,
    price: formatPriceRange(item.priceMin, item.priceMax),
    stock: (() => {
      const s = stockSummary(item);
      return {
        text: s.text,
        tone: s.tone === "danger" ? "danger" : s.tone === "warning" ? "warning" : null,
      };
    })(),
    variants: item.variantCount,
    updated: relativeTime(item.updatedAt, now),
    image: imageSource(item.image, item.title),
  }));

  const bulkOptions: BulkOption[] = [
    ...(hasPermission(ctx, "product.update")
      ? [
          { value: "activate", label: "Set as active" },
          { value: "draft", label: "Set as draft" },
          { value: "addTags", label: "Add tags" },
          { value: "removeTags", label: "Remove tags" },
        ]
      : []),
    ...(hasPermission(ctx, "collection.manage") && collections.length > 0
      ? [{ value: "addToCollection", label: "Add to collection" }]
      : []),
    ...(hasPermission(ctx, "product.archive")
      ? status === "ARCHIVED"
        ? [{ value: "restore", label: "Restore as draft" }]
        : [{ value: "archive", label: "Archive" }]
      : []),
  ];

  const tabHref = (value?: string) => {
    const next = new URLSearchParams();
    for (const key of ["q", "vendor", "productType", "collection", "stock", "sort"]) {
      const v = search[key];
      if (v) next.set(key, v);
    }
    if (value) next.set("status", value);
    const qs = next.toString();
    return productsPath(ctx.storeId, qs ? `?${qs}` : "");
  };
  const pageHref = (cursor?: string) => {
    const next = new URLSearchParams();
    for (const [key, v] of Object.entries(search)) if (v && key !== "cursor") next.set(key, v);
    if (cursor) next.set("cursor", cursor);
    const qs = next.toString();
    return productsPath(ctx.storeId, qs ? `?${qs}` : "");
  };
  const filtered = ["q", "vendor", "productType", "collection", "stock"].some((key) =>
    Boolean(search[key]),
  );
  const totalInTab =
    status === "ACTIVE"
      ? result.counts.active
      : status === "DRAFT"
        ? result.counts.draft
        : status === "ARCHIVED"
          ? result.counts.archived
          : result.counts.all;
  const noProductsAtAll = result.counts.all + result.counts.archived === 0;

  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Products"
        description={
          noProductsAtAll
            ? "Everything you sell, with variants, prices, stock and images."
            : `${result.counts.all.toLocaleString("en-IN")} ${result.counts.all === 1 ? "product" : "products"}${
                result.counts.archived > 0
                  ? `, ${result.counts.archived.toLocaleString("en-IN")} archived`
                  : ""
              }.`
        }
        actions={
          <>
            {!noProductsAtAll ? (
              <a href={productsPath(ctx.storeId, "/export")} className={SECONDARY} download>
                <Icon icon={Download} size="sm" />
                Export CSV
              </a>
            ) : null}
            {canCreate && !atLimit ? (
              <Link href={productsPath(ctx.storeId, "/new")} className={PRIMARY}>
                <Icon icon={Plus} size="sm" />
                Add product
              </Link>
            ) : null}
          </>
        }
      />
      <LinkTabs
        label="Catalogue sections"
        className="mb-6"
        tabs={[
          { href: productsPath(ctx.storeId), label: "Products", current: true },
          { href: collectionsPath(ctx.storeId), label: "Collections", current: false },
        ]}
      />
      {atLimit ? (
        <Alert tone="warning" className="mb-6" title="You've reached your plan's product limit">
          Your plan includes {String(allowance.limit)} products that aren&apos;t archived. Archive
          products you no longer sell to make room, or{" "}
          {hasPermission(ctx, "billing.read")
            ? "change plan on the Billing page"
            : "ask your organisation's owner about the plan"}
          . Existing products stay editable.
        </Alert>
      ) : null}

      {noProductsAtAll ? (
        <Card>
          <EmptyState
            illustration={<Illustration name="empty-products" />}
            title="Add your first product"
            description="Give it a title, a price and a photo. You can add sizes, colours and stock whenever you're ready."
            action={
              canCreate ? (
                <Link href={productsPath(ctx.storeId, "/new")} className={PRIMARY}>
                  <Icon icon={Plus} size="sm" />
                  Add product
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-4 pt-2 sm:px-6">
            <LinkTabs
              label="Product status"
              tabs={[
                {
                  href: tabHref(),
                  label: "All",
                  count: result.counts.all,
                  current: status === undefined,
                },
                {
                  href: tabHref("ACTIVE"),
                  label: "Active",
                  count: result.counts.active,
                  current: status === "ACTIVE",
                },
                {
                  href: tabHref("DRAFT"),
                  label: "Draft",
                  count: result.counts.draft,
                  current: status === "DRAFT",
                },
                {
                  href: tabHref("ARCHIVED"),
                  label: "Archived",
                  count: result.counts.archived,
                  current: status === "ARCHIVED",
                },
              ]}
            />
          </div>
          <ProductFilters
            options={{
              vendors: result.vendors,
              productTypes: result.productTypes,
              collections: collections.map((c) => ({ id: c.id, title: c.title })),
            }}
          />
          {rows.length > 0 ? (
            <ProductList
              storeId={storeId}
              rows={rows}
              bulkOptions={bulkOptions}
              collections={collections.map((c) => ({ id: c.id, title: c.title }))}
            />
          ) : (
            <EmptyState
              compact
              titleAs="h2"
              illustration={
                <Illustration name={filtered ? "empty-search" : "empty-products"} size="sm" />
              }
              title={
                filtered
                  ? "No products match"
                  : status === "ARCHIVED"
                    ? "No archived products"
                    : "No products here yet"
              }
              description={
                filtered
                  ? "Try other words or clear some filters."
                  : status === "ARCHIVED"
                    ? "Products you archive appear here. They can be restored at any time."
                    : "Products with this status will appear here."
              }
            />
          )}
          {search["cursor"] || result.nextCursor ? (
            <nav
              aria-label="Pages"
              className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-body-sm sm:px-6"
            >
              {search["cursor"] ? (
                <Link
                  href={pageHref()}
                  className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                >
                  <Icon icon={ArrowLeft} size="sm" />
                  First page
                </Link>
              ) : (
                <span className="text-ink-faint">
                  {String(rows.length)} of {totalInTab.toLocaleString("en-IN")}
                </span>
              )}
              {result.nextCursor ? (
                <Link
                  href={pageHref(result.nextCursor)}
                  className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
                >
                  Next page
                  <Icon icon={ArrowRight} size="sm" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </Card>
      )}
    </>
  );
}
