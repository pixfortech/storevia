import {
  countryByCode,
  findRegion,
  getCheckout,
  type CheckoutAddress,
  type CheckoutView,
} from "@storevia/commerce/checkout";
import { formatPrice } from "@storevia/commerce/blocks";
import type { PolicyLinkDto } from "@storevia/commerce/storefront";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { checkoutRequest, readFlash, type Flash } from "@/lib/checkout";
import { storeChrome } from "@/lib/route-data";
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
import { CheckoutSummary, controlProps, Field, FieldError, FieldShell, PolicyNote } from "./parts";

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
  ADDRESS: "Add a shipping address.",
  SHIPPING_UNAVAILABLE: "We don't currently ship to this address.",
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
  const [view, chrome] = await Promise.all([
    getCheckout(await checkoutRequest(store)),
    storeChrome(store),
  ]);
  if (!view) redirect("/cart");
  if (view.stage === "completed") redirect("/checkout/complete");
  const flash = await readFlash(typeof search["f"] === "string" ? search["f"] : undefined);
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
              policies={chrome.policies}
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
  policies,
}: {
  view: CheckoutView;
  flash: Flash | null;
  locale: string;
  price: (p: { amount: string; currency: string }) => string;
  country: string;
  /** The store's published policies (linked by the Pay button). */
  policies: readonly PolicyLinkDto[];
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
  const savedSameBilling =
    !view.billingAddress ||
    JSON.stringify(view.billingAddress) === JSON.stringify(view.shippingAddress);
  // A failed submit shows the box as the shopper left it (an unticked box
  // isn't in the form data at all); otherwise as saved, ticked by default.
  const sameBilling =
    flash?.step === "address" ? addressValues["billingSameAsShipping"] === "on" : savedSameBilling;
  // A separate billing address starts empty rather than as a copy of the
  // shipping address.
  const billingValue = (name: keyof CheckoutAddress) =>
    addressValues[`billing_${name}`] ?? (savedSameBilling ? "" : view.billingAddress[name]) ?? "";
  const ready = view.problems.length === 0;
  const lastPayment = view.lastPaymentProblem ? LAST_PAYMENT[view.lastPaymentProblem] : undefined;

  // The form is drawn for one country: the one just submitted, else the
  // saved one, else the store's. With no script, the state list can't follow
  // the country select live, so the form says which country its list was for
  // (regionCountry); if the shopper picks another country, the server refuses
  // the old state and the form comes back with the new country's list.
  const addressFields = (prefix: "" | "billing_", value: (n: keyof CheckoutAddress) => string) => {
    const errors = errorsFor("address");
    const section = prefix ? "billing" : "shipping";
    const f = (name: keyof CheckoutAddress) => ({
      id: `${prefix || "ship_"}${name}`,
      name: `${prefix}${name}`,
      error: errors[`${prefix}${name}`],
      defaultValue: value(name),
    });
    const selected = value("countryCode") || country;
    const geo = countryByCode(selected);
    const offeredFor = addressValues[`${prefix}regionCountry`];
    const regionInput = offeredFor && offeredFor !== selected ? "" : value("region");
    const region_ = {
      id: `${prefix || "ship_"}region`,
      label: geo?.regions ? (geo.regionLabel ?? "State / region") : "State / region (optional)",
      error: errors[`${prefix}region`],
    };
    const postal = geo?.postalCode;
    const country_ = {
      id: `${prefix || "ship_"}countryCode`,
      label: "Country",
      hint:
        countries.length > 1
          ? "If you change the country, you'll choose the state next."
          : undefined,
      error: errors[`${prefix}countryCode`],
    };
    return (
      <div className="sv-field-grid">
        <Field
          label="First name"
          autoComplete={`${section} given-name`}
          required
          {...f("firstName")}
        />
        <Field
          label="Last name"
          autoComplete={`${section} family-name`}
          required
          {...f("lastName")}
        />
        <Field
          label="Company (optional)"
          autoComplete={`${section} organization`}
          wide
          {...f("company")}
        />
        <Field
          label="Address"
          autoComplete={`${section} address-line1`}
          required
          wide
          {...f("line1")}
        />
        <Field
          label="Apartment, suite, etc. (optional)"
          autoComplete={`${section} address-line2`}
          wide
          {...f("line2")}
        />
        <Field label="City" autoComplete={`${section} address-level2`} required {...f("city")} />
        <input type="hidden" name={`${prefix}regionCountry`} value={selected} />
        {geo?.regions ? (
          <FieldShell {...region_}>
            <select
              {...controlProps(region_)}
              name={`${prefix}region`}
              autoComplete={`${section} address-level1`}
              required
              defaultValue={findRegion(geo, regionInput)?.code ?? ""}
            >
              <option value="">Choose…</option>
              {geo.regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </FieldShell>
        ) : (
          <Field
            {...f("region")}
            {...region_}
            defaultValue={regionInput}
            autoComplete={`${section} address-level1`}
          />
        )}
        <Field
          label={postal ? postal.label : "Postal code (optional)"}
          autoComplete={`${section} postal-code`}
          required={postal?.required ?? false}
          inputMode={postal?.numeric ? "numeric" : undefined}
          {...f("postalCode")}
        />
        <FieldShell {...country_}>
          <select
            {...controlProps(country_)}
            name={`${prefix}countryCode`}
            autoComplete={`${section} country`}
            defaultValue={selected}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </FieldShell>
        <Field
          label="Phone (optional)"
          type="tel"
          autoComplete={`${section} tel`}
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
        <h2 id="address-heading">2. Shipping address</h2>
        {/* One step at a time: each step is its own form, so an address typed
            before the email was saved would be lost when the email is sent. */}
        {!view.email ? (
          <p className="sv-muted">Add your email address to continue.</p>
        ) : (
          <form action={addressAction} noValidate>
            {messageFor("address") ? (
              <p className="sv-notice" role="alert">
                {messageFor("address")}
              </p>
            ) : null}
            {addressFields("", address)}
            <div className="sv-check">
              <input
                type="checkbox"
                id="billingSameAsShipping"
                name="billingSameAsShipping"
                defaultChecked={sameBilling}
              />
              <label htmlFor="billingSameAsShipping">
                Billing address is the same as shipping address
              </label>
            </div>
            {/* Shown only while the box is unticked (CSS :has, no script);
                the server ignores these fields when it is ticked. */}
            <fieldset className="sv-billing">
              <legend>Billing address</legend>
              {addressFields("billing_", billingValue)}
            </fieldset>
            <button className="sv-button sv-button-secondary" type="submit">
              {view.shippingAddress ? "Update address" : "Continue"}
            </button>
          </form>
        )}
      </section>

      {view.requiresShipping ? (
        <section id="shipping" aria-labelledby="shipping-heading" className="sv-checkout-step">
          <h2 id="shipping-heading">3. Shipping method</h2>
          {!view.shippingAddress ? (
            <p className="sv-muted">Add your shipping address to see shipping options.</p>
          ) : view.shippingOptions.length === 0 ? (
            <p className="sv-notice" role="status">
              We don&apos;t currently ship to this address.
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
              <PolicyNote policies={policies} />
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
