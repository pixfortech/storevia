import "server-only";
import { onEntitlementsChanged } from "@storevia/billing";
import { createLogger } from "@storevia/observability";
import { toTypeId } from "@storevia/types";
import { revalidatePath } from "next/cache";

const log = createLogger({ app: "dashboard", component: "entitlements" });
let registered = false;

/** Per-process entitlement change hook (ADR-0022 §9); see platform-admin. */
export function registerEntitlementListeners(): void {
  if (registered) return;
  registered = true;
  onEntitlementsChanged((organisationId) => {
    log.info("entitlements changed", { organisationId });
    revalidatePath(`/o/${toTypeId("organisation", organisationId)}/billing`);
  });
}
