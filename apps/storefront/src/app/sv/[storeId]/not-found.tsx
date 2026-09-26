import type { Metadata } from "next";
import { AddToCart } from "@/components/add-to-cart";
import { StorePage } from "@/components/store-page";
import { renderContext } from "@/lib/render-context";
import { requestNonce, requestStore } from "@/lib/request-store";
import { routeData } from "@/lib/route-data";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** The store's NOT_FOUND page (published, or the default template), with status 404. */
export default async function StoreNotFound() {
  const store = await requestStore();
  const [data, nonce] = await Promise.all([
    routeData(store, { kind: "not-found" }),
    requestNonce(),
  ]);
  return (
    <StorePage
      document={data.document}
      ctx={renderContext(store, data, { slots: { AddToCart } })}
      nonce={nonce}
    />
  );
}
