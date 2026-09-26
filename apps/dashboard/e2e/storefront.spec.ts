import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createTenant, type Tenant } from "./helpers";

// Milestone 4, end to end: a merchant's store is "coming soon" until it goes
// live, can be previewed before that, and then serves its products to
// shoppers, who can fill a cart. Changes reach the storefront through the
// outbox, the worker and the cache invalidation endpoint.

/** Node can't resolve *.localhost names (browsers can): send the Host header instead. */
async function fetchStore(
  request: APIRequestContext,
  origin: string,
  path: string,
): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  const url = new URL(path, origin);
  const response = await request.get(`http://localhost:${url.port}${url.pathname}${url.search}`, {
    headers: { host: url.host },
    maxRedirects: 0,
  });
  return { status: response.status(), headers: response.headers(), text: await response.text() };
}

async function storefrontOrigin(page: Page, tenant: Tenant): Promise<string> {
  await page.goto(`${tenant.storePath}/settings`);
  const link = page.getByRole("link", { name: /\.store\.localhost/ }).first();
  return new URL((await link.getAttribute("href")) ?? "").origin;
}

async function addProduct(page: Page, tenant: Tenant, title: string, price: string, stock: string) {
  await page.goto(`${tenant.storePath}/products/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Price", { exact: true }).fill(price);
  await page.getByLabel("Stock on hand").fill(stock);
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/products\/prod_[^/]+$/);
  await page.getByRole("button", { name: "Set as active" }).first().click();
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
  return page.url();
}

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
