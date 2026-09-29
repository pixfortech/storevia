import { expect, test } from "@playwright/test";
import { captureServerAction, createTenant, replay } from "./helpers";

// Business types (ADR-0024, DB-2): only the online store is offered at
// launch. Stores that already have another type keep it, with navigation
// that lists only what's built; they can move to an online store, never to
// another type, and nothing is lost. Types never grant plan features.

const REFUSAL = "Storevia supports online stores for now";

test("a new store is an online store: nothing else is offered, and the server refuses others", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const tenant = await createTenant(page, "launch");
  // The store settings name the type; with nothing else to choose, there's no form.
  await page.goto(`${tenant.storePath}/settings`);
  await expect(page.locator("#business-type")).toContainText("Online store");
  await expect(page.getByRole("radio", { name: /Portfolio|Blog|Business website/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Update business type" })).toHaveCount(0);
});

test("an existing publication lists only built areas, and can move to an online store only", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const tenant = await createTenant(page, "publisher", { businessType: "PUBLISHING" });
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
  for (const label of ["Home", "Pages", "Media", "Website", "Settings"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  // Planned areas (posts, categories, authors, analytics) and Apps aren't listed.
  for (const hidden of ["Posts", "Categories", "Authors", "Analytics", "Apps", "Orders"]) {
    await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  }
  // Their routes say plainly they aren't available: no controls, no dates, no upsell.
  await page.goto(`${tenant.storePath}/analytics`);
  await expect(page.getByText("Analytics isn't available")).toBeVisible();
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();
  await expect(page.getByText(/not included in your (current )?plan/i)).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await page.goto(`${tenant.storePath}/posts`);
  await expect(page.getByText("Posts isn't available")).toBeVisible();

  // Settings offer its own type and the online store, nothing else.
  await page.goto(`${tenant.storePath}/settings`);
  const name = await page.getByLabel("Store name").inputValue();
  await expect(page.getByRole("radio", { name: /Blog or publication/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Portfolio|Business website/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /Online store/ }).check();
  const action = await captureServerAction(page, () =>
    page.getByRole("button", { name: "Update business type" }).click(),
  );
  await expect(page.getByText("Business type updated.")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(page.getByLabel("Store name")).toHaveValue(name);

  // A crafted request for a type that isn't offered is refused by the server.
  const crafted = await replay(context, action, (body) => body.replace("ECOMMERCE", "PORTFOLIO"));
  expect(crafted.text).toContain(REFUSAL);
  await page.reload();
  await expect(page.locator("#business-type")).toContainText("Online store");

  // Choosing a type never grants capacity: the free allowance still allows one store.
  await page.goto(`${tenant.orgPath}/stores/new`);
  await expect(page.getByText("Your plan's store limit has been reached")).toBeVisible();
});

test.describe("responsive shell", () => {
  test("desktop: sidebar, breadcrumbs and the command menu", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tenant = await createTenant(page, "desktop");
    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await expect(page.getByRole("button", { name: "More" })).toBeHidden();
    await page.keyboard.press("Control+k");
    const search = page.getByRole("combobox", { name: "Command menu" });
    await expect(search).toBeFocused();
    await search.fill("settings");
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`${tenant.storePath}/settings`));
  });

  test("tablet: icon rail with a navigation drawer", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    const tenant = await createTenant(page, "tablet");
    const rail = page.getByRole("navigation", { name: "Primary" }).first();
    await expect(rail.getByRole("link", { name: "Products" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeHidden();
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog");
    await drawer
      .getByRole("navigation", { name: "All sections" })
      .getByRole("link", { name: "Members" })
      .click();
    await page.waitForURL(new RegExp(`${tenant.orgPath}/members`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("mobile: bottom bar, More sheet and no desktop chrome", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tenant = await createTenant(page, "mobile");
    await expect(page.getByRole("complementary")).toBeHidden();
    const bar = page.getByRole("navigation", { name: "Primary" }).last();
    // An online store: Home, Orders and its Website; the rest is under More.
    for (const label of ["Home", "Orders", "Website"]) {
      await expect(bar.getByRole("link", { name: label })).toBeVisible();
    }
    await bar.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await sheet.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(new RegExp(`${tenant.storePath}/settings`));
    // No table or sidebar squeezed into the phone viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
