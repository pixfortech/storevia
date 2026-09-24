import { hasPermission } from "@storevia/tenancy";
import { Alert, Card, EmptyState } from "@storevia/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NAV_ICONS } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/app-shell";
import { STORE_NAV } from "@/lib/navigation";
import { storeContextOr404 } from "@/lib/tenant";

// Clearly marked placeholders for areas delivered in later milestones. They
// render no controls, so nothing looks functional that isn't.

const AREA_COPY: Record<string, string> = {
  orders: "Orders placed on your storefront will appear here, with payment and fulfilment status.",
  products: "Add products with variants, pricing, media and inventory.",
  customers: "Your shoppers, their addresses and order history.",
  website: "Design your storefront with the visual builder, pages, navigation and themes.",
  analytics: "Sales, traffic and conversion reports.",
  marketing: "Discounts and campaigns.",
  apps: "Extend your store with apps.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  return { title: STORE_NAV.find((n) => n.segment === `/${area}`)?.label ?? "Not found" };
}

export default async function AreaPlaceholderPage({
  params,
}: {
  params: Promise<{ storeId: string; area: string }>;
}) {
  const { storeId, area } = await params;
  const item = STORE_NAV.find((n) => n.availability && n.segment === `/${area}`);
  if (!item) notFound();
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/${area}`);
  if (!hasPermission(ctx, item.permission)) {
    return (
      <>
        <PageHeader title={item.label} />
        <Alert tone="warning" title="You don't have access to this area">
          Your role doesn't include {item.label.toLowerCase()}. Ask an owner or admin if you need
          it.
        </Alert>
      </>
    );
  }
  const Icon = NAV_ICONS[item.icon];
  return (
    <>
      <PageHeader title={item.label} />
      <Card>
        <EmptyState
          icon={<Icon aria-hidden="true" className="size-6" />}
          title={`${item.label} is coming in ${item.availability ?? "a later release"}`}
          description={AREA_COPY[area]}
        />
      </Card>
    </>
  );
}
