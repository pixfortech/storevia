import { getStoreTheme, listThemes } from "@storevia/site-admin";
import { hasPermission } from "@storevia/tenancy";
import { buttonClasses } from "@storevia/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { PageHeader } from "@/components/shell/app-shell";
import { ThemeEditor } from "@/components/themes/theme-editor";
import { themesPath, themesTabs } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Customise theme" };

// The customiser (08-themes.md §10.4): the live theme, or with `?theme=`
// another installed theme; anything else (unknown, not installed) opens the
// live theme. design.edit to customise; theme.publish to publish.

export default async function CustomiseThemePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const { theme: requested } = await searchParams;
  const ctx = await storeContextOr404(storeId, themesPath(storeId, "/customise"));
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Themes" />
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
  const installed = library.filter((t) => t.installed);
  const customiseHref = themesPath(storeId, "/customise");
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Themes"
        description="Choose your theme's style, then its colours, type and spacing. Every page follows them."
      />
      <LinkTabs
        label="Themes sections"
        className="mb-6 lg:mb-8"
        tabs={themesTabs(storeId, "customise")}
      />
      <section aria-labelledby="theme-customise-heading" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="theme-customise-heading" className="text-body font-semibold text-ink">
            Customise {theme.name}
            {theme.live ? " (your live theme)" : " (not live)"}
          </h2>
          {installed.length > 1 ? (
            <nav aria-label="Installed themes">
              <ul className="flex flex-wrap gap-2">
                {installed.map((entry) => {
                  const current = entry.key === theme.themeKey;
                  return (
                    <li key={entry.key}>
                      <Link
                        href={
                          entry.live
                            ? customiseHref
                            : `${customiseHref}?theme=${encodeURIComponent(entry.key)}`
                        }
                        aria-current={current ? "page" : undefined}
                        className={buttonClasses(current ? "primary" : "secondary", "sm")}
                      >
                        {entry.name}
                        {entry.live ? " (live)" : ""}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>
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
    </>
  );
}
