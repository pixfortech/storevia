import { toDecimalString } from "@storevia/commerce/money";
import { richTextToPlainText } from "@storevia/commerce/rich-text";
import { storefrontOrigin } from "@storevia/domains";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { JsonLd, StorePage } from "@/components/store-page";
import { renderContext } from "@/lib/render-context";
import { requestNonce, requestStore } from "@/lib/request-store";
import { routeData, routeHandle } from "@/lib/route-data";

interface Props {
  params: Promise<{ storeId: string; handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(params: Props["params"]) {
  const { storeId, handle: raw } = await params;
  const store = await requestStore(storeId);
  const handle = routeHandle(raw);
  if (!handle) notFound();
  const data = await routeData(store, { kind: "product", handle });
  if (!data.found || !data.product) notFound();
  return { store, data, product: data.product };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, data, product } = await load(params);
  const description = product.seoDescription ?? richTextToPlainText(product.description, 300);
  const url = `${storefrontOrigin(store.canonicalHostname)}/products/${product.handle}`;
  return {
    title: product.seoTitle ?? data.page?.seoTitle ?? product.title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: {
      title: product.title,
      url,
      ...(product.images[0] ? { images: [{ url: product.images[0].url }] } : {}),
    },
  };
}

const CART_MESSAGES: Record<string, string> = {
  "sold-out": "Sorry, that option just sold out.",
  unavailable: "That item is no longer available.",
  busy: "Too many changes at once. Please wait a moment and try again.",
  full: "Your cart is full. Remove something before adding more.",
};

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ store, data, product }, search, nonce] = await Promise.all([
    load(params),
    searchParams,
    requestNonce(),
  ]);
  const requested = typeof search["variant"] === "string" ? search["variant"] : null;
  const selected = product.variants.some((v) => v.id === requested) ? requested : null;
  const message = typeof search["cart"] === "string" ? CART_MESSAGES[search["cart"]] : undefined;
  const url = `${storefrontOrigin(store.canonicalHostname)}/products/${product.handle}`;
  const offers = product.variants.map((v) => ({
    "@type": "Offer",
    price: toDecimalString({ amount: BigInt(v.price.amount), currency: v.price.currency }),
    priceCurrency: v.price.currency,
    availability: v.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    url: `${url}?variant=${encodeURIComponent(v.id)}`,
  }));
  const ctx = renderContext(store, data, {
    slots: { AddToCart },
    selectedVariantId: selected,
    variantHref: (id) => `/products/${product.handle}?variant=${encodeURIComponent(id)}`,
  });
  return (
    <StorePage document={data.document} ctx={ctx} nonce={nonce}>
      {message ? (
        <div className="sv-container">
          <p className="sv-notice" role="alert">
            {message}
          </p>
        </div>
      ) : null}
      <JsonLd
        nonce={nonce}
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.title,
          description: richTextToPlainText(product.description, 5000) || undefined,
          image: product.images.map((i) => i.url),
          ...(product.vendor ? { brand: { "@type": "Brand", name: product.vendor } } : {}),
          url,
          offers: offers.length === 1 ? offers[0] : offers,
        }}
      />
    </StorePage>
  );
}
