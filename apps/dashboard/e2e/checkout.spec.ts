import { expect, test, type Browser, type Page } from "@playwright/test";
import { createTenant, type Tenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Milestone 6, end to end (the roadmap's critical path): a merchant sets up
// shipping and test payments, goes live; a shopper buys through the real
// checkout and the Test Payment Provider's signed events; the order appears
// in the dashboard, where it is fulfilled and partly refunded. No real money
// moves: the test provider is on only because TEST_PAYMENTS_ENABLED=true in
// this production build, in a test environment.

async function setUpStore(page: Page, tenant: Tenant) {
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
  await expect(page.getByText("Standard")).toBeVisible();

  await page.goto(`${tenant.storePath}/settings/payments`);
  await page.getByRole("button", { name: "Connect test payments" }).click();
  await expect(page.getByText(/Test mode/).first()).toBeVisible();
  await expect(page.getByLabel(/Webhook URL/).first()).toHaveValue(
    /\/api\/webhooks\/payments\/payconn_/,
  );

  await page.goto(`${tenant.storePath}/settings`);
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();
}

async function shopperWithCart(browser: Browser, origin: string, quantity: string) {
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

async function fillDetails(shop: Page, email: string) {
  await shop.getByLabel("Email").fill(email);
  await shop.getByRole("button", { name: "Continue" }).first().click();
  await expect(shop.getByLabel("Email")).toHaveValue(email);
  const address = shop.locator("#address");
  await address.getByLabel("First name").first().fill("Asha");
  await address.getByLabel("Last name").first().fill("Rao");
  await address.getByLabel("Address", { exact: true }).first().fill("12 MG Road");
  await address.getByLabel("City").first().fill("Bengaluru");
  await address.getByLabel("Postal code").first().fill("560001");
  await address.getByRole("button", { name: "Continue" }).click();
  await shop.getByRole("radio", { name: /Standard/ }).check();
  await shop.getByRole("button", { name: "Use this method" }).click();
}

test("the critical path: set up, check out with the test provider, fulfil and refund", async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  const tenant = await createTenant(page, "checkout");
  await addProduct(page, tenant, "Stoneware mug", "999.50", "3");
  await setUpStore(page, tenant);
  const origin = await storefrontOrigin(page, tenant);

  // --- A declined payment: nothing charged, the shopper can try again. ---
  const first = await shopperWithCart(browser, origin, "1");
  await fillDetails(first.shop, "declined@example.test");
  await first.shop.getByRole("button", { name: /^Pay / }).click();
  await first.shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  await expect(first.shop.getByText("Test mode · no real money moves")).toBeVisible();
  await first.shop.getByRole("button", { name: "Decline the payment" }).click();
  await first.shop.waitForURL(/\/checkout(#payment)?$/);
  await expect(first.shop.getByText(/Your payment didn't go through/)).toBeVisible();
  await first.context.close();

  // --- The happy path. ---
  const { context, shop } = await shopperWithCart(browser, origin, "2");
  // Totals come from the server: 2 × 999.50 + 50.00 shipping.
  await fillDetails(shop, "buyer@example.test");
  await expect(shop.locator(".sv-summary-total")).toContainText("2,049.00");
  const cookie = (await context.cookies(origin)).find((c) => c.name === "sv_checkout");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");

  await shop.getByRole("button", { name: /^Pay .*2,049\.00/ }).click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  const paymentPage = shop.url();
  await expect(shop.getByRole("heading", { name: /Pay .*2,049\.00/ })).toBeVisible();

  // Someone else's browser can't see or settle this payment.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  const foreign = await strangerPage.goto(paymentPage);
  expect(foreign?.status()).toBe(404);
  // …and arriving on the return page proves nothing.
  await strangerPage.goto(`${origin}/checkout/return?razorpay_payment_link_status=paid`);
  await strangerPage.waitForURL(/\/cart$/);
  await stranger.close();

  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  await expect(shop.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  await expect(shop.getByText("#1001")).toBeVisible();
  await expect(shop.getByText("buyer@example.test")).toBeVisible();
  // The cart was used up by the order.
  await shop.goto(`${origin}/cart`);
  await expect(shop.getByText("Your cart is empty.")).toBeVisible();
  await context.close();

  // --- The merchant sees the order, fulfils it and refunds part of it. ---
  await page.goto(`${tenant.storePath}/orders`);
  const row = page.getByRole("link", { name: /#1001/ }).first();
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(/\/orders\/order_/);
  await expect(page.getByRole("heading", { name: /#1001/ })).toBeVisible();
  await expect(page.getByText("buyer@example.test").first()).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Fulfil items" }).click();
  const fulfil = page.getByRole("dialog");
  await fulfil.getByRole("button", { name: "Fulfil 2 items" }).click();
  await expect(fulfil).toBeHidden();
  await expect(page.getByText("Fulfilled", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Refund" }).first().click();
  const refund = page.getByRole("dialog");
  await refund.getByLabel(/^Amount/).fill("100");
  await refund.getByLabel("Reason").fill("Chipped handle");
  await refund.getByRole("button", { name: /^Refund INR 100/ }).click();
  await expect(refund).toBeHidden();
  await expect(page.getByText("Partially refunded", { exact: true }).first()).toBeVisible();

  // The customer exists once, with the order.
  await page.goto(`${tenant.storePath}/customers`);
  await expect(page.getByText("buyer@example.test").first()).toBeVisible();
});
