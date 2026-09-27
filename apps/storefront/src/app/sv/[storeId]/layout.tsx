import { COMMERCE_BLOCK_CSS } from "@storevia/commerce/blocks";
import { BASE_CSS } from "@storevia/editor/render";
import { isIndexable } from "@storevia/site-engine/seo";
import { requestNonce, requestStore } from "@storevia/site-engine/request";
import { SiteMenu, SiteShell } from "@storevia/site-engine/shell";
import type { Metadata, Viewport } from "next";
import { COMMERCE_CSS, StoreActions } from "@/components/chrome";
import { headerCartCount } from "@/lib/cart";
import { storeChrome } from "@/lib/route-data";

// The root layout for every store page: the Site Engine's branded shell with
// the store's theme and menus (ADR-0030), and Storevia's search and cart links. The store comes from the
// proxy's signed header and must match the route's store segment.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeId: string }>;
}): Promise<Metadata> {
  const store = await requestStore((await params).storeId);
  return {
    title: { default: store.name, template: `%s – ${store.name}` },
    ...(isIndexable(store) ? {} : { robots: { index: false, follow: false } }),
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const store = await requestStore((await params).storeId);
  const [chrome, cartCount, nonce] = await Promise.all([
    storeChrome(store),
    headerCartCount(store),
    requestNonce(),
  ]);
  return (
    <SiteShell
      site={store}
      nonce={nonce}
      css={`
        ${BASE_CSS}${COMMERCE_BLOCK_CSS}${COMMERCE_CSS}
      `}
      tokens={chrome.theme}
      nav={<SiteMenu label="Main" links={chrome.mainMenu} />}
      footerNav={<SiteMenu label="Footer" links={chrome.footerMenu} />}
      actions={<StoreActions cartCount={cartCount} />}
      previewNote={
        store.availability === "live"
          ? "shoppers see this store."
          : "this store isn't live yet; only you can see it."
      }
    >
      {children}
    </SiteShell>
  );
}
