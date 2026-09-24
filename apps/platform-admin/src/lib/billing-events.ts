import "server-only";
import { onEntitlementsChanged } from "@storevia/billing";
import { createLogger } from "@storevia/observability";
import { toTypeId } from "@storevia/types";
import { revalidatePath } from "next/cache";

const log = createLogger({ app: "platform-admin", component: "entitlements" });
let registered = false;

/**
 * Entitlement change hook for this process (ADR-0022 §9). Listeners are
 * per-process: other apps see changes on their next request because nothing
 * caches entitlements across requests.
 */
export function registerEntitlementListeners(): void {
  if (registered) return;
  registered = true;
  onEntitlementsChanged((organisationId) => {
    log.info("entitlements changed", { organisationId });
    revalidatePath(`/organisations/${toTypeId("organisation", organisationId)}`);
  });
}
