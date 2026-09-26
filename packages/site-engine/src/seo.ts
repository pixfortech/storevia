// Generic SEO (ADR-0028 §10, ADR-0029): canonical URLs on the site's primary
// host, robots.txt, sitemap XML and escaped JSON-LD. What goes into them
// (which paths to hide, which entries to list, which structured data) is
// the composing app's.
import { storefrontOrigin } from "@storevia/domains";
import type { StoreRequestContext } from "./context";
import { escapeHtml } from "./html";

type SeoContext = Pick<StoreRequestContext, "availability" | "preview" | "canonicalHostname">;

/** Only a live site outside preview is indexed. */
export const isIndexable = (ctx: SeoContext): boolean =>
  ctx.availability === "live" && !ctx.preview;

/** An absolute URL on the site's canonical host. `path` must start with "/". */
export function canonicalUrl(ctx: Pick<SeoContext, "canonicalHostname">, path = "/"): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("canonicalUrl: path must be site-relative");
  return `${storefrontOrigin(ctx.canonicalHostname)}${path}`;
}

/** robots.txt: nothing crawled unless indexable; otherwise the given paths hidden and the sitemap listed. */
export function robotsTxt(
  ctx: SeoContext,
  options: { readonly disallow: readonly string[] },
): string {
  if (!isIndexable(ctx)) return "User-agent: *\nDisallow: /\n";
  const lines = ["User-agent: *", ...options.disallow.map((p) => `Disallow: ${p}`)];
  return `${lines.join("\n")}\nSitemap: ${canonicalUrl(ctx, "/sitemap.xml")}\n`;
}

export interface SitemapUrl {
  readonly path: string;
  readonly updatedAt: Date | null;
}

/** Sitemap XML with canonical URLs, escaped, capped at the protocol's 50,000 URLs. */
export function sitemapXml(
  ctx: Pick<SeoContext, "canonicalHostname">,
  entries: readonly SitemapUrl[],
): string {
  const urls = entries
    .slice(0, 50_000)
    .map(
      (e) =>
        `<url><loc>${escapeHtml(canonicalUrl(ctx, e.path))}</loc>${e.updatedAt ? `<lastmod>${e.updatedAt.toISOString()}</lastmod>` : ""}</url>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** JSON for a <script type="application/ld+json">, escaped so no value can close the element. */
export function jsonLdJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
