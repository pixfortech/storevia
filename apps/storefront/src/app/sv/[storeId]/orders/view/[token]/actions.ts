"use server";

import { sendCustomerOrderMessage } from "@storevia/commerce/customer-order";
import { clientIp } from "@storevia/security";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import { isDomainError } from "@storevia/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// The shopper's message to the store about their order (post-M7). The
// token is the only key: it comes from the page's own URL (bound on the
// server), the store from the proxy's signed header, and the database binds
// the two. Next's server-action origin check makes this CSRF-safe on every
// host the store is served on. Every outcome is a redirect, so it works
// without JavaScript and never resubmits on refresh.

const path = (token: string) => `/orders/view/${encodeURIComponent(token)}`;

export async function sendOrderMessage(token: string, form: FormData): Promise<void> {
  const store = await requestStore();
  if (!isBrowsable(store)) redirect("/");
  const body = form.get("body");
  let outcome: string;
  try {
    const result = await sendCustomerOrderMessage(
      { organisationId: store.organisationId, storeId: store.storeId },
      token,
      typeof body === "string" ? body.slice(0, 20_000) : body,
      clientIp(await headers()),
    );
    // An unknown, expired or revoked link reveals nothing: back to the shop.
    outcome = result === "sent" ? "sent=1" : "";
  } catch (error) {
    if (!isDomainError(error)) throw error;
    outcome =
      error.code === "RATE_LIMITED"
        ? "error=rate"
        : error.fieldErrors?.["body"]?.startsWith("Keep")
          ? "error=long"
          : "error=empty";
  }
  if (!outcome) redirect("/");
  redirect(`${path(token)}?${outcome}#messages`);
}
