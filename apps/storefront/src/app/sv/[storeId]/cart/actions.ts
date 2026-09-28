"use server";

import {
  addToCart,
  CartQuantityError,
  removeCartLine,
  updateCartLine,
} from "@storevia/commerce/storefront";
import { clientIp } from "@storevia/security";
import { isDomainError } from "@storevia/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cartStore, cartToken, setCartToken } from "@/lib/cart";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import { routeHandle } from "@/lib/route-data";

// Cart mutations (ADR-0028 §8). The store comes from the proxy's signed
// header, never the form; the form carries only a variant id and a quantity,
// which the cart service re-validates against this store. Every outcome is a
// redirect (works without JavaScript; no resubmission on refresh).

type Outcome = "sold-out" | "stock" | "limit" | "quantity" | "unavailable" | "busy" | "full";

/**
 * Where a refused change sends the shopper back to, as query parameters
 * (fixed codes and a small number only, never text from the request).
 */
function outcome(error: unknown): { readonly code: Outcome; readonly n: number | null } {
  if (!isDomainError(error)) throw error;
  if (error instanceof CartQuantityError) {
    const code =
      error.reason === "stock" ? "stock" : error.reason === "limit" ? "limit" : "sold-out";
    return { code, n: error.available };
  }
  if (error.code === "RATE_LIMITED") return { code: "busy", n: null };
  if (error.code === "VALIDATION_FAILED") return { code: "quantity", n: null };
  if (error.code === "CONFLICT") return { code: "full", n: null };
  return { code: "unavailable", n: null };
}

const query = (params: Record<string, string | number | null>) =>
  new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === null ? [] : [[k, String(v)]])),
  ).toString();

async function context() {
  const store = await requestStore();
  if (!isBrowsable(store)) redirect("/");
  return {
    store: cartStore(store),
    token: await cartToken(),
    clientIp: clientIp(await headers()),
  };
}

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, 100) : null;
};

export async function addToCartAction(form: FormData): Promise<void> {
  const ctx = await context();
  const handle = routeHandle(field(form, "product") ?? "");
  const variantId = field(form, "variantId");
  let failed: ReturnType<typeof outcome> | null = null;
  try {
    const result = await addToCart(ctx, { variantId, quantity: field(form, "quantity") });
    if (result.newToken) await setCartToken(result.newToken);
  } catch (error) {
    failed = outcome(error);
  }
  if (failed) {
    const params = query({ cart: failed.code, n: failed.n, variant: variantId });
    redirect(
      handle
        ? `/products/${handle}?${params}`
        : `/cart?${query({ error: failed.code, n: failed.n })}`,
    );
  }
  redirect("/cart");
}

export async function updateCartLineAction(form: FormData): Promise<void> {
  const ctx = await context();
  const variantId = field(form, "variantId");
  let failed: ReturnType<typeof outcome> | null = null;
  try {
    await updateCartLine(ctx, { variantId, quantity: field(form, "quantity") });
  } catch (error) {
    failed = outcome(error);
  }
  redirect(
    failed ? `/cart?${query({ error: failed.code, n: failed.n, line: variantId })}` : "/cart",
  );
}

export async function removeCartLineAction(form: FormData): Promise<void> {
  const ctx = await context();
  let failed: ReturnType<typeof outcome> | null = null;
  try {
    await removeCartLine(ctx, { variantId: field(form, "variantId") });
  } catch (error) {
    failed = outcome(error);
  }
  redirect(failed ? `/cart?${query({ error: failed.code })}` : "/cart");
}
