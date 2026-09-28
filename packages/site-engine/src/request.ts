import "server-only";
import { bindLogContext } from "@storevia/observability";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { STORE_HEADER, verifyStoreHeader, type StoreRequestContext } from "./context";
import { internalHeaderKey } from "./env";

/**
 * The store this request belongs to, from the proxy's signed header. When a
 * route parameter names a store, it must be the same one: the internal
 * `/sv/{storeId}` segment can't be used to reach another store.
 */
export async function requestStore(routeStoreId?: string): Promise<StoreRequestContext> {
  const h = await headers();
  const store = verifyStoreHeader(h.get(STORE_HEADER), internalHeaderKey());
  if (!store || (routeStoreId !== undefined && routeStoreId !== store.storeId)) notFound();
  // Everything logged for the rest of this request (checkout, cart, order
  // messages) carries the proxy's request id and the store (M8).
  const requestId = h.get("x-request-id");
  bindLogContext({ ...(requestId ? { requestId } : {}), storeId: store.storeId });
  return store;
}

/** Cart and page rendering are only for live stores (or a valid preview). */
export function isBrowsable(store: StoreRequestContext): boolean {
  return store.availability === "live" || (store.availability === "coming-soon" && store.preview);
}

export async function requestNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
