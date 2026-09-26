import { expect, test } from "@playwright/test";
import { createTenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Milestone 4, end to end: a merchant's store is "coming soon" until it goes
// live, can be previewed before that, and then serves its products to
// shoppers, who can fill a cart. Changes reach the storefront through the
// outbox, the worker and the cache invalidation endpoint.

test("a store goes from coming soon to live, and a shopper fills a cart", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "storefront");
  const editor = await addProduct(page, tenant, "Stoneware mug", "999.50", "5");
  const origin = await storefrontOrigin(page, tenant);

  // A new store shows "coming soon" to shoppers, never its products.
  const shopper = await browser.newContext();
  const shop = await shopper.newPage();
  const soon = await shop.goto(`${origin}/`);
  expect(soon?.status()).toBe(200);
  await expect(shop.getByText("This store is getting ready.")).toBeVisible();
  await expect(shop.getByText("Stoneware mug")).toHaveCount(0);
  const soonProduct = await fetchStore(shopper.request, origin, "/products/stoneware-mug");
  expect(soonProduct.text).not.toContain("Stoneware mug");

  // The merchant previews it: the token becomes a cookie and leaves the URL.
  await page.goto(`${tenant.storePath}/settings`);
  const [preview] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: /Preview storefront/ }).click(),
  ]);
  await preview.waitForLoadState();
  await expect(preview.getByText(/^Preview:/)).toBeVisible();
  await expect(preview.getByRole("link", { name: /Stoneware mug/ })).toBeVisible();
  expect(preview.url()).not.toContain("preview=");
  await preview.close();

  // Go live. The status change reaches the storefront through the outbox.
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();
  await expect
    .poll(
      async () => (await fetchStore(shopper.request, origin, "/")).text.includes("Stoneware mug"),
      {
        timeout: 60_000,
        intervals: [1_000],
      },
    )
    .toBe(true);

  // Browse: home → product page.
  const home = await shop.goto(`${origin}/`);
  expect(home?.status()).toBe(200);
  expect(home?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await shop
    .getByRole("link", { name: /Stoneware mug/ })
    .first()
    .click();
  await shop.waitForURL(/\/products\/stoneware-mug$/);
  await expect(shop.getByRole("heading", { level: 1, name: "Stoneware mug" })).toBeVisible();
  await expect(shop.locator(".sv-product-info .sv-price")).toContainText("999.50");
  const productHtml = await shop.content();
  expect(productHtml).toContain('"@type":"Product"');
  expect(productHtml).toContain('rel="canonical"');

  // Cart: add two, change to one, remove. Prices always come from the server.
  await shop.getByLabel("Quantity").fill("2");
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await shop.waitForURL(/\/cart$/);
  await expect(shop.getByRole("link", { name: "Stoneware mug" })).toBeVisible();
  await expect(shop.locator(".sv-cart-summary")).toContainText("1,999.00");
  const cookies = await shopper.cookies(origin);
  const cart = cookies.find((c) => c.name === "sv_cart");
  expect(cart?.httpOnly).toBe(true);
  expect(cart?.sameSite).toBe("Lax");
  expect(cart?.domain).not.toMatch(/^\./);
  await shop.getByLabel("Quantity of Stoneware mug").fill("1");
  await shop.getByRole("button", { name: "Update" }).click();
  await expect(shop.locator(".sv-cart-summary")).toContainText("999.50");
  await expect(shop.getByRole("link", { name: /Cart \(1\)/ })).toBeVisible();
  await shop.getByRole("button", { name: /Remove/ }).click();
  await expect(shop.getByText("Your cart is empty.")).toBeVisible();

  // Cross-site request forgery: the cart's server action posted with a
  // foreign Origin is refused and changes nothing; the same request from
  // the store's own origin works (so the refusal is the Origin check).
  await shop.goto(`${origin}/products/stoneware-mug`);
  const form = shop.locator("form.sv-add-to-cart");
  const actionField =
    (await form.locator('input[name^="$ACTION_ID_"]').first().getAttribute("name")) ?? "";
  const variantId = (await form.locator('input[name="variantId"]').getAttribute("value")) ?? "";
  const cartToken = (await shopper.cookies(origin)).find((c) => c.name === "sv_cart")?.value ?? "";
  expect(actionField).not.toBe("");
  const postAddToCart = (from: string) =>
    shopper.request.post(`http://localhost:${new URL(origin).port}/products/stoneware-mug`, {
      headers: { host: new URL(origin).host, origin: from, cookie: `sv_cart=${cartToken}` },
      multipart: { [actionField]: "", variantId, product: "stoneware-mug", quantity: "3" },
      maxRedirects: 0,
    });
  const cartText = async () =>
    (
      await shopper.request.get(`http://localhost:${new URL(origin).port}/cart`, {
        headers: { host: new URL(origin).host, cookie: `sv_cart=${cartToken}` },
      })
    ).text();
  const forged = await postAddToCart("http://evil.example");
  expect(forged.status()).toBeGreaterThanOrEqual(400);
  expect(await cartText()).toContain("Your cart is empty.");
  const genuine = await postAddToCart(origin);
  expect(genuine.status()).toBeLessThan(400);
  expect(await cartText()).toContain("2,998.50");

  // Search, collections of nothing, 404s and the internal store segment.
  await shop.goto(`${origin}/search?q=mug`);
  await expect(shop.getByRole("heading", { name: "Results for “mug”" })).toBeVisible();
  expect((await fetchStore(shopper.request, origin, "/products/does-not-exist")).status).toBe(404);
  expect(
    (await fetchStore(shopper.request, origin, "/sv/anything/products/stoneware-mug")).status,
  ).toBe(404);
  expect(
    (await fetchStore(shopper.request, "http://nobody.store.localhost:3002", "/")).status,
  ).toBe(404);

  // SEO files for the live store.
  const robots = await fetchStore(shopper.request, origin, "/robots.txt");
  expect(robots.text).toContain("Disallow: /cart");
  const sitemap = await fetchStore(shopper.request, origin, "/sitemap.xml");
  expect(sitemap.text).toContain(`${origin}/products/stoneware-mug`);

  // Archiving the product removes it from the storefront (outbox → worker → cache).
  await page.goto(editor);
  await page.getByRole("button", { name: "Archive" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive product" }).click();
  await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
  await expect
    .poll(
      async () => (await fetchStore(shopper.request, origin, "/products/stoneware-mug")).status,
      {
        timeout: 60_000,
        intervals: [1_000],
      },
    )
    .toBe(404);

  // A new store address: the old one redirects, permanently, to the new one.
  await page.goto(`${tenant.storePath}/settings`);
  const oldHost = new URL(origin).hostname;
  const newSlug = `${oldHost.split(".")[0] ?? "store"}-new`;
  await page.getByRole("textbox", { name: "Store address" }).fill(newSlug);
  await page.getByRole("button", { name: "Change address" }).click();
  await expect(page.getByText(`Your store is now at ${newSlug}.store.localhost.`)).toBeVisible();
  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/search?q=x")).status, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toBe(301);
  const moved = await fetchStore(shopper.request, origin, "/search?q=x");
  expect(moved.headers["location"]).toBe(`http://${newSlug}.store.localhost:3002/search?q=x`);
  await shopper.close();
});
