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
import {
  getSellerProfile,
  listPolicies,
  POLICY_DEFINITIONS,
  publishPolicy,
  savePolicyDraft,
  sellerProfileGaps,
  updateSellerProfile,
} from "@storevia/commerce";
import { plainTextToRichText } from "@storevia/commerce/rich-text";
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
  // Seller details and policies (Phase 2A). Seeded stores are local fixtures:
  // their policy text says so and is never meant as legal text.
  if (sellerProfileGaps(await getSellerProfile(ctx)).length > 0) {
    await updateSellerProfile(ctx, {
      legalName: `${store.name} (sample seller)`,
      phone: "+91 80 4000 1234",
      addressLine1: "12 Sample Street",
      city: "Bengaluru",
      region: "KA",
      postalCode: "560001",
      countryCode: "IN",
    });
  }
  for (const policy of await listPolicies(ctx)) {
    if (policy.status !== "empty") continue;
    const definition = POLICY_DEFINITIONS.find((d) => d.kind === policy.kind);
    const { revision } = await savePolicyDraft(ctx, policy.kind, {
      title: definition?.defaultTitle,
      body: plainTextToRichText(
        "Sample text for a local development store. It is not a real policy and not legal advice.",
      ),
      revision: 0,
    });
    await publishPolicy(ctx, policy.kind, { revision });
  }
  if ((await getOnlineStore(ctx)).status !== "ACTIVE") {
    await setStorefrontLive(ctx, true, storeLaunchChecks(ctx.storeId));
  }
}
