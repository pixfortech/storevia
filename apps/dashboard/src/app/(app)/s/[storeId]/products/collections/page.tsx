import { listCollections } from "@storevia/commerce";
import { hasPermission } from "@storevia/tenancy";
import { Illustration } from "@storevia/ui/illustrations";
import { Card, EmptyState } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { CreateCollectionDialog } from "@/components/catalogue/collection-forms";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { PageHeader } from "@/components/shell/app-shell";
import { collectionsPath, productsPath } from "@/lib/catalogue";
import { relativeTime } from "@/lib/dashboard/activity";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeId } = await params;
  const archived = (await searchParams)["archived"] === "1";
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/products/collections`);
  if (!hasPermission(ctx, "collection.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Collections" />
        <AccessNotice title="You don't have access to collections">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const [collections, archivedList] = await Promise.all([
    listCollections(ctx, { archived }),
    archived ? Promise.resolve(null) : listCollections(ctx, { archived: true }),
  ]);
  const canManage = hasPermission(ctx, "collection.manage") && ctx.storeStatus !== "ARCHIVED";
  const now = new Date();
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Collections"
        description="Hand-picked groups of products, in the order you choose."
        actions={canManage ? <CreateCollectionDialog storeId={storeId} /> : undefined}
      />
      <LinkTabs
        label="Catalogue sections"
        className="mb-6"
        tabs={[
          { href: productsPath(ctx.storeId), label: "Products", current: false },
          { href: collectionsPath(ctx.storeId), label: "Collections", current: true },
        ]}
      />
      <Card className="overflow-hidden">
        <div className="px-4 pt-2 sm:px-6">
          <LinkTabs
            label="Collection status"
            tabs={[
              { href: collectionsPath(ctx.storeId), label: "Current", current: !archived },
              {
                href: collectionsPath(ctx.storeId, "?archived=1"),
                label: "Archived",
                current: archived,
                ...(archivedList ? { count: archivedList.length } : {}),
              },
            ]}
          />
        </div>
        {collections.length === 0 ? (
          <EmptyState
            compact
            titleAs="h2"
            illustration={<Illustration name="empty-products" size="sm" />}
            title={archived ? "No archived collections" : "No collections yet"}
            description={
              archived
                ? "Collections you archive appear here."
                : "Create a collection to group products for your storefront, such as a season or a gift guide."
            }
            action={
              !archived && canManage ? <CreateCollectionDialog storeId={storeId} /> : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {collections.map((c) => (
              <li key={c.id}>
                <Link
                  href={collectionsPath(ctx.storeId, `/${c.id}`)}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-subtle sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium text-ink">
                      {c.title}
                    </span>
                    <span className="block truncate text-caption text-ink-faint">/{c.handle}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-body-sm text-ink tabular-nums">
                      {c.productCount} {c.productCount === 1 ? "product" : "products"}
                    </span>
                    <span className="block text-caption text-ink-faint">
                      Updated {relativeTime(c.updatedAt, now)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
