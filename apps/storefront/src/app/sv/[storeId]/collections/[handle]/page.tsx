import { richTextToPlainText } from "@storevia/commerce/rich-text";
import { storefrontOrigin } from "@storevia/domains";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { StorePage } from "@/components/store-page";
import { renderContext } from "@/lib/render-context";
import { requestNonce, requestStore } from "@/lib/request-store";
import { collectionRoute, routeData, routeHandle } from "@/lib/route-data";

interface Props {
  params: Promise<{ storeId: string; handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(props: Props) {
  const [{ storeId, handle: raw }, search] = await Promise.all([props.params, props.searchParams]);
  const store = await requestStore(storeId);
  const handle = routeHandle(raw);
  if (!handle) notFound();
  const data = await routeData(store, collectionRoute(handle, search["page"]));
  if (!data.found || !data.collection) notFound();
  return { store, data, collection: data.collection };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { store, collection } = await load(props);
  const description = collection.seoDescription ?? richTextToPlainText(collection.description, 300);
  const base = `${storefrontOrigin(store.canonicalHostname)}/collections/${collection.handle}`;
  return {
    title: collection.seoTitle ?? collection.title,
    ...(description ? { description } : {}),
    alternates: {
      canonical: collection.page > 1 ? `${base}?page=${String(collection.page)}` : base,
    },
  };
}

export default async function CollectionPage(props: Props) {
  const [{ store, data, collection }, nonce] = await Promise.all([load(props), requestNonce()]);
  const ctx = renderContext(store, data, {
    slots: { AddToCart },
    pageHref: (page) =>
      `/collections/${collection.handle}${page > 1 ? `?page=${String(page)}` : ""}`,
  });
  return <StorePage document={data.document} ctx={ctx} nonce={nonce} />;
}
