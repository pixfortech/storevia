import { searchAllowed } from "@storevia/commerce/storefront";
import { clientIp } from "@storevia/security";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AddToCart } from "@/components/add-to-cart";
import { StorePage } from "@/components/store-page";
import { renderContext } from "@/lib/render-context";
import { requestNonce, requestStore } from "@storevia/site-engine/request";
import { routeData, searchRoute } from "@/lib/route-data";

interface Props {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Search result pages are never indexed (ADR-0028 §10).
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({ params, searchParams }: Props) {
  const [{ storeId }, search, nonce] = await Promise.all([params, searchParams, requestNonce()]);
  const store = await requestStore(storeId);
  let route = searchRoute(search["q"], search["page"]);
  // A flood of distinct queries would all miss the cache (M8, S10): past
  // the limit the page shows an empty search instead of querying.
  if (route.kind === "search" && route.query) {
    const allowed = await searchAllowed(store, clientIp(await headers()));
    if (!allowed) route = searchRoute(undefined, undefined);
  }
  const data = await routeData(store, route);
  const query = route.kind === "search" ? route.query : "";
  const ctx = renderContext(store, data, {
    slots: { AddToCart },
    pageHref: (page) => {
      const q = new URLSearchParams();
      if (query) q.set("q", query);
      if (page > 1) q.set("page", String(page));
      const qs = q.toString();
      return qs ? `/search?${qs}` : "/search";
    },
  });
  return <StorePage document={data.document} ctx={ctx} nonce={nonce} />;
}
