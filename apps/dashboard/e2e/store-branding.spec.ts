import { expect, test, type Page } from "@playwright/test";
import { captureServerAction, createTenant, replay } from "./helpers";
import { images } from "./images";
import { goLiveReady } from "./launch-helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// The store's logo and favicon (final pass, Phase 2A), end to end: a logo
// uploaded from Website → Logo and favicon, a favicon chosen from the media
// library, both live on the (cached) storefront at once; removing the logo
// brings the store's name back. The media id in the request is only a
// request: another tenant's replay attaching this store's image is refused.

// The header's logo link (the class alone also appears in the inlined base CSS).
const LOGO_LINK = 'class="sv-brand sv-brand-logo"';

/** The media folder of a rendition URL (…/{mediaId}/w320.webp → {mediaId}). */
const mediaFolder = (url: string) => url.split("/").slice(-2)[0] ?? "";

async function openBrandPage(page: Page, storePath: string) {
  await page.goto(`${storePath}/website`);
  await page.getByRole("link", { name: "Edit logo and favicon" }).click();
  await page.waitForURL(/\/website\/brand$/);
  await expect(page.getByRole("heading", { name: "Logo and favicon", level: 1 })).toBeVisible();
}

test("logo and favicon: upload, choose from the library, storefront, remove, isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "brand");
  // Going live needs a product (launch readiness).
  await addProduct(page, tenant, "Stoneware mug", "450", "5");
  const origin = await storefrontOrigin(page, tenant);
  await goLiveReady(page, tenant);
  const [logoFile, faviconFile] = await images(page, 800); // mug.jpg, bowl.png

  // The favicon's image goes into the media library first.
  await page.goto(`${tenant.storePath}/media`);
  const [libraryChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload images" }).first().click(),
  ]);
  await libraryChooser.setFiles(faviconFile ? [faviconFile] : []);
  await expect(page.getByText("bowl.png").first()).toBeVisible({ timeout: 60_000 });

  await openBrandPage(page, tenant.storePath);
  const logoRegion = page.getByRole("region", { name: "Logo" });
  const faviconRegion = page.getByRole("region", { name: "Favicon" });
  // No logo yet: the header shows the store's name; browsers their default icon.
  await expect(logoRegion.getByText("No logo yet.")).toBeVisible();
  await expect(faviconRegion.getByText("No favicon yet.")).toBeVisible();
  const storeName = (
    await logoRegion.getByRole("img", { name: "Header preview" }).innerText()
  ).trim();
  expect(storeName).toMatch(/^Store brand /);

  // Logo: uploaded from the picker (the one media pipeline).
  await logoRegion.getByRole("button", { name: "Choose logo" }).click();
  const picker = page.getByRole("dialog", { name: "Choose an image" });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    picker.getByRole("button", { name: "Upload" }).click(),
  ]);
  await chooser.setFiles(logoFile ? [logoFile] : []);
  await expect(page.getByText("Logo saved. Your site's header shows it now.")).toBeVisible({
    timeout: 60_000,
  });
  await expect(logoRegion.getByText("mug.jpg")).toBeVisible();
  await expect(logoRegion.getByRole("button", { name: "Replace logo" })).toBeVisible();
  const logoPreview = logoRegion.getByRole("img", { name: "Header preview" }).locator("img");
  await expect
    .poll(() => logoPreview.evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const logoMedia = mediaFolder((await logoPreview.getAttribute("src")) ?? "");

  // Favicon: chosen from the library (captured for the isolation check below).
  await faviconRegion.getByRole("button", { name: "Choose favicon" }).click();
  await picker.getByRole("button", { name: "Choose bowl.png" }).click({ trial: true });
  const attach = await captureServerAction(page, () =>
    picker.getByRole("button", { name: "Choose bowl.png" }).click(),
  );
  await expect(page.getByText("Favicon saved. Your site's pages use it now.")).toBeVisible();
  await expect(faviconRegion.getByText("bowl.png")).toBeVisible();
  const iconSrc =
    (await faviconRegion
      .getByRole("img", { name: "Browser tab preview" })
      .locator("img")
      .getAttribute("src")) ?? "";
  expect(iconSrc).toMatch(/\/w320\.webp$/);

  // The storefront (cached pages included) shows both.
  const shopper = await browser.newContext();
  await expect
    .poll(
      async () => {
        const html = (await fetchStore(shopper.request, origin, "/")).text;
        return html.includes(LOGO_LINK) && html.includes(logoMedia);
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(true);
  const shop = await shopper.newPage();
  await shop.goto(`${origin}/`);
  const headerLogo = shop.locator("header a.sv-brand-logo img");
  await expect(headerLogo).toHaveAttribute("alt", storeName);
  expect(await headerLogo.getAttribute("src")).toContain(`/${logoMedia}/`);
  await expect
    .poll(() => headerLogo.evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  // Sized for the header: at most 2.5rem (40 px) tall, never stretched.
  const box = await headerLogo.boundingBox();
  expect(box?.height ?? 0).toBeLessThanOrEqual(40.5);
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(800 / 600, 1);
  const icon = shop.locator('link[rel="icon"]');
  await expect(icon).toHaveCount(1);
  expect((await icon.getAttribute("href"))?.endsWith(iconSrc)).toBe(true);
  await expect(shop.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  // Every page of the store, not just the home page.
  await shop.goto(`${origin}/search`);
  await expect(shop.locator("header a.sv-brand-logo img")).toHaveAttribute("alt", storeName);
  await expect(shop.locator('link[rel="icon"]')).toHaveCount(1);

  // Another tenant replays the favicon request: for A's store (not a member)
  // and rewritten to its own store with A's media id. Both are refused.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const B = await createTenant(pageB, "brand-b");
  expect((await replay(contextB, attach)).text).toContain("Not found");
  const idor = await replay(contextB, attach, (body) => body.replaceAll(tenant.storeId, B.storeId));
  expect(idor.text).toContain("Not found");
  await openBrandPage(pageB, B.storePath);
  await expect(
    pageB.getByRole("region", { name: "Favicon" }).getByText("No favicon yet."),
  ).toBeVisible();
  await contextB.close();

  // Remove the logo: the header shows the store's name again; then the favicon.
  await logoRegion.getByRole("button", { name: "Remove logo" }).click();
  await expect(
    page.getByText("Logo removed. Your site's header shows your store's name."),
  ).toBeVisible();
  await expect(logoRegion.getByText("No logo yet.")).toBeVisible();
  await faviconRegion.getByRole("button", { name: "Remove favicon" }).click();
  await expect(page.getByText("Favicon removed. Browsers show their default icon.")).toBeVisible();
  await expect
    .poll(
      async () => {
        const html = (await fetchStore(shopper.request, origin, "/")).text;
        return !html.includes(LOGO_LINK) && !html.includes('rel="icon"');
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(true);
  await shop.goto(`${origin}/`);
  await expect(shop.locator("header a.sv-brand")).toHaveText(storeName);
  await expect(shop.locator("header a.sv-brand img")).toHaveCount(0);
  await expect(shop.locator('link[rel="icon"]')).toHaveCount(0);
  await shopper.close();
});
