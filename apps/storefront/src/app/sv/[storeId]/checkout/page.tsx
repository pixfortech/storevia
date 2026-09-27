import { getCheckout, type CheckoutAddress, type CheckoutView } from "@storevia/commerce/checkout";
import { formatPrice } from "@storevia/commerce/blocks";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { checkoutRequest, readFlash, type Flash } from "@/lib/checkout";
import {
  addressAction,
  cancelPaymentAction,
  checkPaymentAction,
  contactAction,
  discountAction,
  payAction,
  removeDiscountAction,
  shippingAction,
} from "./actions";
import { CheckoutSummary, Field, FieldError } from "./parts";

// Checkout (ADR-0031 §1): dynamic, private, no-store, no client JavaScript.
// Every step is its own small form; the server re-prices after each one and
// the "Pay" form carries the hash of exactly the quote shown here.

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const CHANGES: Record<string, string> = {
  PRICE_CHANGED: "Prices changed since you last looked. Please review your order before paying.",
  ITEM_UNAVAILABLE:
    "Something in your order just sold out or is no longer available. Please review your order.",
  QUANTITY_CHANGED: "The items in your order changed. Please review your order.",
  DISCOUNT_CHANGED: "Your discount code can no longer be used. Please review your order.",
  SHIPPING_CHANGED: "Shipping for your address changed. Please choose a shipping method again.",
  NOT_READY: "A few details are still needed before you can pay.",
};

const PROBLEMS: Record<string, string> = {
  EMPTY: "Your cart is empty.",
  UNAVAILABLE:
    "Some items are no longer available and aren't included. Update your cart to continue.",
  EMAIL: "Add your email address.",
  ADDRESS: "Add a delivery address.",
  SHIPPING_UNAVAILABLE: "We don't ship to this address yet.",
  SHIPPING: "Choose a shipping method.",
  DISCOUNT: "Your discount code can't be used. Remove it to continue.",
  ZERO_TOTAL: "Orders must have something to pay.",
};

const LAST_PAYMENT: Record<string, string> = {
  DECLINED: "Your payment didn't go through, and you haven't been charged. You can try again.",
  CANCELLED: "The payment was cancelled. You can try again when you're ready.",
  ERROR: "We couldn't reach the payment provider. Please try again.",
};

interface Props {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ storeId }, search] = await Promise.all([params, searchParams]);
  const store = await requestStore(storeId);
  if (!isBrowsable(store)) redirect("/");
  const view = await getCheckout(await checkoutRequest(store));
  if (!view) redirect("/cart");
  if (view.stage === "completed") redirect("/checkout/complete");
  const flash = await readFlash();
  const price = (p: { amount: string; currency: string }) => formatPrice(p, store.locale);
  const changed = typeof search["changed"] === "string" ? CHANGES[search["changed"]] : undefined;

  if (view.stage === "expired") {
    return (
      <main id="main" className="sv-container sv-checkout">
        <h1>Checkout</h1>
        <p className="sv-notice" role="alert">
          This checkout has expired. Your cart is still saved.
        </p>
        <a className="sv-button" href="/cart">
          Return to your cart
        </a>
      </main>
    );
  }

  return (
    <main id="main" className="sv-container sv-checkout">
      <h1>Checkout</h1>
      {changed ? (
        <p className="sv-notice" role="alert">
          {changed}
        </p>
      ) : null}
      <div className="sv-checkout-grid">
        <div className="sv-checkout-steps">
          {view.stage === "paying" ? (
            <Paying view={view} flash={flash} />
          ) : (
            <OpenSteps
              view={view}
              flash={flash}
              locale={store.locale}
              price={price}
              country={store.country}
            />
          )}
        </div>
        <CheckoutSummary view={view} price={price} />
      </div>
    </main>
  );
}

function Paying({ view, flash }: { view: CheckoutView; flash: Flash | null }) {
  return (
    <section id="payment" aria-labelledby="payment-heading" className="sv-checkout-step">
      <h2 id="payment-heading">Payment in progress</h2>
      {flash?.step === "payment" && flash.message ? (
        <p className="sv-notice" role="alert">
          {flash.message}
        </p>
      ) : null}
      <p>
        Your items are held for you while you pay. If you&apos;ve already paid, we&apos;ll confirm
        it shortly.
      </p>
      <div className="sv-checkout-actions">
        {view.paymentRedirectUrl ? (
          <a className="sv-button" href={view.paymentRedirectUrl}>
            Continue to payment
          </a>
        ) : null}
        <form action={checkPaymentAction}>
          <button className="sv-button sv-button-secondary" type="submit">
            I&apos;ve paid — check status
          </button>
        </form>
        <form action={cancelPaymentAction}>
          <button className="sv-link-button" type="submit">
            Cancel payment and change details
          </button>
        </form>
      </div>
    </section>
  );
}

