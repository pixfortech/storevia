import { getMedia, type MediaView } from "@storevia/media";
import { getStoreBranding } from "@storevia/site-admin";
import { hasPermission, type StoreContext } from "@storevia/tenancy";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { BrandEditor, type BrandImagePreview } from "@/components/site/brand-editor";
import { dashboardMediaUrl, websitePath } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Logo and favicon" };

// The store's logo and favicon (final pass, Phase 2A), next to the rest of
// the site's presentation: images from the media library (upload or pick),
// live as soon as they are saved. design.edit, like the service.

async function preview(ctx: StoreContext, id: string | null): Promise<BrandImagePreview | null> {
  if (!id) return null;
  let media: MediaView;
  try {
    media = await getMedia(ctx, id);
  } catch {
    return null;
  }
  const smallest = media.renditions[0];
  const shown = media.renditions[1] ?? smallest;
  if (!smallest || !shown) return null;
  return {
    id: media.id,
    filename: media.filename,
    src: dashboardMediaUrl(shown.url),
    iconSrc: dashboardMediaUrl(smallest.url),
    width: media.width,
    height: media.height,
  };
}

export default async function BrandPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, websitePath(storeId, "/brand"));
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Logo and favicon" />
        <AccessNotice title="You don't have access to the website">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const branding = await getStoreBranding(ctx);
  const [logo, favicon] = await Promise.all([
    preview(ctx, branding.logoMediaId),
    preview(ctx, branding.faviconMediaId),
  ]);
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Logo and favicon"
        description="Your logo is shown in the header of every page, and your favicon in browser tabs and bookmarks. Changes show on your site as soon as you save."
      />
      <BrandEditor
        storeId={storeId}
        storeName={ctx.storeName}
        logo={logo}
        favicon={favicon}
        canEdit={writable}
        canUpload={writable && hasPermission(ctx, "media.manage")}
      />
    </>
  );
}
