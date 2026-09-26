import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { internalHeaderKey } from "./env";
import { STORE_HEADER, verifyStoreHeader, type StoreRequestContext } from "./store-header";

/**
 * The store this request belongs to, from the proxy's signed header. When a
 * route parameter names a store, it must be the same one: the internal
 * `/sv/{storeId}` segment can't be used to reach another store.
 */
export async function requestStore(routeStoreId?: string): Promise<StoreRequestContext> {
  const store = verifyStoreHeader((await headers()).get(STORE_HEADER), internalHeaderKey());
  if (!store || (routeStoreId !== undefined && routeStoreId !== store.storeId)) notFound();
  return store;
}

/** Cart and page rendering are only for live stores (or a valid preview). */
export function isBrowsable(store: StoreRequestContext): boolean {
  return store.availability === "live" || (store.availability === "coming-soon" && store.preview);
}

export async function requestNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
