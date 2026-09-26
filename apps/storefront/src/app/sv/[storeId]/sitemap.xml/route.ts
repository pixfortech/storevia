import { storefrontOrigin } from "@storevia/domains";
import { escapeHtml } from "@/lib/pages-html";
import { isBrowsable, requestStore } from "@/lib/request-store";
import { storeSitemap } from "@/lib/route-data";

// Per-store sitemap (ADR-0028 §10): canonical primary-host URLs only.
export async function GET(_request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const store = await requestStore((await params).storeId);
  if (store.availability !== "live" || store.preview)
    return new Response("Not found", { status: 404 });
  if (!isBrowsable(store)) return new Response("Not found", { status: 404 });
  const origin = storefrontOrigin(store.canonicalHostname);
  const entries = await storeSitemap(store);
  const urls = [{ path: "/", updatedAt: null as Date | null }, ...entries]
    .map(
      (e) =>
        `<url><loc>${escapeHtml(`${origin}${e.path}`)}</loc>${e.updatedAt ? `<lastmod>${e.updatedAt.toISOString()}</lastmod>` : ""}</url>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
