"use server";

import { addToCart, removeCartLine, updateCartLine } from "@storevia/commerce/storefront";
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

type Outcome = "sold-out" | "unavailable" | "busy" | "full";

function outcome(error: unknown): Outcome {
  if (!isDomainError(error)) throw error;
  if (error.code === "RATE_LIMITED") return "busy";
  if (error.code === "CONFLICT") return error.message.includes("sold out") ? "sold-out" : "full";
  return "unavailable";
}

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
  let failed: Outcome | null = null;
  try {
    const result = await addToCart(ctx, {
      variantId: field(form, "variantId"),
      quantity: field(form, "quantity"),
    });
    if (result.newToken) await setCartToken(result.newToken);
  } catch (error) {
    failed = outcome(error);
  }
  if (failed) redirect(handle ? `/products/${handle}?cart=${failed}` : `/cart?error=${failed}`);
  redirect("/cart");
}

export async function updateCartLineAction(form: FormData): Promise<void> {
  const ctx = await context();
  let failed: Outcome | null = null;
  try {
    await updateCartLine(ctx, {
      variantId: field(form, "variantId"),
      quantity: field(form, "quantity"),
    });
  } catch (error) {
    failed = outcome(error);
  }
  redirect(failed ? `/cart?error=${failed}` : "/cart");
}

export async function removeCartLineAction(form: FormData): Promise<void> {
  const ctx = await context();
  let failed: Outcome | null = null;
  try {
    await removeCartLine(ctx, { variantId: field(form, "variantId") });
  } catch (error) {
    failed = outcome(error);
  }
  redirect(failed ? `/cart?error=${failed}` : "/cart");
}
