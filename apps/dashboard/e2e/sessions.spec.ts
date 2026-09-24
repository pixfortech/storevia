import { expect, test } from "@playwright/test";
import { createTenant, signIn } from "./helpers";

test("unauthenticated visitors are sent to sign-in, keeping a safe return path", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/s/store_01j9zq3v4n8xkq2m7c5r6t8w9y/settings");
  await expect(page).toHaveURL(
    /\/sign-in\?next=%2Fs%2Fstore_01j9zq3v4n8xkq2m7c5r6t8w9y%2Fsettings/,
  );
  // Open-redirect attempts fall back to the dashboard home.
  await page.goto("/sign-in?next=https://evil.example");
  await expect(page.locator('input[name="next"]')).toHaveValue("https://evil.example");
});

test("an open redirect in ?next is neutralised after sign-in", async ({ page }) => {
  const tenant = await createTenant(page, "redirect");
  await page.getByRole("button", { name: "Account menu" }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
  const appHost = new URL(test.info().project.use.baseURL ?? "http://app.localhost:3001").host;
  for (const next of [
    "https://evil.example/steal",
    "/.//evil.example",
    "/%2e//evil.example",
    "/./\\evil.example",
  ]) {
    await signIn(page, tenant.email, next);
    expect(new URL(page.url()).host, next).toBe(appHost);
    await page.getByRole("button", { name: "Account menu" }).first().click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in/);
  }
});

test("signing out and revoking sessions end access", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageOne = await first.newPage();
  const pageTwo = await second.newPage();
  const tenant = await createTenant(pageOne, "sessions");
  await signIn(pageTwo, tenant.email);
  await pageTwo.goto(tenant.storePath);
  await expect(pageTwo).toHaveURL(new RegExp(tenant.storePath));

  // Revoke every other session from the first device.
  await pageOne.goto("/account/security");
  await expect(pageOne.getByTestId("session-row")).toHaveCount(2);
  await pageOne.getByRole("button", { name: "Sign out all other sessions" }).click();
  await expect(pageOne.getByText("Signed out 1 other session.")).toBeVisible();
  await pageTwo.goto(tenant.storePath);
  await expect(pageTwo).toHaveURL(/\/sign-in/);

  // Signing out ends the first session too.
  await pageOne.goto(tenant.storePath);
  await pageOne.getByRole("button", { name: "Account menu" }).first().click();
  await pageOne.getByRole("menuitem", { name: "Sign out" }).click();
  await pageOne.waitForURL(/\/sign-in/);
  await pageOne.goto(tenant.storePath);
  await expect(pageOne).toHaveURL(/\/sign-in/);
  await first.close();
  await second.close();
});
