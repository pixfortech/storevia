import { confirmPayment } from "@storevia/commerce/checkout";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import { isDomainError } from "@storevia/types";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { checkoutRequest } from "@/lib/checkout";
import { checkPaymentAction } from "../actions";

// Where the payment provider sends the shopper back (ADR-0031 §4). Arriving
// here proves nothing: the query string is ignored, and the server asks the
// provider about the attempt it recorded (a verified webhook may already
// have settled it). Then the shopper sees the order, or the checkout again.

export const metadata: Metadata = {
  title: "Confirming your payment",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const store = await requestStore((await params).storeId);
  if (!isBrowsable(store)) redirect("/");
  let stage: string | null;
  try {
    stage = (await confirmPayment(await checkoutRequest(store)))?.stage ?? null;
  } catch (error) {
    if (!isDomainError(error)) throw error;
    // Rate limited: show the waiting state; the webhook will settle it.
    stage = "paying";
  }
  if (stage === null) redirect("/cart");
  if (stage === "completed") redirect("/checkout/complete");
  if (stage !== "paying") redirect("/checkout?step=payment");
  return (
    <main id="main" className="sv-container sv-checkout">
      <h1>Confirming your payment</h1>
      <p role="status">
        We&apos;re waiting for the payment provider to confirm your payment. This usually takes a
        few seconds. Please don&apos;t pay again.
      </p>
      <div className="sv-checkout-actions">
        <form action={checkPaymentAction}>
          <button className="sv-button" type="submit">
            Check again
          </button>
        </form>
        <a className="sv-link-button" href="/checkout?step=payment">
          Back to checkout
        </a>
      </div>
    </main>
  );
}
