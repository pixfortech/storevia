import { listCollections } from "@storevia/commerce";
import { STOREVIA_SITE } from "@storevia/commerce/site";
import { getMenus, listPages } from "@storevia/site-admin";
import { hasPermission } from "@storevia/tenancy";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { MenuEditor, type MenuItemView } from "@/components/site/menu-editor";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Menus" };

export default async function NavigationPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/website/navigation`);
  if (!hasPermission(ctx, "navigation.manage") || !hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Menus" />
        <AccessNotice title="You don't have access to menus">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const [menus, pages, collections] = await Promise.all([
    getMenus(ctx, STOREVIA_SITE),
    listPages(ctx),
    hasPermission(ctx, "collection.read") ? listCollections(ctx) : Promise.resolve([]),
  ]);
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  const options = {
    storeId,
    pages: pages.map((p) => ({ id: p.id, title: p.title })),
    collections: collections.map((c) => ({ id: c.id, title: c.title })),
    hasCatalogue: ctx.storeBusinessType === "ECOMMERCE",
    canUpload: false,
    names: {},
  };
  const main = menus.find((m) => m.handle === "main");
  const footer = menus.find((m) => m.handle === "footer");
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Menus"
        description="Links in your site's header and footer. Changes show on your site as soon as you save."
      />
      <div className="grid gap-6">
        <MenuEditor
          storeId={storeId}
          handle="main"
          title="Main menu"
          description={
            main?.saved
              ? "Shown in the header of every page."
              : "Until you save this menu, the header lists your collections."
          }
          initial={(main?.items ?? []) as MenuItemView[]}
          revision={main?.revision ?? 0}
          options={options}
          canEdit={writable}
        />
        <MenuEditor
          storeId={storeId}
          handle="footer"
          title="Footer menu"
          description="Shown at the bottom of every page, e.g. Shipping, Returns and Contact."
          initial={(footer?.items ?? []) as MenuItemView[]}
          revision={footer?.revision ?? 0}
          options={options}
          canEdit={writable}
        />
      </div>
    </>
  );
}
