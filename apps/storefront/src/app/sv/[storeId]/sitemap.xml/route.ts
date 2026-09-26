import { requestStore } from "@storevia/site-engine/request";
import { isIndexable, sitemapXml } from "@storevia/site-engine/seo";
import { storeSitemap } from "@/lib/route-data";

// Per-store sitemap (ADR-0028 §10): canonical primary-host URLs only, for a
// live store outside preview. Entries are the store's content pages and its
// catalogue.
export async function GET(_request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const store = await requestStore((await params).storeId);
  if (!isIndexable(store)) return new Response("Not found", { status: 404 });
  const entries = await storeSitemap(store);
  return new Response(sitemapXml(store, [{ path: "/", updatedAt: null }, ...entries]), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
