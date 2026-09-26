import { BASE_CSS } from "@storevia/editor/render";
import { themeCss } from "@storevia/editor/theme";
import type { Metadata, Viewport } from "next";
import { CHROME_CSS, StoreFooter, StoreHeader } from "@/components/chrome";
import { headerCartCount } from "@/lib/cart";
import { requestNonce, requestStore } from "@/lib/request-store";
import { storeChrome } from "@/lib/route-data";

// The root layout for every store page. The store comes from the proxy's
// signed header and must match the route's store segment.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeId: string }>;
}): Promise<Metadata> {
  const store = await requestStore((await params).storeId);
  return {
    title: { default: store.name, template: `%s – ${store.name}` },
    ...(store.preview || store.availability !== "live"
      ? { robots: { index: false, follow: false } }
      : {}),
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
    <html lang={store.locale}>
      <head>
        <style nonce={nonce}>{`${themeCss()}${BASE_CSS}${CHROME_CSS}`}</style>
      </head>
      <body>
        <StoreHeader store={store} chrome={chrome} cartCount={cartCount} />
        {children}
        <StoreFooter store={store} />
      </body>
    </html>
  );
}
