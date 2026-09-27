import { getCheckout } from "@storevia/commerce/checkout";
import { formatPrice } from "@storevia/commerce/blocks";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { checkoutRequest } from "@/lib/checkout";
import { CheckoutSummary } from "../parts";

// The order confirmation. Only the browser holding the checkout token sees
// it, and only once the order exists (a captured payment, confirmed on the
// server). The order number alone gives no access to anything.

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function OrderCompletePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const store = await requestStore((await params).storeId);
  if (!isBrowsable(store)) redirect("/");
  const view = await getCheckout(await checkoutRequest(store));
  if (!view) redirect("/cart");
  if (view.stage !== "completed" || !view.order) redirect("/checkout");
  const price = (p: { amount: string; currency: string }) => formatPrice(p, store.locale);
  const a = view.shippingAddress;
  return (
    <main id="main" className="sv-container sv-checkout">
      <h1>Thank you for your order</h1>
      <p className="sv-order-number">
        Order <strong>#{view.order.number}</strong>
      </p>
      <p>
        We&apos;ve received your payment. A confirmation will be sent to{" "}
        <strong>{view.email}</strong>.
      </p>
      <div className="sv-checkout-grid">
        <div>
          {a ? (
            <section aria-labelledby="ship-to-heading" className="sv-checkout-step">
              <h2 id="ship-to-heading">Delivering to</h2>
              <address>
                {a.firstName} {a.lastName}
                <br />
                {a.line1}
                {a.line2 ? (
                  <>
                    <br />
                    {a.line2}
                  </>
                ) : null}
                <br />
                {[a.city, a.regionCode, a.postalCode].filter(Boolean).join(", ")}
                <br />
                {a.countryCode}
              </address>
            </section>
          ) : null}
          <a className="sv-button" href="/">
            Continue shopping
          </a>
        </div>
        <CheckoutSummary view={view} price={price} />
      </div>
    </main>
  );
}
