import { getAllowance, getStore, hasPermission } from "@storevia/tenancy";
import { Alert } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { ProductCreateForm } from "@/components/catalogue/product-create-form";
import { PageHeader } from "@/components/shell/app-shell";
import { productsPath } from "@/lib/catalogue";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/products/new`);
  if (!hasPermission(ctx, "product.create")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Add product" />
        <AccessNotice title="You can't add products" illustration="empty-products">
          Your role can view products but not create them.
        </AccessNotice>
      </>
    );
  }
  const [store, allowance] = await Promise.all([getStore(ctx), getAllowance(ctx, "product_limit")]);
  const full = allowance.limit !== "unlimited" && allowance.usage >= allowance.limit;
  return (
    <>
      <PageHeader eyebrow={ctx.storeName} title="Add product" />
      {full ? (
        <Alert tone="warning" className="mb-6" title="You've reached your plan's product limit">
          Archive products you no longer sell to make room. Saving will be refused until
          there&apos;s space.
        </Alert>
      ) : null}
      <ProductCreateForm
        storeId={storeId}
        currency={store.currency}
        cancelHref={productsPath(ctx.storeId)}
      />
    </>
  );
}
