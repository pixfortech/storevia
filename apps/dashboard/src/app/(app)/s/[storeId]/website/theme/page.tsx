import { getStoreTheme } from "@storevia/site-admin";
import { hasPermission } from "@storevia/tenancy";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { ThemeEditor } from "@/components/site/theme-editor";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Theme" };

export default async function ThemePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/website/theme`);
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Theme" />
        <AccessNotice title="You don't have access to the theme">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const theme = await getStoreTheme(ctx);
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Theme"
        description="Colours, type and spacing for your whole site. Every page follows them."
      />
      <ThemeEditor
        storeId={storeId}
        initial={theme.draft}
        revision={theme.revision}
        hasUnpublishedChanges={theme.hasUnpublishedChanges}
        canEdit={writable}
        canPublish={writable && hasPermission(ctx, "theme.publish")}
      />
    </>
  );
}
