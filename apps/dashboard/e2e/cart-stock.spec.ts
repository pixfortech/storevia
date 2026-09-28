import { expect, test, type Page } from "@playwright/test";
import { setUpStore, shopperWithCart } from "./checkout-helpers";
import { createTenant, type Tenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Cart quantities against stock in a real browser (M6 correction): the
// product page and the cart refuse more than stock can supply (with how
// many can be had) and more than a line may hold, never clamping; a line
// that sells out after it was added is marked, left out of the subtotal and
// blocks checkout until it is removed.

async function changeStock(page: Page, tenant: Tenant, title: string, delta: string) {
  await page.goto(`${tenant.storePath}/inventory`);
  await page.getByRole("button", { name: `Update stock for ${title}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Change" }).fill(delta);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test("quantities beyond stock are refused, and a sold-out line blocks checkout", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "cart-stock");
  await addProduct(page, tenant, "Enamel saucepan", "1450", "2");
  await addProduct(page, tenant, "Stoneware mug", "450", "30");
  await setUpStore(page, tenant);
  const origin = await storefrontOrigin(page, tenant);

  const context = await browser.newContext();
  const shop = await context.newPage();
  await expect
    .poll(
      async () => (await fetchStore(context.request, origin, "/products/enamel-saucepan")).status,
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(200);

  // Product page: 3 of 2 is refused with the count; nothing reaches the cart.
  await shop.goto(`${origin}/products/enamel-saucepan`);
  await shop.getByLabel("Quantity").fill("3");
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await expect(shop.getByText(/Only 2 are available/)).toBeVisible();
  await shop.goto(`${origin}/cart`);
  await expect(shop.getByText("Your cart is empty.")).toBeVisible();

  // 1, then raise to 2 in the cart: accepted; 3: refused and the line keeps 2.
  await shop.goto(`${origin}/products/enamel-saucepan`);
  await shop.getByLabel("Quantity").fill("1");
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await shop.waitForURL(/\/cart$/);
  await expect(shop.getByText("Only 2 available")).toBeVisible();
  const qty = shop.getByLabel("Quantity of Enamel saucepan");
  await expect(qty).toHaveAttribute("max", "2");
  await qty.fill("2");
  await shop.getByRole("button", { name: "Update" }).first().click();
  // Updated once the re-rendered cart shows 2 × 1,450.
  await expect(shop.locator(".sv-cart-summary")).toContainText("2,900.00");
  await expect(qty).toHaveValue("2");
  // The browser's max stops 3 before it is sent; a request that gets past it is
  // refused by the server. Remove the hint to send it anyway.
  await qty.evaluate((el) => {
    el.removeAttribute("max");
  });
  await qty.fill("3");
  await shop.getByRole("button", { name: "Update" }).first().click();
  await shop.waitForURL(/error=stock/);
  await expect(shop.locator(".sv-notice[role=alert]")).toContainText("Only 2 are available.");
  await expect(shop.getByLabel("Quantity of Enamel saucepan")).toHaveValue("2");

  // Over the cart's per-line limit: refused, not reduced to 99.
  await shop.goto(`${origin}/products/stoneware-mug`);
  await shop.getByLabel("Quantity").evaluate((el) => {
    el.removeAttribute("max");
  });
  await shop.getByLabel("Quantity").fill("150");
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await expect(shop.getByText(/at most 99 of an item/)).toBeVisible();
  await shop.goto(`${origin}/cart`);
  await expect(shop.getByText("Stoneware mug")).toHaveCount(0);

  // The merchant's stock goes to 0: the line is marked, left out, and checkout waits.
  await changeStock(page, tenant, "Enamel saucepan", "-2");
  await shop.goto(`${origin}/cart`);
  await expect(shop.getByText("Sold out. Remove it to check out.")).toBeVisible();
  await expect(shop.getByText("Not included")).toBeVisible();
  await expect(shop.getByRole("button", { name: "Check out" })).toBeDisabled();
  // …and the product page says so once its cached copy is invalidated (worker).
  await expect
    .poll(
      async () => {
        await shop.goto(`${origin}/products/enamel-saucepan`);
        return shop.getByRole("button", { name: "Sold out" }).count();
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(1);
  await expect(shop.getByRole("button", { name: "Sold out" })).toBeDisabled();

  // Removing it (and adding something else) lets the shopper check out.
  await shop.goto(`${origin}/cart`);
  await shop.getByRole("button", { name: "Remove Enamel saucepan" }).click();
  await expect(shop.getByText("Your cart is empty.")).toBeVisible();
  await context.close();

  const { context: next } = await shopperWithCart(browser, origin, "1");
  await next.close();
});