function OpenSteps({
  view,
  flash,
  locale,
  price,
  country,
}: {
  view: CheckoutView;
  flash: Flash | null;
  locale: string;
  price: (p: { amount: string; currency: string }) => string;
  country: string;
}) {
  const errorsFor = (step: Flash["step"]) =>
    flash?.step === step ? (flash.fieldErrors ?? {}) : {};
  const valuesFor = (step: Flash["step"]) => (flash?.step === step ? (flash.values ?? {}) : {});
  const messageFor = (step: Flash["step"]) => (flash?.step === step ? flash.message : undefined);
  const regionName = new Intl.DisplayNames([locale, "en"], { type: "region" });
  const countries = [...new Set([...view.shippingCountries, country])]
    .map((code) => ({ code, name: regionName.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const addressValues = valuesFor("address");
  const address = (name: keyof CheckoutAddress) =>
    addressValues[name] ?? view.shippingAddress?.[name] ?? "";
  const billingValue = (name: keyof CheckoutAddress) =>
    addressValues[`billing_${name}`] ?? view.billingAddress?.[name] ?? "";
  const sameBilling =
    addressValues["billingSameAsShipping"] !== undefined
      ? addressValues["billingSameAsShipping"] === "on"
      : !view.billingAddress ||
        JSON.stringify(view.billingAddress) === JSON.stringify(view.shippingAddress);
  const ready = view.problems.length === 0;
  const lastPayment = view.lastPaymentProblem ? LAST_PAYMENT[view.lastPaymentProblem] : undefined;

  const addressFields = (prefix: "" | "billing_", value: (n: keyof CheckoutAddress) => string) => {
    const errors = errorsFor("address");
    const f = (name: keyof CheckoutAddress) => ({
      id: `${prefix || "ship_"}${name}`,
      name: `${prefix}${name}`,
      error: errors[`${prefix}${name}`],
      defaultValue: value(name),
    });
    return (
      <div className="sv-field-grid">
        <Field
          label="First name"
          autoComplete={`${prefix ? "billing" : "shipping"} given-name`}
          required
          {...f("firstName")}
        />
        <Field
          label="Last name"
          autoComplete={`${prefix ? "billing" : "shipping"} family-name`}
          required
          {...f("lastName")}
        />
        <Field
          label="Company (optional)"
          autoComplete={`${prefix ? "billing" : "shipping"} organization`}
          wide
          {...f("company")}
        />
        <Field
          label="Address"
          autoComplete={`${prefix ? "billing" : "shipping"} address-line1`}
          required
          wide
          {...f("line1")}
        />
        <Field
          label="Apartment, suite, etc. (optional)"
          autoComplete={`${prefix ? "billing" : "shipping"} address-line2`}
          wide
          {...f("line2")}
        />
        <Field
          label="City"
          autoComplete={`${prefix ? "billing" : "shipping"} address-level2`}
          required
          {...f("city")}
        />
        <Field
          label="State or region code (optional)"
          hint="For example KA or MH"
          autoComplete="off"
          {...f("regionCode")}
        />
        <Field
          label="Postal code"
          autoComplete={`${prefix ? "billing" : "shipping"} postal-code`}
          {...f("postalCode")}
        />
        <div className="sv-field">
          <label htmlFor={`${prefix || "ship_"}countryCode`}>Country</label>
          <select
            id={`${prefix || "ship_"}countryCode`}
            name={`${prefix}countryCode`}
            autoComplete={`${prefix ? "billing" : "shipping"} country`}
            defaultValue={value("countryCode") || country}
            aria-invalid={errors[`${prefix}countryCode`] ? true : undefined}
            aria-describedby={
              errors[`${prefix}countryCode`] ? `${prefix || "ship_"}countryCode-error` : undefined
            }
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError
            id={`${prefix || "ship_"}countryCode-error`}
            message={errors[`${prefix}countryCode`]}
          />
        </div>
        <Field
          label="Phone (optional)"
          type="tel"
          autoComplete={`${prefix ? "billing" : "shipping"} tel`}
          {...f("phone")}
        />
      </div>
    );
  };

  return (
    <>
      {lastPayment ? (
        <p className="sv-notice" role="alert">
          {lastPayment}
        </p>
      ) : null}

      <section id="contact" aria-labelledby="contact-heading" className="sv-checkout-step">
        <h2 id="contact-heading">1. Contact</h2>
        <form action={contactAction} noValidate>
          {messageFor("contact") ? (
            <p className="sv-notice" role="alert">
              {messageFor("contact")}
            </p>
          ) : null}
          <Field
            id="email"
            name="email"
            type="email"
            label="Email"
            hint="We'll send your order confirmation here."
            autoComplete="email"
            required
            defaultValue={valuesFor("contact")["email"] ?? view.email ?? ""}
            error={errorsFor("contact")["email"]}
          />
          <button className="sv-button sv-button-secondary" type="submit">
            {view.email ? "Update email" : "Continue"}
          </button>
        </form>
      </section>

      <section id="address" aria-labelledby="address-heading" className="sv-checkout-step">
        <h2 id="address-heading">2. Delivery address</h2>
        <form action={addressAction} noValidate>
          {messageFor("address") ? (
            <p className="sv-notice" role="alert">
              {messageFor("address")}
            </p>
          ) : null}
          {addressFields("", address)}
          <details className="sv-billing" open={!sameBilling}>
            <summary>Billing address</summary>
            <label className="sv-check">
              <input type="checkbox" name="billingSameAsShipping" defaultChecked={sameBilling} />
              Same as delivery address
            </label>
            <p className="sv-muted">Untick to enter a different billing address.</p>
            {addressFields("billing_", billingValue)}
          </details>
          <button className="sv-button sv-button-secondary" type="submit">
            {view.shippingAddress ? "Update address" : "Continue"}
          </button>
        </form>
      </section>

      {view.requiresShipping ? (
        <section id="shipping" aria-labelledby="shipping-heading" className="sv-checkout-step">
          <h2 id="shipping-heading">3. Shipping method</h2>
          {!view.shippingAddress ? (
            <p className="sv-muted">Add your address to see shipping options.</p>
          ) : view.shippingOptions.length === 0 ? (
            <p className="sv-notice" role="status">
              We don&apos;t ship to this address yet.
            </p>
          ) : (
            <form action={shippingAction}>
              <fieldset>
                <legend className="sv-visually-hidden">Shipping method</legend>
                {view.shippingOptions.map((o) => (
                  <label key={o.id} className="sv-option">
                    <input
                      type="radio"
                      name="rateId"
                      value={o.id}
                      defaultChecked={o.selected}
                      required
                    />
                    <span>{o.name}</span>
                    <strong>{o.amount.amount === "0" ? "Free" : price(o.amount)}</strong>
                  </label>
                ))}
              </fieldset>
              <FieldError
                id="rateId-error"
                message={errorsFor("shipping")["rateId"] ?? messageFor("shipping")}
              />
              <button className="sv-button sv-button-secondary" type="submit">
                {view.shipping ? "Update shipping" : "Use this method"}
              </button>
            </form>
          )}
        </section>
      ) : null}

      <section id="discount" aria-labelledby="discount-heading" className="sv-checkout-step">
        <h2 id="discount-heading">Discount code</h2>
        {view.discountCode ? (
          <form action={removeDiscountAction} className="sv-inline-form">
            <p>
              <strong>{view.discountCode}</strong>
              {view.discount ? ` · −${price(view.discount.amount)}` : " · can't be used"}
            </p>
            <button className="sv-link-button" type="submit">
              Remove<span className="sv-visually-hidden"> discount code {view.discountCode}</span>
            </button>
          </form>
        ) : (
          <form action={discountAction} className="sv-inline-form" noValidate>
            <Field
              id="code"
              name="code"
              label="Discount code"
              autoComplete="off"
              defaultValue={valuesFor("discount")["code"] ?? ""}
              error={errorsFor("discount")["code"] ?? messageFor("discount")}
            />
            <button className="sv-button sv-button-secondary" type="submit">
              Apply
            </button>
          </form>
        )}
      </section>

      <section id="review" aria-labelledby="review-heading" className="sv-checkout-step">
        <h2 id="review-heading">{view.requiresShipping ? "4" : "3"}. Review and pay</h2>
        <div id="payment">
          {messageFor("payment") ? (
            <p className="sv-notice" role="alert">
              {messageFor("payment")}
            </p>
          ) : null}
          {!ready ? (
            <ul className="sv-problems">
              {view.problems.map((p) => (
                <li key={p}>{PROBLEMS[p] ?? p}</li>
              ))}
            </ul>
          ) : null}
          {!view.paymentsAvailable ? (
            <p className="sv-notice" role="status">
              This store isn&apos;t taking payments right now. Please try again later.
            </p>
          ) : (
            <form action={payAction}>
              <input type="hidden" name="pricingHash" value={view.pricingHash} />
              <p>
                You&apos;ll pay <strong>{price(view.total)}</strong> on a secure payment page. Card
                details are never shared with this store.
              </p>
              <button className="sv-button" type="submit" disabled={!ready}>
                Pay {price(view.total)}
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
