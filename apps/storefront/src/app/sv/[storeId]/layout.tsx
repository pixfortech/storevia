import { COMMERCE_BLOCK_CSS } from "@storevia/commerce/blocks";
import { BASE_CSS } from "@storevia/editor/render";
import { isIndexable } from "@storevia/site-engine/seo";
import { requestNonce, requestStore } from "@storevia/site-engine/request";
import { SiteMenu, SiteShell } from "@storevia/site-engine/shell";
import { DEFAULT_THEME_DEFINITION, themeDefinition } from "@storevia/site-engine/theme";
import type { Metadata, Viewport } from "next";
import { COMMERCE_CSS, StoreActions } from "@/components/chrome";
import { storeIcons } from "@/lib/brand-icons";
import { StoreFooter } from "@/components/store-footer";
import { headerCartCount } from "@/lib/cart";
import { storeChrome } from "@/lib/route-data";

// The root layout for every store page: the Site Engine's branded shell with
// the store's theme (tokens, chrome variant and first-party stylesheet of the
// live theme package, or in a preview the one being previewed) and menus
// (ADR-0030), Storevia's search and cart links, and the store's footer
// (seller details and policies). The store comes from the proxy's signed
// header and must match the route's store segment.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeId: string }>;
}): Promise<Metadata> {
  const store = await requestStore((await params).storeId);
  // The favicon comes with the (cached) chrome, so a change reaches every page.
  const icons = storeIcons((await storeChrome(store)).identity?.favicon);
  return {
    title: { default: store.name, template: `%s – ${store.name}` },
    ...(icons ? { icons } : {}),
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
  const base =
    store.availability === "live"
      ? "shoppers see this store."
      : "this store isn't live yet; only you can see it.";
  return (
    <SiteShell
      site={store}
      nonce={nonce}
      theme={themeDefinition(chrome.themeKey) ?? DEFAULT_THEME_DEFINITION}
      css={`
        ${BASE_CSS}${COMMERCE_BLOCK_CSS}${COMMERCE_CSS}
      `}
      tokens={chrome.theme}
      nav={<SiteMenu label="Main" links={chrome.mainMenu} />}
      footerNav={<SiteMenu label="Footer" links={chrome.footerMenu} />}
      actions={<StoreActions cartCount={cartCount} />}
      logo={chrome.identity?.logo ?? null}
      footer={
        <StoreFooter
          name={chrome.identity?.name ?? store.name}
          identity={chrome.identity}
          footerMenu={chrome.footerMenu}
          policies={chrome.policies}
        />
      }
      previewNote={
        chrome.previewingTheme
          ? `the ${chrome.previewingTheme} theme with its draft settings. It isn't published: shoppers still see your live theme.`
          : base
      }
    >
      {children}
    </SiteShell>
  );
}
