import { expect, test } from "@playwright/test";
import { PASSWORD, createTenant, signIn, tokenFromEmail, uniqueEmail } from "./helpers";

// Account profile (DB-4): the signed-in merchant's name and email address.

test("a merchant renames themselves and moves to a new email via the link sent there", async ({
  page,
}) => {
  const tenant = await createTenant(page, "profile");

  // Name: validated, trimmed, and shown in the shell once saved.
  await page.getByRole("button", { name: "Account menu" }).first().click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await page.waitForURL(/\/account\/profile$/);
  await page.getByLabel("Your name").fill("   ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await page.getByLabel("Your name").fill("  Asha   Rao ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Asha Rao");
  await page.goto(tenant.storePath);
  await expect(page.getByRole("button", { name: "Account menu: Asha Rao" }).first()).toBeVisible();

  // Email: the password confirms it's you, then a link goes to the new address.
  await page.goto("/account/profile");
  const newEmail = uniqueEmail("profile-new");
  await page.getByLabel("New email address").fill(newEmail);
  await page.getByLabel("Your password").fill("not my password");
  await page.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(page.getByText("That password is incorrect.")).toBeVisible();
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send confirmation link" }).click();
  const pending = page.getByTestId("pending-email-change");
  await expect(pending).toContainText(newEmail);
  await expect(pending).toContainText(tenant.email);
  // Nothing has changed yet, even after a reload.
  await page.reload();
  await expect(page.getByTestId("pending-email-change")).toContainText(newEmail);
  await expect(page.getByText(`Asha Rao · ${tenant.email}`)).toBeVisible();

  // The link lands on a confirmation page; opening it changes nothing by itself.
  const token = await tokenFromEmail(newEmail, "confirm-email-change");
  const link = `/confirm-email-change?token=${encodeURIComponent(token)}`;
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Confirm your new email" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(page.getByRole("heading", { name: "Your email address has changed" })).toBeVisible();

  // The old address is told (with the new one masked), and the link works once.
  const masked = await tokenFromEmail(tenant.email, "email-changed", /changed to (\S+?)\.\s/);
  expect(masked).toContain("•••@example.test");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link can't be used" })).toBeVisible();

  // This session stays signed in and shows the new address.
  await page.goto("/account/profile");
  await expect(page.getByText(`Asha Rao · ${newEmail}`)).toBeVisible();
  await expect(page.getByTestId("pending-email-change")).toHaveCount(0);

  // The new address signs in; the old one no longer does.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
  await page.getByLabel("Email").fill(tenant.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await signIn(page, newEmail);
  await page.goto(tenant.storePath);
  await expect(page).toHaveURL(new RegExp(tenant.storePath));
});
