import { expect, type Page } from "@playwright/test";
import type { Tenant } from "./helpers";

// Seller details and store policies through the dashboard (final pass,
// Phase 2A): going live needs both, so every spec that takes a store live
// fills them the way a merchant does.

export interface SellerDetails {
  readonly legalName: string;
  readonly phone: string;
  readonly addressLine1: string;
  readonly city: string;
  /** A state of India, by name. */
  readonly state: string;
  readonly pin: string;
}

export const SAMPLE_SELLER: SellerDetails = {
  legalName: "Shop Example Private Limited",
  phone: "+91 80 4000 1234",
  addressLine1: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pin: "560001",
};

/** The policies a store that ships products must publish to go live. */
export const REQUIRED_POLICIES = ["refunds", "privacy", "terms", "shipping"] as const;

/** Fills Settings → General → Seller details for an Indian business. */
export async function fillSellerDetails(
  page: Page,
  tenant: Tenant,
  seller: SellerDetails = SAMPLE_SELLER,
) {
  await page.goto(`${tenant.storePath}/settings`);
  const form = page.locator("#seller");
  await form.getByLabel("Legal or business name").fill(seller.legalName);
  await form.getByLabel("Phone").fill(seller.phone);
  await form.getByLabel("Address line 1").fill(seller.addressLine1);
  await form.getByLabel("City").fill(seller.city);
  await form.getByLabel("Country").selectOption("IN");
  await form.getByLabel("State", { exact: true }).selectOption({ label: seller.state });
  await form.getByLabel("PIN code").fill(seller.pin);
  await form.getByRole("button", { name: "Save seller details" }).click();
  await expect(form.getByText("Seller details saved.")).toBeVisible();
}

/**
 * Writes a policy in the merchant's own words and publishes it from
 * Settings → Policies (skipped when it's already published).
 */
export async function writeAndPublishPolicy(
  page: Page,
  tenant: Tenant,
  handle: string,
  text = `This is the ${handle} policy of this store, written by its owner for shoppers.`,
) {
  await page.goto(`${tenant.storePath}/settings/policies/${handle}`);
  if ((await page.getByTestId("policy-status").textContent())?.trim() === "Published") return;
  const editor = page.getByRole("textbox", { name: "Policy text" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await editor.pressSequentially(text);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published. Shoppers can read it on your store.")).toBeVisible();
  await expect(page.getByTestId("policy-status")).toHaveText("Published");
}

/** Seller details and every required policy: what Phase 2A's launch checks add. */
export async function completeStoreIdentity(page: Page, tenant: Tenant) {
  await fillSellerDetails(page, tenant);
  for (const handle of REQUIRED_POLICIES) await writeAndPublishPolicy(page, tenant, handle);
}
