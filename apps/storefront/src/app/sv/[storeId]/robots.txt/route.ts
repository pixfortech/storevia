import { storefrontOrigin } from "@storevia/domains";
import { requestStore } from "@/lib/request-store";

// Per-store robots.txt (ADR-0028 §10). Carts and search results are never
// crawled; a store that isn't live (or a preview) isn't crawled at all.
export async function GET(_request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const store = await requestStore((await params).storeId);
  const body =
    store.availability === "live" && !store.preview
      ? `User-agent: *\nDisallow: /cart\nDisallow: /search\nSitemap: ${storefrontOrigin(store.canonicalHostname)}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
