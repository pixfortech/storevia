import { expect, test, type Page } from "@playwright/test";
import { setUpStore, shopperWithCart } from "./checkout-helpers";
import { createTenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Theme packages (M7, 08-themes.md §10): a merchant installs the second
// first-party theme (Boutique), customises its draft, previews it (only the
// signed preview shows it; shoppers keep the live theme), publishes it (the
// public store switches), shops through product, cart and checkout in it,
// and switches back to Storevia with its settings intact. The library (in
// the Themes area, /themes) is used with the keyboard and fits phone, tablet
// and desktop widths.

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("install, customise, preview, publish and switch back a theme", async ({
  page,
  browser,
  context,
}) => {
  test.setTimeout(480_000);
  const tenant = await createTenant(page, "themes");
  await addProduct(page, tenant, "Stoneware mug", "999", "10");
  await setUpStore(page, tenant);
  const origin = await storefrontOrigin(page, tenant);
  const visitor = await browser.newContext();
  const publicHome = async () => (await fetchStore(visitor.request, origin, "/")).text;
  await expect
    .poll(async () => (await fetchStore(visitor.request, origin, "/")).status, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toBe(200);
  expect(await publicHome()).toMatch(/<html[^>]* data-sv-theme="storevia"/);

  // --- The library: Storevia is current, Boutique isn't installed. ---
  const themes = `${tenant.storePath}/themes`;
  await page.goto(themes);
  const library = page.getByRole("region", { name: "Theme library" });
  const storevia = library.getByRole("group", { name: "Storevia" });
  const boutique = library.getByRole("group", { name: "Boutique" });
  const badge = (card: typeof storevia, label: string) =>
    card.getByRole("list", { name: "Status" }).getByText(label, { exact: true });
  await expect(badge(storevia, "Live")).toBeVisible();
  await expect(badge(boutique, "Not installed")).toBeVisible();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(boutique.getByRole("button", { name: "Install, Boutique" })).toBeVisible();
    expect(await noHorizontalScroll(page), `theme library at ${String(width)}px`).toBe(true);
  }

  // --- Install, with the keyboard. ---
  await boutique.getByRole("button", { name: "Install, Boutique" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").getByText(/Boutique installed/)).toBeVisible();
  await expect(badge(boutique, "Installed")).toBeVisible();
  await expect(boutique.getByRole("button", { name: "Installed, Boutique" })).toBeDisabled();
  expect(await publicHome()).toMatch(/data-sv-theme="storevia"/);

  // --- Customise Boutique's draft: the Linen style. ---
  await boutique.getByRole("link", { name: "Customise, Boutique" }).click();
  await expect(page).toHaveURL(/\/themes\/customise\?theme=boutique$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Customise Boutique (not live)", level: 2 }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Linen/ }).click();
  await expect(page.getByRole("radio", { name: /Linen/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();

  // --- Preview: the signed preview shows Boutique; shoppers still get Storevia. ---
  await page
    .getByRole("navigation", { name: "Themes sections" })
    .getByRole("link", { name: "Theme library" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${themes}$`), { timeout: 30_000 });
  await boutique.getByRole("button", { name: "Preview on my store, Boutique" }).click();
  await expect(
    page.getByRole("status").getByText(/Your store preview now shows Boutique/),
  ).toBeVisible();
  await expect(badge(boutique, "Previewing")).toBeVisible();
  const [preview] = await Promise.all([
    context.waitForEvent("page"),
    boutique.getByRole("link", { name: /^Preview on my store, Boutique/ }).click(),
  ]);
  await preview.waitForLoadState();
  await expect(preview.locator("html")).toHaveAttribute("data-sv-theme", "boutique");
  await expect(preview.getByText(/^Preview: the Boutique theme/)).toBeVisible();
  expect(await preview.content()).toContain("--sv-color-primary:#6b2f3a");
  // The centred header: the store's name sits above the menu row.
  await expect(preview.locator("header .sv-header-top .sv-brand")).toBeVisible();
  await preview.close();
  const stillPublic = await publicHome();
  expect(stillPublic).toMatch(/data-sv-theme="storevia"/);
  expect(stillPublic).not.toContain("#6b2f3a");

  // --- Make live: the store switches to Boutique. ---
  await boutique.getByRole("button", { name: "Make live, Boutique" }).click();
  await expect(page.getByRole("status").getByText(/Boutique is now your live theme/)).toBeVisible();
  await expect(badge(boutique, "Live")).toBeVisible();
  await expect(badge(storevia, "Installed")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Current theme" }).getByText("Boutique", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(publicHome, { timeout: 60_000, intervals: [1_000] })
    .toMatch(/data-sv-theme="boutique"/);
  expect(await publicHome()).toContain("--sv-color-primary:#6b2f3a");

  // --- Commerce is unchanged underneath: product, cart and checkout in Boutique. ---
  const { context: shopperContext, shop } = await shopperWithCart(browser, origin, "1");
  await expect(shop.locator("html")).toHaveAttribute("data-sv-theme", "boutique");
  await expect(shop.getByRole("button", { name: "Continue" }).first()).toBeVisible();
  await shop.goto(`${origin}/cart`);
  await expect(shop.getByText("Stoneware mug").first()).toBeVisible();
  await shop.goto(`${origin}/products/stoneware-mug`);
  await expect(shop.getByRole("heading", { level: 1, name: "Stoneware mug" })).toBeVisible();
  await expect(shop.getByRole("button", { name: "Add to cart" })).toBeVisible();
  for (const width of [390, 768, 1280]) {
    await shop.setViewportSize({ width, height: 900 });
    await shop.reload();
    await expect(shop.getByRole("heading", { level: 1, name: "Stoneware mug" })).toBeVisible();
    expect(await noHorizontalScroll(shop), `product page at ${String(width)}px`).toBe(true);
  }
  await shop.goto(`${origin}/`);
  await expect(shop.locator("header .sv-brand")).toBeVisible();
  await shopperContext.close();

  // --- Switch back: Storevia returns as it was; Boutique keeps its settings. ---
  await storevia.getByRole("button", { name: "Make live, Storevia" }).click();
  await expect(page.getByRole("status").getByText(/Storevia is now your live theme/)).toBeVisible();
  await expect(badge(storevia, "Live")).toBeVisible();
  await expect
    .poll(publicHome, { timeout: 60_000, intervals: [1_000] })
    .toMatch(/data-sv-theme="storevia"/);
  expect(await publicHome()).not.toContain("#6b2f3a");
  await boutique.getByRole("link", { name: "Customise, Boutique" }).click();
  await expect(page).toHaveURL(/\/themes\/customise\?theme=boutique$/, { timeout: 30_000 });
  await expect(page.getByRole("radio", { name: /Linen/ })).toHaveAttribute("aria-checked", "true");
  await visitor.close();
});
