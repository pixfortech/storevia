import "server-only";
import { requireStoreAccess, type StoreContext } from "@storevia/tenancy";
import { requireActionPrincipal } from "./auth";
import { requestInfo } from "./request";

/**
 * The store context for a server action. `storeId` arrives from the client
 * (a bound argument) and is re-verified against the session's memberships on
 * every call: a crafted id yields NOT_FOUND, never another tenant's store.
 */
export async function storeActionContext(storeId: string): Promise<StoreContext> {
  return requireStoreAccess(await requireActionPrincipal(), storeId, await requestInfo());
}
