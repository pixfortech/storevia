"use server";

import {
  applyDiscountCode,
  beginPayment,
  cancelPayment,
  confirmPayment,
  removeDiscountCode,
  selectShippingRate,
  simulateTestPayment,
  startCheckout,
  updateAddress,
  updateContact,
  type TestOutcome,
} from "@storevia/commerce/checkout";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import { isDomainError } from "@storevia/types";
import { redirect } from "next/navigation";
import { cartToken } from "@/lib/cart";
import {
  checkoutRequest,
  clearFlash,
  returnUrl,
  setCheckoutToken,
  setFlash,
  type CheckoutStep,
} from "@/lib/checkout";

// Checkout steps (ADR-0031 §1). The store comes from the proxy's signed
// header; forms carry only what the shopper typed or chose, which the
// checkout service validates and re-prices on the server. Every outcome is a
// redirect (works without JavaScript; no resubmission on refresh). Steps
// redirect to a query, not a #fragment: the client router treats a
// fragment-only change as a scroll and wouldn't show the re-priced page. Next's
// server-action origin check compares Origin with the request's own host, so
// it holds on every custom domain without an allow-list.

async function store() {
  const s = await requestStore();
  if (!isBrowsable(s)) redirect("/");
  return s;
}

const field = (form: FormData, name: string, max = 300) => {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : null;
};

const SECRET_FIELDS = /token|hash|\$/i;

function typed(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !SECRET_FIELDS.test(key)) values[key] = value.slice(0, 300);
  }
  return values;
}

/**
 * Runs a step; expected failures come back as a flash for the next render.
 * Only the redirect after a failure names the flash (`f`), so a successful
 * step never shows an earlier step's errors.
 */
async function step(name: CheckoutStep, form: FormData, fn: () => Promise<unknown>): Promise<void> {
  let flash: string | null = null;
  try {
    await fn();
    await clearFlash();
  } catch (error) {
    if (!isDomainError(error)) throw error;
    if (error.code === "NOT_FOUND") redirect("/cart?error=checkout");
    flash = await setFlash({
      step: name,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : { message: error.message }),
      values: typed(form),
    });
  }
  redirect(`/checkout?step=${name}${flash ? `&f=${flash}` : ""}`);
}

export async function startCheckoutAction(): Promise<void> {
  const s = await store();
  const req = await checkoutRequest(s);
  let failed = false;
  try {
    const { token } = await startCheckout({ ...req, cartToken: await cartToken() });
    await setCheckoutToken(token);
    await clearFlash();
  } catch (error) {
    if (!isDomainError(error)) throw error;
    failed = true;
  }
  redirect(failed ? "/cart?error=checkout" : "/checkout");
}

export async function contactAction(form: FormData): Promise<void> {
  const req = await checkoutRequest(await store());
  await step("contact", form, () => updateContact(req, { email: field(form, "email", 320) }));
}

export async function addressAction(form: FormData): Promise<void> {
  const req = await checkoutRequest(await store());
  const input: Record<string, string | null> = {};
  for (const name of [
    "firstName",
    "lastName",
    "company",
    "line1",
    "line2",
    "city",
    "region",
    "regionCountry",
    "postalCode",
    "countryCode",
    "phone",
  ]) {
    input[name] = field(form, name);
    input[`billing_${name}`] = field(form, `billing_${name}`);
  }
  input["billingSameAsShipping"] = form.get("billingSameAsShipping") === "on" ? "on" : "off";
  await step("address", form, () => updateAddress(req, input));
}

export async function shippingAction(form: FormData): Promise<void> {
  const req = await checkoutRequest(await store());
  await step("shipping", form, () => selectShippingRate(req, { rateId: field(form, "rateId") }));
}

export async function discountAction(form: FormData): Promise<void> {
  const req = await checkoutRequest(await store());
  await step("discount", form, () => applyDiscountCode(req, { code: field(form, "code", 64) }));
}

export async function removeDiscountAction(form: FormData): Promise<void> {
  const req = await checkoutRequest(await store());
  await step("discount", form, () => removeDiscountCode(req));
}

export async function payAction(form: FormData): Promise<void> {
  const s = await store();
  const req = await checkoutRequest(s);
  let target: string;
  try {
    const result = await beginPayment(req, {
      pricingHash: field(form, "pricingHash", 64),
      returnUrl: returnUrl(s),
    });
    await clearFlash();
    if (result.kind === "redirect") target = result.url;
    else if (result.kind === "completed") target = "/checkout/complete";
    else if (result.kind === "processing") target = "/checkout?step=payment";
    else target = `/checkout?changed=${result.change}`;
  } catch (error) {
    if (!isDomainError(error)) throw error;
    if (error.code === "NOT_FOUND") redirect("/cart?error=checkout");
    target = `/checkout?step=payment&f=${await setFlash({ step: "payment", message: error.message })}`;
  }
  // The provider's hosted page is the only external target, and it came from the provider adapter.
  redirect(target);
}

export async function cancelPaymentAction(form: FormData): Promise<void> {
  const req = await checkoutRequest(await store());
  await step("payment", form, () => cancelPayment(req));
}

export async function checkPaymentAction(): Promise<void> {
  const req = await checkoutRequest(await store());
  const view = await confirmPayment(req);
  redirect(view?.stage === "completed" ? "/checkout/complete" : "/checkout?step=payment");
}

const OUTCOMES: Readonly<Record<string, TestOutcome>> = {
  pay: "captured",
  decline: "failed",
  cancel: "cancelled",
};

/** The test provider's hosted page: the shopper picks an outcome (development and test only). */
export async function testPaymentAction(form: FormData): Promise<void> {
  const req = await checkoutRequest(await store());
  const ref = field(form, "ref", 80) ?? "";
  const outcome = OUTCOMES[field(form, "outcome", 10) ?? ""];
  if (outcome) {
    try {
      await simulateTestPayment(req, ref, outcome);
    } catch (error) {
      if (!isDomainError(error)) throw error;
    }
  }
  redirect("/checkout/return");
}
