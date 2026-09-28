import { getStoreTheme, listPages } from "@storevia/site-admin";
import {
  DEFAULT_THEME_DEFINITION,
  themeDefinition,
  themePreset,
} from "@storevia/site-engine/theme";
import { hasPermission } from "@storevia/tenancy";
import { Button, buttonClasses } from "@storevia/ui/button";
import { Badge, Card } from "@storevia/ui/surfaces";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { builderPath, pagesPath, previewPath, themesPath, websitePath } from "@/lib/site";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/website`);
  if (!hasPermission(ctx, "design.edit")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Website" />
        <AccessNotice title="You don't have access to the website">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const [pages, theme] = await Promise.all([listPages(ctx), getStoreTheme(ctx)]);
  const liveTheme = themeDefinition(theme.themeKey) ?? DEFAULT_THEME_DEFINITION;
  const home = pages.find((p) => p.kind === "HOME");
  const others = pages.filter((p) => p.kind === "STANDARD");
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Website"
        description="Design your pages and set your menus, then preview your changes before you publish them. Choose and customise your theme in Themes."
        actions={
          <a
            href={previewPath(storeId)}
            target="_blank"
            rel="noopener"
            className={buttonClasses("secondary", "md")}
          >
            Preview site
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="grid content-start gap-3 p-5">
          <h2 className="text-body font-semibold text-ink">Home page</h2>
          <p className="text-body-sm text-ink-muted">What visitors see first.</p>
          {home ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={home.status === "changes" ? "warning" : "success"}>
                {home.status === "changes" ? "Unpublished changes" : "Published"}
              </Badge>
              <Link href={builderPath(storeId, home.id)} className={buttonClasses("primary", "md")}>
                Edit home page
              </Link>
            </div>
          ) : null}
        </Card>
        <Card className="grid content-start gap-3 p-5">
          <h2 className="text-body font-semibold text-ink">Pages</h2>
          <p className="text-body-sm text-ink-muted">
            {others.length === 0
              ? "No other pages yet. Add About, Contact, Shipping or Returns."
              : `${String(others.length)} ${others.length === 1 ? "page" : "pages"}, such as ${others[0]?.title ?? ""}.`}
          </p>
          <Link
            href={pagesPath(storeId)}
            className={buttonClasses("secondary", "md", "justify-self-start")}
          >
            Manage pages
          </Link>
        </Card>
        <Card className="grid content-start gap-3 p-5">
          <h2 className="text-body font-semibold text-ink">Theme</h2>
          <p className="text-body-sm text-ink-muted">
            {theme.name} theme, {themePreset(liveTheme, theme.published.preset).name} style
            {theme.hasUnpublishedChanges ? ", with unpublished changes" : ""}.
          </p>
          <Link
            href={themesPath(storeId)}
            className={buttonClasses("secondary", "md", "justify-self-start")}
          >
            Go to Themes
          </Link>
        </Card>
        <Card className="grid content-start gap-3 p-5">
          <h2 className="text-body font-semibold text-ink">Menus</h2>
          <p className="text-body-sm text-ink-muted">The links in your site's header and footer.</p>
          {hasPermission(ctx, "navigation.manage") ? (
            <Link
              href={websitePath(storeId, "/navigation")}
              className={buttonClasses("secondary", "md", "justify-self-start")}
            >
              Edit menus
            </Link>
          ) : (
            <Button variant="secondary" disabled className="justify-self-start">
              Your role can't edit menus
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}
