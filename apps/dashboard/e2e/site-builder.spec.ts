import { expect, test, type Page } from "@playwright/test";
import { createTenant, type Tenant } from "./helpers";
import { images } from "./images";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";
import { goLiveReady } from "./launch-helpers";

// The Visual Builder, end to end (ADR-0030): a merchant edits the home page
// with generic and commerce sections, reorders them, picks an image from the
// media library, saves a draft (which survives a reload and isn't public),
// previews it through the signed preview, publishes, and the live store
// shows it. Then theme and menus, conflicts between two tabs, and another
// tenant's access.

const canvas = (page: Page) => page.frameLocator('iframe[title="Page preview"]');

async function goLive(page: Page, tenant: Tenant) {
  await goLiveReady(page, tenant);
}

async function openHomeBuilder(page: Page, storePath: string) {
  await page.goto(`${storePath}/website`);
  await page.getByRole("link", { name: "Edit home page" }).click();
  await page.waitForURL(/\/website\/pages\/page_/);
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
}

async function saved(page: Page) {
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 20_000 });
}

test("a merchant builds, previews and publishes the home page", async ({
  page,
  browser,
  context,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "builder");
  await addProduct(page, tenant, "Stoneware mug", "999.50", "5");
  const origin = await storefrontOrigin(page, tenant);
  await goLive(page, tenant);
  const shopper = await browser.newContext();

  await openHomeBuilder(page, tenant.storePath);
  const sections = page.getByRole("navigation", { name: "Page sections" });
  await expect(sections.getByRole("button", { name: "Hero", exact: true })).toBeVisible();
  await expect(
    sections.getByRole("button", { name: "Products: Latest products", exact: true }),
  ).toBeVisible();
  // The canvas renders the page as the storefront does, with the store's product.
  await expect(canvas(page).getByText("Stoneware mug")).toBeVisible({ timeout: 20_000 });

  // A generic section: text, with a heading and formatted text.
  await sections.getByRole("button", { name: "Products: Latest products", exact: true }).click();
  await page.getByRole("button", { name: "Add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .getByRole("button", { name: /^Text/ })
    .click();
  await page.getByRole("textbox", { name: "Heading", exact: true }).fill("Our story");
  const body = page.getByRole("textbox", { name: "Text" });
  await body.click();
  await body.pressSequentially("We fire every mug by hand.");
  await expect(canvas(page).getByRole("heading", { name: "Our story" })).toBeVisible();

  // A commerce section: chosen products.
  await page.getByRole("button", { name: "Add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .getByRole("button", { name: /^Products/ })
    .click();
  await page.getByRole("textbox", { name: "Heading", exact: true }).fill("Staff picks");
  await expect(canvas(page).getByRole("heading", { name: "Staff picks" })).toBeVisible();

  // Reorder with buttons (no drag and drop needed): the text section moves up.
  await sections.getByRole("button", { name: "Text: Our story", exact: true }).click();
  await page.getByRole("button", { name: "Move Text: Our story up" }).click();
  const order = async () =>
    sections
      .getByRole("listitem")
      .evaluateAll((items) =>
        items.map((li) => li.querySelector("button span:not([aria-hidden])")?.textContent ?? ""),
      );
  await expect
    .poll(order)
    .toEqual([
      "Hero",
      "Collections: Shop by collection",
      "Text: Our story",
      "Products: Latest products",
      "Products: Staff picks",
    ]);

  // An image for the hero, uploaded through the media library picker.
  await sections.getByRole("button", { name: "Hero", exact: true }).click();
  await page.getByRole("button", { name: "Choose image" }).click();
  const [jpeg] = await images(page, 1600);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page
      .getByRole("dialog", { name: "Choose an image" })
      .getByRole("button", { name: "Upload" })
      .click(),
  ]);
  await chooser.setFiles(jpeg ? [jpeg] : []);
  await expect(page.getByRole("dialog", { name: "Choose an image" })).toBeHidden({
    timeout: 60_000,
  });
  await page.getByLabel(/Alternative text/).fill("Mugs drying on a shelf");
  await expect
    .poll(
      () =>
        canvas(page)
          .locator(".sv-hero-backdrop")
          .evaluate((i) => (i as HTMLImageElement).naturalWidth),
      {
        timeout: 20_000,
      },
    )
    .toBeGreaterThan(0);

  // Save, reload: the draft is still there.
  await page.getByRole("button", { name: "Save draft" }).click();
  await saved(page);
  await expect(page.getByText("Unpublished changes")).toBeVisible();
  await page.reload();
  await expect(
    sections.getByRole("button", { name: "Text: Our story", exact: true }),
  ).toBeVisible();
  await expect(canvas(page).getByRole("heading", { name: "Staff picks" })).toBeVisible();

  // Not public yet.
  expect((await fetchStore(shopper.request, origin, "/")).text).not.toContain("Our story");

  // The signed preview shows the draft.
  const [preview] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Preview" }).click(),
  ]);
  await preview.waitForLoadState();
  await expect(preview.getByRole("heading", { name: "Our story" })).toBeVisible();
  await expect(preview.getByText(/^Preview:/)).toBeVisible();
  expect(preview.url()).not.toContain("preview=");
  await preview.close();

  // Publish: the live store shows it once the invalidation arrives.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published\. Your site shows these changes now\./)).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/")).text, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toContain("Our story");
  const shop = await shopper.newPage();
  await shop.goto(`${origin}/`);
  await expect(shop.getByRole("heading", { level: 1 })).toHaveText(
    new RegExp(tenant.storeId ? "Store builder" : ""),
  );
  await expect(shop.getByRole("heading", { name: "Staff picks" })).toBeVisible();
  await expect(shop.getByRole("img", { name: "Mugs drying on a shelf" })).toBeVisible();
  const headings = await shop.locator("main h2").allInnerTexts();
  expect(headings.indexOf("Our story")).toBeLessThan(headings.indexOf("Latest products"));
  expect(await shop.evaluate(() => document.body.innerHTML)).not.toContain("svb-");

  // Phones: nothing overflows sideways.
  for (const width of [320, 375, 390, 768]) {
    await shop.setViewportSize({ width, height: 800 });
    expect(
      await shop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `no horizontal scroll at ${String(width)}px`,
    ).toBe(true);
  }
  await shopper.close();
});

