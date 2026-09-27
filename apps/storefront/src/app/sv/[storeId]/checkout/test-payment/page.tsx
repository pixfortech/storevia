import { readTestPayment } from "@storevia/commerce/checkout";
import { formatPrice } from "@storevia/commerce/blocks";
import { isTestPaymentsEnabled } from "@storevia/payments";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { checkoutRequest } from "@/lib/checkout";
import { testPaymentAction } from "../actions";

// The Test Payment Provider's "hosted page" (ADR-0031 §4): development and
// test only (it is a 404 anywhere else). It shows the shopper's own pending
// attempt and sends a signed event for the outcome they pick through the
// same pipeline as a real provider's webhook. No money moves.

export const metadata: Metadata = {
  title: "Test payment",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TestPaymentPage({ params, searchParams }: Props) {
  if (!isTestPaymentsEnabled()) notFound();
  const [{ storeId }, search] = await Promise.all([params, searchParams]);
  const store = await requestStore(storeId);
  if (!isBrowsable(store)) redirect("/");
  const ref = typeof search["ref"] === "string" ? search["ref"].slice(0, 80) : "";
  const attempt = ref ? await readTestPayment(await checkoutRequest(store), ref) : null;
  if (!attempt) notFound();
  return (
    <main id="main" className="sv-container sv-checkout sv-test-payment">
      <p className="sv-test-badge">Test mode · no real money moves</p>
      <h1>Pay {formatPrice(attempt.amount, store.locale)}</h1>
      <p>
        This is Storevia&apos;s test payment page for {attempt.storeName}. Choose what happens to
        this payment.
      </p>
      <div className="sv-checkout-actions">
        {(
          [
            ["pay", "Pay successfully", "sv-button"],
            ["decline", "Decline the payment", "sv-button sv-button-secondary"],
            ["cancel", "Cancel and go back", "sv-link-button"],
          ] as const
        ).map(([outcome, label, className]) => (
          <form key={outcome} action={testPaymentAction}>
            <input type="hidden" name="ref" value={ref} />
            <input type="hidden" name="outcome" value={outcome} />
            <button className={className} type="submit">
              {label}
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
