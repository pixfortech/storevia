import "server-only";
import {
  cartCookieName,
  CART_LIMITS,
  cartItemCount,
  type CartStore,
} from "@storevia/commerce/storefront";
import { cookies } from "next/headers";
import { isSecure } from "./env";
import type { StoreRequestContext } from "./store-header";

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

/** The header badge count; no query without a cookie. */
export async function headerCartCount(store: StoreRequestContext): Promise<number> {
  const token = await cartToken();
  return token ? cartItemCount(cartStore(store), token) : 0;
}
