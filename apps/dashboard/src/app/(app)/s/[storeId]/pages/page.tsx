import { listPages } from "@storevia/site-admin";
import { hasPermission } from "@storevia/tenancy";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { PagesList } from "@/components/site/pages-list";
import { builderPath, websitePath } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Pages" };

export default async function PagesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/pages`);
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Pages" />
        <AccessNotice title="You don't have access to pages">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const pages = await listPages(ctx);
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Pages"
        description="Your home page and pages such as About, Contact, Shipping and Returns."
      />
      <PagesList
        storeId={storeId}
        builderBase={websitePath(storeId, "/pages")}
        canCreate={writable}
        canPublish={writable && hasPermission(ctx, "page.publish")}
        pages={pages.map((p) => ({
          id: p.id,
          kind: p.kind,
          title: p.title,
          handle: p.handle,
          status: p.status,
          updatedAt: p.updatedAt.toISOString(),
          editHref: builderPath(storeId, p.id),
        }))}
      />
    </>
  );
}
