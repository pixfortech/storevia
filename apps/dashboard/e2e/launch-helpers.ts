import { expect, type Page } from "@playwright/test";
import { addRate, addZone } from "./checkout-helpers";
import type { Tenant } from "./helpers";
import { completeStoreIdentity } from "./identity-helpers";

// Going live needs a complete store (final pass, DB-1): a support or contact
// email, seller details and the required policies (Phase 2A), a payment
// connection, and shipping when products need it. Specs
// about other things make their store launch-ready through the dashboard
// here, then go live the way a merchant does.

/** Sets a support email from Settings → General. */
export async function setSupportEmail(page: Page, tenant: Tenant, email = "help@shop.example") {
  await page.goto(`${tenant.storePath}/settings`);
  await page.getByLabel("Support email").fill(email);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
}

/** Connects test payments from Settings → Payments, unless a connection is already on. */
export async function connectTestPayments(page: Page, tenant: Tenant) {
  await page.goto(`${tenant.storePath}/settings/payments`);
  const connect = page.getByRole("button", { name: "Connect test payments" });
  if ((await connect.count()) === 0) return;
  await connect.click();
  await expect(page.getByText("Test mode: no real money moves.")).toBeVisible();
}

/** Everything the launch checks need, for a store whose products ship to India. */
export async function prepareToGoLive(page: Page, tenant: Tenant) {
  await setSupportEmail(page, tenant);
  await completeStoreIdentity(page, tenant);
  await connectTestPayments(page, tenant);
  await page.goto(`${tenant.storePath}/settings/shipping`);
  if ((await page.getByRole("button", { name: "Add rate to India" }).count()) === 0) {
    await addZone(page, tenant, "India", ["India"]);
    await addRate(page, "India", "Standard", "50");
  }
}

/** Prepares the store, then goes live from Settings. */
export async function goLiveReady(page: Page, tenant: Tenant) {
  await prepareToGoLive(page, tenant);
  await page.goto(`${tenant.storePath}/settings`);
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();
}
