import { getStoreTheme, listThemes } from "@storevia/site-admin";
import {
  DEFAULT_THEME_DEFINITION,
  themeDefinition,
  themePreset,
} from "@storevia/site-engine/theme";
import { hasPermission } from "@storevia/tenancy";
import { buttonClasses } from "@storevia/ui/button";
import { Badge, Card } from "@storevia/ui/surfaces";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { PageHeader } from "@/components/shell/app-shell";
import { ThemeLibrary } from "@/components/themes/theme-library";
import { themeBadges } from "@/lib/theme-card";
import { previewPath, themesPath, themesTabs } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Themes" };

// The Themes area (08-themes.md §10.7): the current theme, then the library
// of first-party themes with their demo previews. Customising is its own tab
// (/themes/customise); a full demo of any theme is /themes/demo/{theme}.
// design.edit to see and customise, theme.publish to make a theme live
// (the services check both again).

export default async function ThemesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, themesPath(storeId));
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Themes" />
        <AccessNotice title="You don't have access to themes">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const [library, live] = await Promise.all([listThemes(ctx), getStoreTheme(ctx)]);
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  const canPublish = writable && hasPermission(ctx, "theme.publish");
  const liveTheme = themeDefinition(live.themeKey) ?? DEFAULT_THEME_DEFINITION;
  const liveEntry = library.find((t) => t.live);
  const previewHref = previewPath(storeId);
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Themes"
        description="Compare Storevia's themes on a demo store, customise yours, and choose the one your visitors see."
      />
      <LinkTabs
        label="Themes sections"
        className="mb-6 lg:mb-8"
        tabs={themesTabs(storeId, "library")}
      />
      <div className="grid gap-8">
        <section aria-labelledby="current-theme-heading">
          <Card className="@container grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="grid min-w-0 gap-2">
              <h2 id="current-theme-heading" className="text-body font-semibold text-ink">
                Current theme
              </h2>
              <p className="text-body text-ink">
                <span className="font-semibold">{live.name}</span>,{" "}
                {themePreset(liveTheme, live.published.preset).name} style
              </p>
              {liveEntry ? (
                <ul className="flex flex-wrap gap-2" aria-label="Status">
                  {themeBadges(liveEntry).map((badge) => (
                    <li key={badge.label}>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-body-sm text-ink-muted">{liveTheme.description}</p>
            </div>
            <ul className="grid gap-2 @xl:grid-cols-3" aria-label="Current theme actions">
              <li className="flex">
                <Link
                  href={themesPath(storeId, `/demo/${liveTheme.key}`)}
                  className={buttonClasses("secondary", "md", "w-full")}
                >
                  View demo
                </Link>
              </li>
              <li className="flex">
                <Link
                  href={themesPath(storeId, "/customise")}
                  className={buttonClasses("secondary", "md", "w-full")}
                >
                  Customise
                </Link>
              </li>
              <li className="flex">
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noopener"
                  className={buttonClasses("secondary", "md", "w-full")}
                >
                  Preview on my store
                  <ExternalLink className="size-4" aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </Card>
        </section>
        <ThemeLibrary
          storeId={storeId}
          themes={library}
          themesHref={themesPath(storeId)}
          previewHref={previewHref}
          canEdit={writable}
          canPublish={canPublish}
        />
      </div>
    </>
  );
}