test("theme, menus, two tabs, and another tenant", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "designer");
  const origin = await storefrontOrigin(page, tenant);
  await goLive(page, tenant);
  const shopper = await browser.newContext();

  // A content page, published.
  await page.goto(`${tenant.storePath}/pages`);
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog", { name: "New page" }).getByLabel("Title").fill("About us");
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/website\/pages\/page_/);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/pages/about-us")).status, {
      timeout: 30_000,
    })
    .toBe(200);

  // Theme (its own area, Themes › Customise): the Modern style, published.
  await page.goto(`${tenant.storePath}/themes/customise`);
  // A click that lands before hydration checks the radio without telling the
  // editor: choose again until the editor has the change.
  await expect(async () => {
    await page.getByRole("radio", { name: /Editorial/ }).click();
    await page.getByRole("radio", { name: /Modern/ }).click();
    await expect(page.getByRole("button", { name: "Publish theme" })).toBeEnabled({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "Publish theme" }).click();
  await expect(page.getByText(/Theme published/)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/")).text, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toContain("--sv-color-primary:#4338ca");

  // A theme the contrast rules refuse can't be saved.
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("#f4f4f4");
  await expect(page.getByText(/Text needs more contrast/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();

  // Menus: an "About" link in the header, and an unsafe address is refused.
  await page.goto(`${tenant.storePath}/website/navigation`);
  const main = page.getByRole("region", { name: "Main menu" });
  await main.getByRole("button", { name: "Add link" }).click();
  await main.getByLabel("Label").fill("About");
  await main.getByLabel("Goes to: link to").selectOption("page");
  await main.getByLabel("Page", { exact: true }).selectOption({ label: "About us" });
  await main.getByRole("button", { name: "Save main menu" }).click();
  await expect(page.getByText(/Menu saved/)).toBeVisible();
  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/")).text, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toMatch(
      /<nav aria-label="Main"><ul class="sv-menu"><li><a href="\/pages\/about-us"[^>]*>About<\/a>/,
    );

  // Two tabs on one page: the second save is refused, never an overwrite.
  await page.goto(`${tenant.storePath}/pages`);
  await page.getByRole("link", { name: "About us" }).click();
  await page.waitForURL(/\/website\/pages\/page_/);
  const builder = page.url();
  const other = await page.context().newPage();
  await other.goto(builder);
  await page.getByRole("button", { name: "Text: About us", exact: true }).click();
  await page.getByRole("textbox", { name: "Heading", exact: true }).fill("About the studio");
  await page.getByRole("button", { name: "Save draft" }).click();
  await saved(page);
  await other.getByRole("button", { name: "Text: About us", exact: true }).click();
  await other
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Written in the other tab");
  await other.getByRole("button", { name: "Save draft" }).click();
  await expect(other.getByText("This page changed somewhere else")).toBeVisible();
  await other.reload();
  await expect(
    other.getByRole("button", { name: "Text: About the studio", exact: true }),
  ).toBeVisible();
  await other.close();

  // Another tenant can't open this store's builder, pages or preview.
  const intruder = await browser.newContext();
  const intruderPage = await intruder.newPage();
  await createTenant(intruderPage, "intruder");
  const pageId = /\/website\/pages\/(page_[^/?]+)/.exec(builder)?.[1] ?? "";
  for (const path of [
    `${tenant.storePath}/website/pages/${pageId}`,
    `${tenant.storePath}/website`,
    `${tenant.storePath}/pages`,
  ]) {
    const response = await intruderPage.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  await intruder.close();
  await shopper.close();
});
