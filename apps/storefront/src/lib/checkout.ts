import "server-only";
import {
  checkoutCookieName,
  type CheckoutRequest,
  type CheckoutStore,
} from "@storevia/commerce/checkout";
import { storefrontOrigin } from "@storevia/domains";
import { clientIp } from "@storevia/security";
import type { StoreRequestContext } from "@storevia/site-engine/context";
import { isSecure } from "@storevia/site-engine/env";
import { cookies, headers } from "next/headers";

// Checkout plumbing for the storefront (ADR-0031 §1). The checkout token
// lives in a host-only cookie (HttpOnly, SameSite=Lax so the provider's
// top-level redirect back still carries it, Secure with the __Host- prefix
// over HTTPS). The store always comes from the proxy's signed header.
//
// Forms work without JavaScript: every action redirects. What a failed step
// needs to show again (field errors and the values typed) travels in a
// short-lived host-only "flash" cookie, never in the URL.

const TOKEN_MAX_AGE = 24 * 60 * 60;

export const checkoutStore = (store: StoreRequestContext): CheckoutStore => ({
  organisationId: store.organisationId,
  storeId: store.storeId,
  currency: store.currency,
  name: store.name,
});

export async function checkoutToken(): Promise<string | null> {
  return (await cookies()).get(checkoutCookieName(isSecure()))?.value ?? null;
}

export async function setCheckoutToken(token: string): Promise<void> {
  (await cookies()).set(checkoutCookieName(isSecure()), token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });
}

export async function checkoutRequest(store: StoreRequestContext): Promise<CheckoutRequest> {
  return {
    store: checkoutStore(store),
    token: await checkoutToken(),
    clientIp: clientIp(await headers()),
  };
}

/** Where the provider sends the shopper back: this store, on the host they are using. */
export const returnUrl = (store: StoreRequestContext) =>
  `${storefrontOrigin(store.hostname)}/checkout/return`;

// ---------------------------------------------------------------------------
// Flash: one step's outcome for the next render
// ---------------------------------------------------------------------------

export type CheckoutStep = "contact" | "address" | "shipping" | "discount" | "payment";

export interface Flash {
  readonly step: CheckoutStep;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly values?: Readonly<Record<string, string>>;
}

const flashName = () => (isSecure() ? "__Host-sv_checkout_flash" : "sv_checkout_flash");

export async function setFlash(flash: Flash): Promise<void> {
  const value = Buffer.from(JSON.stringify(flash)).toString("base64url");
  // Cookies hold ~4 KB; a flash that big is dropped rather than truncated.
  if (value.length > 3500) return;
  (await cookies()).set(flashName(), value, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 60,
  });
}

export async function clearFlash(): Promise<void> {
  (await cookies()).delete(flashName());
}

export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(flashName())?.value;
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString()) as Partial<Flash>;
    const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : undefined);
    const record = (v: unknown) =>
      typeof v === "object" && v !== null
        ? Object.fromEntries(
            Object.entries(v)
              .filter((e): e is [string, string] => typeof e[1] === "string")
              .slice(0, 30)
              .map(([k, s]) => [k.slice(0, 40), s.slice(0, 300)]),
          )
        : undefined;
    if (
      value.step !== "contact" &&
      value.step !== "address" &&
      value.step !== "shipping" &&
      value.step !== "discount" &&
      value.step !== "payment"
    ) {
      return null;
    }
    const message = text(value.message);
    const fieldErrors = record(value.fieldErrors);
    const values = record(value.values);
    return {
      step: value.step,
      ...(message ? { message } : {}),
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(values ? { values } : {}),
    };
  } catch {
    return null;
  }
}
