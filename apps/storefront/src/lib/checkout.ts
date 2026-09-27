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
import { randomBytes } from "node:crypto";
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
  /** Matches the `f` query of the redirect that shows it (see readFlash). */
  readonly id: string;
  readonly step: CheckoutStep;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly values?: Readonly<Record<string, string>>;
}

const flashName = () => (isSecure() ? "__Host-sv_checkout_flash" : "sv_checkout_flash");

const flashCookie = (maxAge: number) =>
  ({ httpOnly: true, secure: isSecure(), sameSite: "lax", path: "/", maxAge }) as const;

/** Stores a step's outcome; returns the id the redirect must carry for it to show. */
export async function setFlash(flash: Omit<Flash, "id">): Promise<string> {
  const id = randomBytes(9).toString("base64url");
  const value = Buffer.from(JSON.stringify({ ...flash, id })).toString("base64url");
  // Cookies hold ~4 KB; a flash that big is dropped rather than truncated.
  if (value.length <= 3500) (await cookies()).set(flashName(), value, flashCookie(60));
  return id;
}

/**
 * Removes the flash. The deletion repeats the cookie's attributes: a browser
 * ignores a `__Host-` cookie set without Secure, so a bare delete() would
 * leave the last error showing after a successful step.
 */
export async function clearFlash(): Promise<void> {
  (await cookies()).set(flashName(), "", flashCookie(0));
}

/**
 * The flash for this render, only when the URL names it: a redirect after a
 * successful step carries no id, so an earlier step's errors can't reappear
 * even if the cookie outlived its step.
 */
export async function readFlash(id: string | undefined): Promise<Flash | null> {
  if (!id) return null;
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
              .slice(0, 40)
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
    if (value.id !== id) return null;
    const message = text(value.message);
    const fieldErrors = record(value.fieldErrors);
    const values = record(value.values);
    return {
      id,
      step: value.step,
      ...(message ? { message } : {}),
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(values ? { values } : {}),
    };
  } catch {
    return null;
  }
}
