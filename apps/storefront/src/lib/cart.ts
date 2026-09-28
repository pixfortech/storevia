import "server-only";
import {
  cartCookieName,
  CART_LIMITS,
  readCart,
  type CartStore,
  type CartView,
} from "@storevia/commerce/storefront";
import { cookies } from "next/headers";
import { cache } from "react";
import { isSecure } from "@storevia/site-engine/env";
import type { StoreRequestContext } from "@storevia/site-engine/context";

// The cart cookie (06-storefront.md §6, ADR-0028 §8): host-only (no Domain
// attribute), HttpOnly, SameSite=Lax, Secure with the __Host- prefix over
// HTTPS. The value is an opaque token; the database stores only its hash.

export const cartStore = (store: StoreRequestContext): CartStore => ({
  organisationId: store.organisationId,
  storeId: store.storeId,
  currency: store.currency,
});

export async function cartToken(): Promise<string | null> {
  return (await cookies()).get(cartCookieName(isSecure()))?.value ?? null;
}

export async function setCartToken(token: string): Promise<void> {
  (await cookies()).set(cartCookieName(isSecure()), token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: CART_LIMITS.ttlDays * 24 * 60 * 60,
  });
}

// One cart read per request (M8 load test): the layout's badge and the cart
// page share it instead of reading the cart twice. Keyed on plain values so
// React's per-request cache matches; a server action's re-render is a new
// request and reads again.
const readRequestCart = cache(
  (organisationId: string, storeId: string, currency: string, token: string): Promise<CartView> =>
    readCart({ organisationId, storeId, currency }, token),
);

/** This request's cart (empty without a cookie, and then no query). */
export async function requestCart(store: StoreRequestContext): Promise<CartView> {
  const token = await cartToken();
  return token
    ? readRequestCart(store.organisationId, store.storeId, store.currency, token)
    : readCart(cartStore(store), null);
}

/** The header badge count; no query without a cookie. */
export async function headerCartCount(store: StoreRequestContext): Promise<number> {
  const token = await cartToken();
  return token
    ? (await readRequestCart(store.organisationId, store.storeId, store.currency, token)).itemCount
    : 0;
}
