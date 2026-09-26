import { requestStore } from "@storevia/site-engine/request";
import { robotsTxt } from "@storevia/site-engine/seo";

// Per-store robots.txt (ADR-0028 §10) from the Site Engine's builder. Carts
// and search results are never crawled; a store that isn't live (or a
// preview) isn't crawled at all.
export async function GET(_request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const store = await requestStore((await params).storeId);
  return new Response(robotsTxt(store, { disallow: ["/cart", "/search"] }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
