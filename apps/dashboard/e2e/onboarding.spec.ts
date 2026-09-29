import { expect, test } from "@playwright/test";
import { createTenant } from "./helpers";

test("a new user registers, creates an organisation as OWNER, creates the first store and enters its dashboard", async ({
  page,
}) => {
  const tenant = await createTenant(page, "onboard");

  // Store dashboard with the full OWNER navigation for an online store (the default type).
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
  for (const label of [
    "Home",
    "Orders",
    "Products",
    "Inventory",
    "Customers",
    "Website",
    "Pages",
    "Marketing",
    "Settings",
  ]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  // Navigation lists only what's built (DB-5): no analytics or apps placeholders.
  for (const hidden of ["Analytics", "Apps"]) {
    await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  }
  await expect(page.getByText("Your store is ready")).toBeVisible();

  // The owner can edit store settings.
  await page.goto(`${tenant.storePath}/settings`);
  await page.getByLabel("Store name").fill("Renamed by owner");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  // The organisation lists the owner as OWNER.
  await page.goto(`${tenant.orgPath}/members`);
  const row = page.getByTestId("member-row").filter({ hasText: tenant.email });
  await expect(row.getByText("Owner", { exact: true })).toBeVisible();

  // Orders are live: a new store has none yet, and says so.
  await page.goto(`${tenant.storePath}/orders`);
  await expect(page.getByText("No orders yet")).toBeVisible();

  // Areas that aren't built say so plainly, with no controls and no dates.
  await page.goto(`${tenant.storePath}/posts`);
  await expect(page.getByText("Posts isn't available")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await page.goto(`${tenant.storePath}/apps`);
  await expect(
    page.getByRole("heading", { name: "Apps and integrations aren't available" }),
  ).toBeVisible();

  // One support entry point (DB-3): the account menu, through /support.
  await page.goto(tenant.storePath);
  await page.locator('button[aria-label^="Account menu"]:visible').first().click();
  await expect(page.getByRole("menuitem", { name: /Help and support/ })).toHaveAttribute(
    "href",
    "/support",
  );
  await page.keyboard.press("Escape");
  // Node doesn't resolve *.localhost names: ask localhost with the dashboard's Host.
  const target = new URL("/support", page.url());
  const host = target.host;
  target.hostname = "localhost";
  const support = await page.request.get(target.toString(), {
    headers: { host },
    maxRedirects: 0,
  });
  expect(support.status()).toBe(307);
  expect(support.headers()["location"]).toMatch(/^https?:\/\/.+/);
});
