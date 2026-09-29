import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { THEME_DEMO_NOT_OFFERED } from "@storevia/site-engine/demo";
import { createTenant } from "./helpers";

// Theme demos (08-themes.md §10.7): Themes is its own area after Website;
// its library previews every first-party theme with Storevia's demo store,
// drawn by the real renderer in an isolated frame; each card's actions line
// up in one order; "View demo" opens a full demo at desktop, tablet and
// phone widths. The two themes are told apart by the renderer's identity
// and layout metadata and by measured layout, never by screenshots. A demo
// shows only what a store can (TH-1): no announcement bar, no "You may also
// like", nothing from THEME_DEMO_NOT_OFFERED.

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** The demo's root element inside a preview frame. */
const demoRoot = (frame: FrameLocator) => frame.locator(".sv-demo");

/** Height ÷ width of the first product card's image area. */
const cardShape = (frame: FrameLocator) =>
  frame
    .locator(".sv-card-media")
    .first()
    .evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.height / box.width;
    });

async function expectIdentity(
  frame: FrameLocator,
  expected: { theme: string; header: string; card: string; productPage: string },
) {
  const root = demoRoot(frame);
  await expect(root).toHaveAttribute("data-sv-theme", expected.theme);
  await expect(root).toHaveAttribute("data-sv-product-card", expected.card);
  await expect(root).toHaveAttribute("data-sv-product-page", expected.productPage);
  await expect(frame.locator("header.sv-header")).toHaveAttribute(
    "data-sv-header",
    expected.header,
  );
}

/** The demo shows no feature a store can't have: its markup, without stylesheets. */
async function expectNoPhantomFeatures(frame: FrameLocator) {
  await expect(frame.locator(".sv-announcement")).toHaveCount(0);
  await expect(frame.getByText("You may also like")).toHaveCount(0);
  const markup = await demoRoot(frame).evaluate((root) => {
    const copy = root.cloneNode(true) as Element;
    for (const style of copy.querySelectorAll("style")) style.remove();
    return copy.outerHTML;
  });
  for (const { feature, pattern } of THEME_DEMO_NOT_OFFERED) {
    expect(pattern.test(markup), feature).toBe(false);
  }
}

const actionOrder = (card: Locator) =>
  card
    .locator("[data-action]")
    .evaluateAll((items) => items.map((i) => i.getAttribute("data-action")));

