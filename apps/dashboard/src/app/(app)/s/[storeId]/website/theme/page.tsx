import { getStoreTheme, listThemes } from "@storevia/site-admin";
import { hasPermission } from "@storevia/tenancy";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { ThemeEditor } from "@/components/site/theme-editor";
import { ThemeLibrary } from "@/components/site/theme-library";
import { previewPath, websitePath } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Theme" };

// The theme library and the customiser (08-themes.md §10). The customiser
// opens the live theme, or with `?theme=` another installed theme; anything
// else (unknown, not installed) opens the live theme.

export default async function ThemePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const { theme: requested } = await searchParams;
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
  const library = await listThemes(ctx);
  const selected = library.find((t) => t.installed && t.key === requested && !t.live);
  const theme = await getStoreTheme(ctx, selected?.key);
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  const canPublish = writable && hasPermission(ctx, "theme.publish");
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Theme"
        description="Choose your theme, then its colours, type and spacing. Every page follows them."
      />
      <div className="grid gap-8">
        <ThemeLibrary
          storeId={storeId}
          themes={library}
          customising={theme.themeKey}
          customiseHref={websitePath(storeId, "/theme")}
          previewHref={previewPath(storeId)}
          canEdit={writable}
          canPublish={canPublish}
        />
        <section aria-labelledby="theme-customise-heading" className="grid gap-4">
          <h2 id="theme-customise-heading" className="text-body font-semibold text-ink">
            Customise {theme.name}
            {theme.live ? " (your live theme)" : " (not live)"}
          </h2>
          <ThemeEditor
            key={`${theme.themeKey}:${String(theme.revision)}`}
            storeId={storeId}
            themeKey={theme.themeKey}
            live={theme.live}
            initial={theme.draft}
            revision={theme.revision}
            hasUnpublishedChanges={theme.hasUnpublishedChanges}
            canEdit={writable}
            canPublish={canPublish}
          />
        </section>
      </div>
    </>
  );
}
