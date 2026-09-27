import { listCollections } from "@storevia/commerce";
import { listPages, openPageDraft, getStoreTheme } from "@storevia/site-admin";
import { STOREVIA_SITE } from "@storevia/commerce/site";
import { resolveTheme } from "@storevia/site-engine/theme";
import { hasPermission } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { PageBuilder } from "@/components/site/builder";
import { pagesPath, previewPath } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Edit page" };

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ storeId: string; pageId: string }>;
}) {
  const { storeId, pageId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/website/pages/${pageId}`);
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Edit page" />
        <AccessNotice title="You don't have access to the builder">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  let draft;
  try {
    draft = await openPageDraft(ctx, pageId, STOREVIA_SITE);
  } catch (error) {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [pages, theme, collections] = await Promise.all([
    listPages(ctx),
    getStoreTheme(ctx),
    hasPermission(ctx, "collection.read") ? listCollections(ctx) : Promise.resolve([]),
  ]);
  const ecommerce = ctx.storeBusinessType === "ECOMMERCE";
  return (
    <PageBuilder
      storeId={storeId}
      storeName={ctx.storeName}
      locale="en"
      page={{
        id: draft.id,
        kind: draft.kind,
        title: draft.title,
        handle: draft.handle,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        status: draft.status,
        revision: draft.revision,
        document: draft.document,
        problems: draft.problems,
      }}
      tokens={resolveTheme(theme.draft)}
      options={{
        storeId,
        pages: pages.map((p) => ({ id: p.id, title: p.title })),
        collections: collections.map((c) => ({ id: c.id, title: c.title })),
        hasCatalogue: ecommerce,
        canUpload: hasPermission(ctx, "media.manage") && writable,
        names: {},
      }}
      canEdit={writable}
      canPublish={writable && hasPermission(ctx, "page.publish")}
      previewHref={previewPath(storeId, draft.kind === "HOME" ? "/" : `/pages/${draft.handle}`)}
      backHref={pagesPath(storeId)}
    />
  );
}
