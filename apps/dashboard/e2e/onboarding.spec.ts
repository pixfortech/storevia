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
    "Analytics",
    "Settings",
  ]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
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

  // Placeholders are clearly marked and have no controls.
  await page.goto(`${tenant.storePath}/orders`);
  await expect(page.getByText("Orders is coming in Milestone 6")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});