test("Themes: two genuinely different demos, a full demo at three widths, and the old route", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const tenant = await createTenant(page, "theme-demo");

  // --- Themes is its own area, right after Website. ---
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
  const links = nav.getByRole("link");
  const names = await links.evaluateAll((items) => items.map((i) => i.textContent.trim()));
  const website = names.findIndex((n) => n.startsWith("Website"));
  expect(website).toBeGreaterThanOrEqual(0);
  expect(names[website + 1]).toMatch(/^Themes/);
  await nav.getByRole("link", { name: /^Themes/ }).click();
  await expect(page).toHaveURL(new RegExp(`${tenant.storePath}/themes$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Themes" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Themes sections" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Current theme" }).getByText("Storevia", { exact: true }),
  ).toBeVisible();

  // --- The library: each card previews its theme with the real renderer. ---
  const library = page.getByRole("region", { name: "Theme library" });
  const storevia = library.getByRole("group", { name: "Storevia" });
  const boutique = library.getByRole("group", { name: "Boutique" });
  const storeviaMini = page.frameLocator('iframe[title="Storevia demo store, home page"]');
  const boutiqueMini = page.frameLocator('iframe[title="Boutique demo store, home page"]');
  await expect(demoRoot(storeviaMini)).toBeAttached({ timeout: 20_000 });
  await expect(demoRoot(boutiqueMini)).toBeAttached({ timeout: 20_000 });
  await expectIdentity(storeviaMini, {
    theme: "storevia",
    header: "inline",
    card: "square",
    productPage: "split",
  });
  await expectIdentity(boutiqueMini, {
    theme: "boutique",
    header: "centred",
    card: "portrait",
    productPage: "gallery",
  });
  // The same demo content in both: brand, collection, four products, a sale;
  // and only what a store can show.
  for (const frame of [storeviaMini, boutiqueMini]) {
    await expect(frame.locator(".sv-brand")).toHaveText("Harbour & Loom");
    await expectNoPhantomFeatures(frame);
    await expect(frame.locator(".sv-block-heading", { hasText: "The autumn edit" })).toBeAttached();
    await expect(frame.locator(".sv-card")).toHaveCount(4);
    await expect(frame.locator(".sv-price-sale")).toHaveCount(1);
    await expect(frame.locator("footer.sv-footer")).toBeAttached();
    await expect(frame.locator("img")).toHaveCount(0);
  }
  // Rendered layout differs, not just labels: the centred brand sits above
  // the menu, and Boutique's cards are portrait while Storevia's are square.
  await expect(boutiqueMini.locator(".sv-header-top .sv-brand")).toBeAttached();
  await expect(storeviaMini.locator(".sv-header-row .sv-brand")).toBeAttached();
  expect(await cardShape(storeviaMini)).toBeCloseTo(1, 1);
  expect(await cardShape(boutiqueMini)).toBeGreaterThan(1.25);
  const brandTransform = (frame: FrameLocator) =>
    frame.locator(".sv-brand").evaluate((el) => getComputedStyle(el).textTransform);
  expect(await brandTransform(boutiqueMini)).toBe("uppercase");
  expect(await brandTransform(storeviaMini)).toBe("none");
  // The theme's CSS stays in its frame: no theme markup, tokens or type in the dashboard.
  const dashboard = await page.evaluate(() => ({
    themed: document.querySelector("[data-sv-theme], .sv-demo") !== null,
    token: getComputedStyle(document.documentElement).getPropertyValue("--sv-color-primary"),
    heading: getComputedStyle(document.querySelector("h1") ?? document.body).fontFamily,
  }));
  expect(dashboard.themed).toBe(false);
  expect(dashboard.token).toBe("");
  expect(dashboard.heading).not.toContain("Iowan Old Style");

  // --- Cards: state written out, the same five actions in the same order. ---
  const status = (card: Locator) => card.getByRole("list", { name: "Status" });
  await expect(status(storevia).getByText("Live", { exact: true })).toBeVisible();
  await expect(status(boutique).getByText("Not installed", { exact: true })).toBeVisible();
  for (const card of [storevia, boutique]) {
    expect(await actionOrder(card)).toEqual(["demo", "install", "customise", "preview", "publish"]);
  }
  await expect(storevia.getByRole("button", { name: "Installed, Storevia" })).toBeDisabled();
  await expect(boutique.getByRole("button", { name: "Install, Boutique" })).toBeEnabled();
  await expect(boutique.getByRole("button", { name: "Customise, Boutique" })).toBeDisabled();
  await expect(boutique.getByRole("button", { name: "Make live, Boutique" })).toBeDisabled();
  // Action rows line up across the two cards on desktop, and stack on phones.
  const top = async (card: Locator) =>
    (await card.locator('[data-action="demo"]').boundingBox())?.y ?? -1;
  expect(Math.abs((await top(storevia)) - (await top(boutique)))).toBeLessThan(2);
  const width = async (card: Locator, action: string) =>
    (await card.locator(`[data-action="${action}"]`).boundingBox())?.width ?? -1;
  expect(Math.abs((await width(storevia, "demo")) - (await width(boutique, "demo")))).toBeLessThan(
    2,
  );
  for (const viewport of [390, 768, 1280]) {
    await page.setViewportSize({ width: viewport, height: 900 });
    await expect(boutique.getByRole("link", { name: "View demo, Boutique" })).toBeVisible();
    expect(await noHorizontalScroll(page), `themes at ${String(viewport)}px`).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  const demoBox = await boutique.locator('[data-action="demo"]').boundingBox();
  const installBox = await boutique.locator('[data-action="install"]').boundingBox();
  expect(installBox?.y ?? 0).toBeGreaterThan((demoBox?.y ?? 0) + (demoBox?.height ?? 0) - 1);
  await page.setViewportSize({ width: 1280, height: 900 });

  // --- View demo: the full Boutique demo at desktop, tablet and mobile. ---
  await boutique.getByRole("link", { name: "View demo, Boutique" }).click();
  await expect(page).toHaveURL(new RegExp(`${tenant.storePath}/themes/demo/boutique$`), {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { level: 1, name: "Boutique demo" })).toBeVisible();
  const viewer = page.frameLocator('iframe[title="Boutique demo store, home page"]');
  await expect(demoRoot(viewer)).toBeAttached({ timeout: 20_000 });
  await expectIdentity(viewer, {
    theme: "boutique",
    header: "centred",
    card: "portrait",
    productPage: "gallery",
  });
  const viewports = page.getByRole("radiogroup", { name: "Viewport" });
  const frameWidth = () => viewer.locator("html").evaluate(() => window.innerWidth);
  for (const [label, key, px] of [
    ["Desktop", "desktop", 1280],
    ["Tablet", "tablet", 768],
    ["Mobile", "mobile", 390],
  ] as const) {
    await viewports.getByRole("radio", { name: label }).click();
    await expect(viewports.getByRole("radio", { name: label })).toBeChecked();
    await expect(page.locator(`[data-viewport="${key}"]`)).toHaveAttribute(
      "data-viewport-width",
      String(px),
    );
    // The demo is laid out at the real width, so the theme's media queries apply.
    await expect.poll(frameWidth).toBe(px);
    expect(await noHorizontalScroll(page), `demo viewer at ${label}`).toBe(true);
  }
  // Phone width: the product grid falls to two columns.
  const columns = () =>
    viewer
      .locator(".sv-grid")
      .first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  await expect.poll(columns).toBe(2);
  await expect(page).toHaveURL(/viewport=mobile/);

  // The demo product page: Boutique's gallery layout with the demo product.
  await page
    .getByRole("radiogroup", { name: "Page" })
    .getByRole("radio", { name: "Product page" })
    .click();
  await viewports.getByRole("radio", { name: "Desktop" }).click();
  const product = page.frameLocator('iframe[title="Boutique demo store, product page"]');
  await expect(product.locator('.sv-demo[data-sv-demo="product"]')).toBeAttached();
  await expect(
    product.getByRole("heading", { level: 1, name: "Linen table runner" }),
  ).toBeVisible();
  // The storefront's product template as it is: no related products.
  await expectNoPhantomFeatures(product);
  await expect(product.locator(".sv-card")).toHaveCount(0);
  const productColumns = () =>
    product
      .locator(".sv-product")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").map(parseFloat));
  await expect
    .poll(async () => {
      const [gallery = 0, details = 0] = await productColumns();
      return gallery / details;
    })
    .toBeGreaterThan(1.3);
  // Nothing in a demo navigates: the frame still shows the demo after a click.
  await product.getByRole("link", { name: "Shop" }).click();
  await expect(product.locator('.sv-demo[data-sv-demo="product"]')).toBeAttached();
  await expect(page).toHaveURL(new RegExp(`${tenant.storePath}/themes/demo/boutique`));

  // --- The Storevia demo is a different renderer output for the same page. ---
  await page.goto(`${tenant.storePath}/themes/demo/storevia?page=product`);
  const storeviaProduct = page.frameLocator('iframe[title="Storevia demo store, product page"]');
  await expectIdentity(storeviaProduct, {
    theme: "storevia",
    header: "inline",
    card: "square",
    productPage: "split",
  });
  await expect
    .poll(async () => {
      const [gallery = 0, details = 0] = await storeviaProduct
        .locator(".sv-product")
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").map(parseFloat));
      return Math.round((gallery / details) * 10) / 10;
    })
    .toBe(1);
  await expect(page.getByRole("link", { name: "Customise Storevia" })).toBeVisible();

  // --- The old route keeps working. ---
  await page.goto(`${tenant.storePath}/website/theme`);
  await expect(page).toHaveURL(new RegExp(`${tenant.storePath}/themes$`), { timeout: 30_000 });
  await page.goto(`${tenant.storePath}/website/theme?theme=storevia`);
  await expect(page).toHaveURL(
    new RegExp(`${tenant.storePath}/themes/customise\\?theme=storevia$`),
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "Customise Storevia (your live theme)" }),
  ).toBeVisible();
  // Website keeps pages and menus; its theme card points to Themes.
  await page.goto(`${tenant.storePath}/website`);
  await page.getByRole("link", { name: "Go to Themes" }).click();
  await expect(page).toHaveURL(new RegExp(`${tenant.storePath}/themes$`), { timeout: 30_000 });
  // An unknown theme has no demo.
  const missing = await page.goto(`${tenant.storePath}/themes/demo/not-a-theme`);
  expect(missing?.status()).toBe(404);
});
