import { listMedia } from "@storevia/media";
import { getAllowance, hasPermission } from "@storevia/tenancy";
import { UsageMeter } from "@storevia/ui/data";
import { formatBytes } from "@storevia/entitlements/format";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { MediaLibrary } from "@/components/catalogue/media-library";
import { PageHeader } from "@/components/shell/app-shell";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeId } = await params;
  const q = (await searchParams)["q"];
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/media`);
  if (!hasPermission(ctx, "media.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Media" />
        <AccessNotice title="You don't have access to media">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const canManage =
    hasPermission(ctx, "media.manage") &&
    ctx.storeStatus !== "ARCHIVED" &&
    ctx.storeStatus !== "SUSPENDED";
  const [page, allowance] = await Promise.all([
    listMedia(ctx, { q, limit: 48 }),
    canManage ? getAllowance(ctx, "media_storage") : null,
  ]);
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Media"
        description="Images for your products and store. Upload once, use anywhere."
      />
      {allowance ? (
        <UsageMeter
          className="mb-6 max-w-md"
          label="Media storage (whole organisation)"
          used={Number(allowance.usage)}
          limit={allowance.limit === "unlimited" ? "unlimited" : Number(allowance.limit)}
          format={(value: number) => formatBytes(BigInt(Math.round(value)))}
          data-testid="usage-media_storage"
        />
      ) : null}
      <MediaLibrary
        storeId={storeId}
        initial={page.items}
        initialCursor={page.nextCursor}
        canManage={canManage}
      />
    </>
  );
}
