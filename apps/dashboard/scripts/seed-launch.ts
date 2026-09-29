// Seeded stores go live the way a merchant does (final pass, DB-1): through
// the launch checks, after the store has a way to be reached. Called once a
// store has products, shipping and payments.
import {
  getOnlineStore,
  getStore,
  setStorefrontLive,
  updateStore,
  type StoreContext,
} from "@storevia/tenancy";
import { storeLaunchChecks } from "../src/lib/launch-readiness";

export async function ensureStoreLive(ctx: StoreContext, supportEmail: string): Promise<void> {
  const store = await getStore(ctx);
  if (!store.supportEmail && !store.contactEmail) {
    await updateStore(ctx, {
      name: store.name,
      locale: store.locale,
      timezone: store.timezone,
      contactEmail: "",
      supportEmail,
    });
  }
  if ((await getOnlineStore(ctx)).status !== "ACTIVE") {
    await setStorefrontLive(ctx, true, storeLaunchChecks(ctx.storeId));
  }
}
