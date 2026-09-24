import "server-only";
import { getClient } from "./client";

/**
 * The billing connection (storevia_billing: BYPASSRLS, narrow grants) for the
 * provider webhook pipeline, the mock provider and the expiry sweep. Separate
 * from the system role so that the merchant dashboard's auth credentials can
 * never write billing state (M2 security review). Importer: packages/billing.
 */
export function billingDb() {
  return getClient("billing");
}
