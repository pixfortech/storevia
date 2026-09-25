import { expect, test } from "@playwright/test";
import { createTenant } from "./helpers";

// Business types (ADR-0024): chosen at onboarding, shape navigation, can be
// changed without losing anything, and never grant plan features.

test("a publication gets writing-first navigation, and switching type keeps everything", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const tenant = await createTenant(page, "publisher", { businessType: "Blog or publication" });
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
  for (const label of ["Home", "Posts", "Categories", "Authors", "Pages", "Media", "Settings"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  for (const hidden of ["Orders", "Products", "Inventory", "Customers"]) {
    await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  }
  // No plan yet: analytics is shown, but marked as outside the plan.
  await expect(
    nav.getByRole("link", { name: /Analytics.*not included in your plan/ }),
  ).toBeVisible();
  await page.goto(`${tenant.storePath}/analytics`);
  await expect(page.getByText("Not included in your current plan")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);

  // Change the type in settings: navigation follows, the store and its data stay.
  await page.goto(`${tenant.storePath}/settings`);
  const name = await page.getByLabel("Store name").inputValue();
  await page.getByRole("radio", { name: /Portfolio/ }).check();
  await page.getByRole("button", { name: "Update business type" }).click();
  await expect(page.getByText("Business type updated.")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Posts" })).toHaveCount(0);
  await expect(page.getByLabel("Store name")).toHaveValue(name);
  // Areas outside the new type's navigation stay reachable.
  await page.goto(`${tenant.storePath}/posts`);
  await expect(page.getByText("Posts is coming in a later release")).toBeVisible();

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
    const tenant = await createTenant(page, "mobile", { businessType: "Portfolio" });
    await expect(page.getByRole("complementary")).toBeHidden();
    const bar = page.getByRole("navigation", { name: "Primary" }).last();
    for (const label of ["Home", "Projects", "Website"]) {
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
