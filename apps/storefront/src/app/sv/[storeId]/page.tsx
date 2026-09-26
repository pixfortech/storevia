import { storefrontOrigin } from "@storevia/domains";
import type { Metadata } from "next";
import { AddToCart } from "@/components/add-to-cart";
import { JsonLd, StorePage } from "@/components/store-page";
import { renderContext } from "@/lib/render-context";
import { requestNonce, requestStore } from "@storevia/site-engine/request";
import { routeData } from "@/lib/route-data";

interface Props {
  params: Promise<{ storeId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await requestStore((await params).storeId);
  const data = await routeData(store, { kind: "home" });
  return {
    title: { absolute: data.page?.seoTitle ?? store.name },
    ...(data.page?.seoDescription ? { description: data.page.seoDescription } : {}),
    alternates: { canonical: `${storefrontOrigin(store.canonicalHostname)}/` },
  };
}

export default async function HomePage({ params }: Props) {
  const store = await requestStore((await params).storeId);
  const [data, nonce] = await Promise.all([routeData(store, { kind: "home" }), requestNonce()]);
  const origin = storefrontOrigin(store.canonicalHostname);
  return (
    <StorePage
      document={data.document}
      ctx={renderContext(store, data, { slots: { AddToCart } })}
      nonce={nonce}
    >
      <JsonLd
        nonce={nonce}
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: store.name,
          url: `${origin}/`,
          potentialAction: {
            "@type": "SearchAction",
            target: `${origin}/search?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />
    </StorePage>
  );
}
