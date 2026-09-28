import { expect, test } from "@playwright/test";
import {
  confirmDashboardPassword,
  createTenant,
  PASSWORD,
  signIn,
  signUpAndVerify,
  uniqueEmail,
} from "./helpers";

// Data lifecycle (M8): the owner's export (stepped up), organisation deletion
// with its cooling-off and cancel, and a user deleting their own account.

test("the owner exports all data after confirming their password", async ({ page }) => {
  const tenant = await createTenant(page, "export");
  await page.goto(`${tenant.orgPath}/settings`);
  // Without a recent password: back to settings with the reason.
  await page.getByRole("button", { name: "Export all data" }).click();
  await expect(page.getByText("Confirm your password first")).toBeVisible();

  await confirmDashboardPassword(page, `${tenant.orgPath}/settings`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^storevia-export-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  const { readFile } = await import("node:fs/promises");
  const doc = JSON.parse(await readFile(path, "utf8")) as {
    format: string;
    members: { user: { email: string } }[];
    stores: unknown[];
  };
  expect(doc.format).toBe("storevia-export");
  expect(doc.members.map((m) => m.user.email)).toContain(tenant.email);
  expect(doc.stores).toHaveLength(1);
});

test("deleting an organisation closes it at once; the owner can cancel", async ({ page }) => {
  const tenant = await createTenant(page, "deleteorg");
  await confirmDashboardPassword(page, `${tenant.orgPath}/settings`);
  await page.getByRole("button", { name: "Delete organisation" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel(/Type .* to confirm/).fill("not the name");
  await dialog.getByRole("button", { name: "Delete organisation" }).click();
  await expect(dialog.getByText("Type the organisation's name exactly as shown.")).toBeVisible();
  await dialog.getByLabel(/Type .* to confirm/).fill("Business deleteorg");
  await dialog.getByRole("button", { name: "Delete organisation" }).click();

  await page.waitForURL(/\/account\/security/);
  const pending = page.getByTestId("pending-deletion");
  await expect(pending).toContainText("Business deleteorg");
  // Closed: its pages are gone.
  expect((await page.goto(tenant.storePath))?.status()).toBe(404);

  await page.goto("/account/security");
  await page.getByRole("button", { name: /Cancel deletion/ }).click();
  // Back in the organisation.
  await page.waitForURL((url) => url.pathname === tenant.orgPath);
  expect((await page.goto(tenant.storePath))?.status()).toBe(200);
});

test("a user deletes their own account; an owner can't until they hand over", async ({ page }) => {
  const tenant = await createTenant(page, "selfdelete");
  await page.goto("/account/security#delete-account");
  await page.getByLabel(`Type ${tenant.email} to confirm`).fill(tenant.email);
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText(/You own an organisation/)).toBeVisible();

  // A user without an organisation.
  const email = uniqueEmail("leaver");
  await page.context().clearCookies();
  await signUpAndVerify(page, "Lee Leaver", email);
  await signIn(page, email);
  await page.goto("/account/security#delete-account");
  await page.getByLabel(`Type ${email} to confirm`).fill(email);
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL(/\/sign-in\?deleted=1/);
  await expect(page.getByText("Account deleted")).toBeVisible();
  // The old password opens nothing.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("alert").first()).toBeVisible();
});
