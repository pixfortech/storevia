import { storefrontOrigin } from "@storevia/domains";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { StorePage } from "@/components/store-page";
import { renderContext } from "@/lib/render-context";
import { requestNonce, requestStore } from "@/lib/request-store";
import { routeData, routeHandle } from "@/lib/route-data";

interface Props {
  params: Promise<{ storeId: string; handle: string }>;
}

async function load(params: Props["params"]) {
  const { storeId, handle: raw } = await params;
  const store = await requestStore(storeId);
  const handle = routeHandle(raw);
  if (!handle) notFound();
  const data = await routeData(store, { kind: "page", handle });
  if (!data.found) notFound();
  return { store, data, handle };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, data, handle } = await load(params);
  return {
    title: data.page?.seoTitle ?? data.page?.title ?? handle,
    ...(data.page?.seoDescription ? { description: data.page.seoDescription } : {}),
    alternates: { canonical: `${storefrontOrigin(store.canonicalHostname)}/pages/${handle}` },
  };
}

export default async function ContentPage({ params }: Props) {
  const [{ store, data }, nonce] = await Promise.all([load(params), requestNonce()]);
  return (
    <StorePage
      document={data.document}
      ctx={renderContext(store, data, { slots: { AddToCart } })}
      nonce={nonce}
    />
  );
}
