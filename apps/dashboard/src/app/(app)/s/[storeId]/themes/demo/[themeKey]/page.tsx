import { listThemes } from "@storevia/site-admin";
import { THEME_DEMO_VIEWPORTS, type ThemeDemoViewport } from "@storevia/site-engine/demo";
import { themeDefinition, themePreset } from "@storevia/site-engine/theme";
import { hasPermission } from "@storevia/tenancy";
import { buttonClasses } from "@storevia/ui/button";
import { Badge } from "@storevia/ui/surfaces";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { ThemeDemoViewer } from "@/components/themes/theme-demo-viewer";
import { themeBadges, themeLayoutFacts } from "@/lib/theme-card";
import { themesPath } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

// A first-party theme's full demo (08-themes.md §10.7): Storevia's demo
// store, home and product page, at desktop, tablet or phone width, drawn by
// the real renderer with the theme's chrome, stylesheet and presets. No
// store data is read for the demo itself; the page is behind design.edit
// like the rest of the Themes area.

type Params = Promise<{ storeId: string; themeKey: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const theme = themeDefinition((await params).themeKey);
  return { title: theme ? `${theme.name} demo` : "Not found" };
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ThemeDemoPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId, themeKey } = await params;
  const ctx = await storeContextOr404(
    storeId,
    themesPath(storeId, `/demo/${encodeURIComponent(themeKey)}`),
  );
  const theme = themeDefinition(themeKey);
  if (!theme) notFound();
  const query = await searchParams;
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title={`${theme.name} demo`} />
        <AccessNotice title="You don't have access to themes">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const entry = (await listThemes(ctx)).find((t) => t.key === theme.key);
  const requestedViewport = one(query["viewport"]);
  const viewport: ThemeDemoViewport =
    requestedViewport !== undefined && Object.hasOwn(THEME_DEMO_VIEWPORTS, requestedViewport)
      ? (requestedViewport as ThemeDemoViewport)
      : "desktop";
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title={`${theme.name} demo`}
        description={theme.description}
        meta={
          entry ? (
            <ul className="flex flex-wrap gap-2" aria-label="Status">
              {themeBadges(entry).map((badge) => (
                <li key={badge.label}>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </li>
              ))}
            </ul>
          ) : null
        }
        actions={
          <>
            <Link href={themesPath(storeId)} className={buttonClasses("secondary", "md")}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Theme library
            </Link>
            {entry?.installed ? (
              <Link
                href={
                  entry.live
                    ? themesPath(storeId, "/customise")
                    : themesPath(storeId, `/customise?theme=${encodeURIComponent(theme.key)}`)
                }
                className={buttonClasses("primary", "md")}
              >
                Customise {theme.name}
              </Link>
            ) : null}
          </>
        }
      />
      <p className="mb-4 text-body-sm text-ink-muted">
        Layout: {themeLayoutFacts(theme.chrome).join(", ")}.
      </p>
      <ThemeDemoViewer
        themeKey={theme.key}
        themeName={theme.name}
        presets={theme.presets.map((p) => ({ key: p.key, name: p.name }))}
        initial={{
          page: one(query["page"]) === "product" ? "product" : "home",
          viewport,
          preset: themePreset(theme, one(query["style"])).key,
        }}
      />
    </>
  );
}
