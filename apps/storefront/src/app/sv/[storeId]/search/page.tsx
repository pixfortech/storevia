import type { Metadata } from "next";
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
  const route = searchRoute(search["q"], search["page"]);
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
