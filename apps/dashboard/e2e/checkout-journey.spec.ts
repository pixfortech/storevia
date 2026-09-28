import { expect, test } from "@playwright/test";
import { addRate, addZone, goLive } from "./checkout-helpers";
import { createTenant } from "./helpers";
import { fetchStore, storefrontOrigin } from "./storefront-helpers";

// The whole shopper journey against the merchant's own settings (M6
// correction): an in-stock size is chosen (the sold-out one can't be added),
// a quantity beyond stock is refused, the state comes from the State list,
// the methods offered are the store's rates for that address and subtotal
// (a free-shipping threshold included), an admin edit to a rate reaches the
// checkout, and the test provider takes the payment. No real money moves.

test("variant, stock, state and the store's shipping rules, through to payment", async ({
  page,
  browser,
}) => {
  test.setTimeout(480_000);
  const tenant = await createTenant(page, "journey");

  // --- A product in two sizes: S has 3, M is sold out. ---
  await page.goto(`${tenant.storePath}/products/new`);
  await page.getByLabel("Title").fill("Linen apron");
  await page.getByLabel("Price", { exact: true }).fill("900");
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/products\/prod_[^/]+$/);
  const editor = page.url();
  await page.getByRole("button", { name: "Add options" }).click();
  await page.getByLabel("Option name").first().fill("Size");
  const values = page.getByLabel("Add a value to Size");
  await values.fill("S, M");
  await values.press("Enter");
  await page.getByRole("button", { name: "Save options" }).click();
  await expect(page.getByRole("table", { name: "Variants" }).locator("tbody tr")).toHaveCount(2, {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Set as active" }).first().click();
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
  await page.goto(`${tenant.storePath}/inventory`);
  await page.getByRole("button", { name: "Update stock for Linen apron · S" }).click();
  const stock = page.getByRole("dialog");
  await stock.getByRole("spinbutton", { name: "Change" }).fill("3");
  await stock.getByRole("button", { name: "Save" }).click();
  await expect(stock).toBeHidden();

  // --- Shipping: all of India, Standard ₹60 and free from ₹1,999. ---
  await addZone(page, tenant, "India", ["India"]);
  await addRate(page, "India", "Standard", "60");
  await page.getByRole("button", { name: "Add rate to India" }).click();
  const free = page.getByRole("dialog");
  await free.getByLabel("Rate name").fill("Free shipping");
  await free.getByLabel("Type").selectOption("PRICE_BASED");
  await free.getByLabel("Price").fill("0");
  await free.getByLabel("Minimum order subtotal").fill("1999");
  await free.getByRole("button", { name: "Add rate" }).click();
  await expect(free).toBeHidden();
  await goLive(page, tenant);
  const origin = await storefrontOrigin(page, tenant);

  const context = await browser.newContext();
  const shop = await context.newPage();
  await expect
    .poll(async () => (await fetchStore(context.request, origin, "/products/linen-apron")).status, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toBe(200);

  // --- The sold-out size can't be added; the in-stock one can, within stock. ---
  await shop.goto(`${origin}/products/linen-apron`);
  const sizes = shop.getByRole("navigation", { name: "Options" });
  await sizes.getByRole("link", { name: /^M/ }).click();
  await expect(shop.getByRole("button", { name: "Sold out" })).toBeDisabled();
  await sizes.getByRole("link", { name: /^S/ }).click();
  await expect(shop.getByRole("button", { name: "Add to cart" })).toBeEnabled();
  await shop.getByLabel("Quantity").fill("4");
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await expect(shop.getByText(/Only 3 are available/)).toBeVisible();
  // The size stays chosen after the refusal.
  await expect(shop.getByRole("button", { name: "Add to cart" })).toBeEnabled();
  await shop.getByLabel("Quantity").fill("1");
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await shop.waitForURL(/\/cart$/);
  await expect(shop.getByText("Only 3 available")).toBeVisible();

  // --- Checkout: email, a West Bengal address chosen by name. ---
  await shop.getByRole("button", { name: "Check out" }).click();
  await shop.waitForURL(/\/checkout$/);
  await shop.getByLabel("Email").fill("journey@example.test");
  await shop.getByRole("button", { name: "Continue" }).first().click();
  await expect(shop.getByRole("button", { name: "Update email" })).toBeVisible();
  const address = shop.locator("#address");
  await address.locator("#ship_firstName").fill("Govind");
  await address.locator("#ship_lastName").fill("Lohia");
  await address.locator("#ship_line1").fill("7 Park Street");
  await address.locator("#ship_city").fill("Kolkata");
  await address.locator("#ship_region").selectOption({ label: "West Bengal" });
  await address.locator("#ship_postalCode").fill("700016");
  await address.getByRole("button", { name: "Continue" }).click();
  await expect(shop.getByRole("button", { name: "Update address" })).toBeVisible();
  await expect(address.locator("#ship_region")).toHaveValue("WB");

  // ₹900: only Standard (the free rate starts at ₹1,999).
  const options = shop.locator("#shipping .sv-option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("Standard");
  await shop.getByRole("radio", { name: /Standard/ }).check();
  await shop.getByRole("button", { name: "Use this method" }).click();
  await expect(shop.locator(".sv-summary-total")).toContainText("960.00");

  // --- The merchant changes the Standard rate: checkout follows. ---
  await page.goto(`${tenant.storePath}/settings/shipping`);
  await page.getByRole("button", { name: "Edit Standard" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Price").fill("80");
  await edit.getByRole("button", { name: "Save rate" }).click();
  await expect(edit).toBeHidden();
  await shop.reload();
  await expect(options.first()).toContainText("80.00");
  await expect(shop.locator(".sv-summary-total")).toContainText("980.00");

  // --- Three in the cart (₹2,700): free shipping is offered too. ---
  await shop.goto(`${origin}/cart`);
  await shop.getByLabel("Quantity of Linen apron").fill("3");
  await shop.getByRole("button", { name: "Update" }).first().click();
  await expect(shop.locator(".sv-cart-summary")).toContainText("2,700.00");
  await shop.getByRole("button", { name: "Check out" }).click();
  await shop.waitForURL(/\/checkout/);
  await expect(options).toHaveCount(2);
  await shop.getByRole("radio", { name: /Free shipping/ }).check();
  await shop.getByRole("button", { name: /Use this method|Update shipping/ }).click();
  await expect(shop.locator(".sv-summary-totals")).toContainText("Shipping (Free shipping)");
  await expect(shop.locator(".sv-summary-total")).toContainText("2,700.00");

  // --- Payment through the test provider. ---
  const pay = shop.getByRole("button", { name: /^Pay .*2,700\.00/ });
  await expect(pay).toBeEnabled();
  await pay.click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  await expect(shop.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  await context.close();

  // The order holds the West Bengal address and the free rate.
  await page.goto(editor);
  await page.goto(`${tenant.storePath}/orders`);
  await page.getByRole("link", { name: /#1001/ }).first().click();
  await expect(page.getByText("West Bengal").first()).toBeVisible();
  await expect(page.getByText("Free shipping").first()).toBeVisible();
});
