import { expect, type Browser, type Page } from "@playwright/test";
import type { Tenant } from "./helpers";
import { fetchStore } from "./storefront-helpers";

// Shared by the Milestone 6 checkout specs: a store set up through the
// dashboard (shipping to India, test payments, live), and a shopper who
// fills a cart and the checkout steps.

export async function setUpStore(page: Page, tenant: Tenant) {
  await page.goto(`${tenant.storePath}/settings/shipping`);
  await page.getByRole("button", { name: "Add zone" }).first().click();
  const zone = page.getByRole("dialog");
  await zone.getByLabel("Zone name").fill("India");
  await zone.getByLabel("Countries").fill("IN");
  await zone.getByRole("button", { name: "Add zone" }).click();
  await expect(zone).toBeHidden();
  await page.getByRole("button", { name: "Add rate to India" }).click();
  const rate = page.getByRole("dialog");
  await rate.getByLabel("Rate name").fill("Standard");
  await rate.getByLabel("Price").fill("50");
  await rate.getByRole("button", { name: "Add rate" }).click();
  await expect(rate).toBeHidden();
  await expect(page.getByRole("button", { name: "Edit Standard" })).toBeVisible();

  await page.goto(`${tenant.storePath}/settings/payments`);
  await page.getByRole("button", { name: "Connect test payments" }).click();
  await expect(page.getByText(/Test mode/).first()).toBeVisible();
  await expect(page.getByText("Test mode: no real money moves.")).toBeVisible();

  await page.goto(`${tenant.storePath}/settings`);
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();
}

export async function shopperWithCart(browser: Browser, origin: string, quantity: string) {
  const context = await browser.newContext();
  const shop = await context.newPage();
  await expect
    .poll(
      async () => (await fetchStore(context.request, origin, "/products/stoneware-mug")).status,
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(200);
  await shop.goto(`${origin}/products/stoneware-mug`);
  await shop.getByLabel("Quantity").fill(quantity);
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await shop.waitForURL(/\/cart$/);
  await shop.getByRole("button", { name: "Check out" }).click();
  await shop.waitForURL(/\/checkout$/);
  return { context, shop };
}

export async function fillDetails(shop: Page, email: string) {
  await shop.getByLabel("Email").fill(email);
  await shop.getByRole("button", { name: "Continue" }).first().click();
  // Each step redirects back and re-renders: its button changes once saved.
  // Wait for that before typing into the next form.
  await expect(shop.getByRole("button", { name: "Update email" })).toBeVisible();
  await expect(shop.getByLabel("Email")).toHaveValue(email);
  const address = shop.locator("#address");
  await address.getByLabel("First name").first().fill("Asha");
  await address.getByLabel("Last name").first().fill("Rao");
  await address.getByLabel("Address", { exact: true }).first().fill("12 MG Road");
  await address.getByLabel("City").first().fill("Bengaluru");
  await address.getByLabel("Postal code").first().fill("560001");
  await address.getByRole("button", { name: "Continue" }).click();
  await expect(shop.getByRole("button", { name: "Update address" })).toBeVisible();
  await shop.getByRole("radio", { name: /Standard/ }).check();
  await shop.getByRole("button", { name: "Use this method" }).click();
  await expect(shop.getByRole("button", { name: "Update shipping" })).toBeVisible();
  await expect(shop.getByRole("button", { name: /^Pay / })).toBeEnabled();
}
