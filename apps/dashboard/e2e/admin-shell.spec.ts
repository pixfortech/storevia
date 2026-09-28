import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  adminSignIn,
  confirmPassword,
  createStaff,
  grantPlan,
  staffSession,
} from "./admin";
import { createTenant, PASSWORD } from "./helpers";

// Platform-admin is visibly internal, shows risk at a glance, gates
// high-risk actions and works on a phone (ADR-0022, ADR-0023).

test("internal chrome, job health and a readable risk summary", async ({ page, browser }) => {
  const tenant = await createTenant(page, "adminshell");
  await grantPlan(browser, tenant.orgId);
  const { context, page: staff } = await staffSession(browser);
  await staff.goto(`${ADMIN_URL}/organisations/${tenant.orgId}`);
  await expect(staff.getByTestId("environment")).toContainText("environment");
  await expect(staff.getByTestId("risk-summary")).toContainText("Nothing needs attention");
  await expect(staff.getByTestId("entitlement-media_storage")).toContainText("GB");

  // High-risk actions are acknowledged before they can be submitted.
  await staff.getByTestId("expire").click();
  const dialog = staff.getByRole("dialog");
  await expect(dialog.getByText("High-risk action")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Expire now" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close" }).click();

  await staff.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Jobs" }).click();
  await expect(staff.getByRole("heading", { name: "Background jobs" })).toBeVisible();
  await expect(staff.getByRole("button")).toHaveCount(1); // Sign out only: read-only page.

  // The audit log (M8): this organisation's plan grant is there, read-only.
  await staff.goto(`${ADMIN_URL}/organisations/${tenant.orgId}`);
  await staff.getByRole("link", { name: "its audit log" }).click();
  await expect(staff.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(staff.getByTestId("audit-row").first()).toBeVisible();
  await expect(
    staff.getByTestId("audit-row").filter({ hasText: "billing." }).first(),
  ).toBeVisible();
  await expect(staff.getByTestId("audit-card")).not.toContainText(tenant.email);

  // Phones get cards, not a squeezed table.
  await staff.setViewportSize({ width: 390, height: 844 });
  await staff.goto(`${ADMIN_URL}/organisations/${tenant.orgId}`);
  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(staff.getByTestId("history-row-mobile").first()).toBeVisible();
  await context.close();
});

test("staff without audit access don't get the jobs view", async ({ browser }) => {
  const email = await createStaff(browser, "READ_ONLY");
  const context = await browser.newContext();
  const page = await context.newPage();
  await adminSignIn(page, email);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Jobs" }),
  ).toHaveCount(0);
  await page.goto(`${ADMIN_URL}/jobs`);
  await expect(page.getByText("You can't view background jobs")).toBeVisible();
  await page.goto(`${ADMIN_URL}/audit`);
  await expect(page.getByText("You can't view the audit log")).toBeVisible();
  await expect(page.getByTestId("audit-row")).toHaveCount(0);
  await context.close();
});

test("a staff sign-in opens nothing until its second factor (M8)", async ({ browser }) => {
  const email = await createStaff(browser, "SUPPORT");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ADMIN_URL}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/mfa/);
  await expect(page.getByRole("heading", { name: "Set up two-step verification" })).toBeVisible();
  // Password alone opens no admin page.
  await page.goto(`${ADMIN_URL}/organisations`);
  await expect(page).toHaveURL(/\/mfa/);
  await expect(page.getByRole("heading", { name: "Set up two-step verification" })).toBeVisible();
  await page.getByLabel("Code from your app").fill("000000");
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page.getByText("That code didn't match.").first()).toBeVisible();
  await context.close();
  // With an authenticator (the helper enrols one), the same account gets in.
  const signedIn = await browser.newContext();
  const staffPage = await signedIn.newPage();
  await adminSignIn(staffPage, email);
  await expect(staffPage).toHaveURL(`${ADMIN_URL}/organisations`);
  await signedIn.close();
});

test("operations staff suspend and restore an organisation (M8)", async ({ page, browser }) => {
  const tenant = await createTenant(page, "suspendme");
  const email = await createStaff(browser, "OPERATIONS");
  const context = await browser.newContext();
  const staff = await context.newPage();
  await adminSignIn(staff, email);
  await confirmPassword(staff);
  await staff.goto(`${ADMIN_URL}/organisations/${tenant.orgId}`);
  await expect(staff.getByTestId("support-store")).toHaveCount(1);
  // A new store is a draft: its storefront says "coming soon".
  await expect(staff.getByTestId("support-store").first()).toContainText("Coming soon");

  await staff.getByTestId("suspend-organisation").click();
  const dialog = staff.getByRole("dialog");
  await dialog.getByLabel(/Type .* to confirm/).fill("Business suspendme");
  await dialog.getByLabel("Reason").fill("Phishing report confirmed by trust and safety");
  const submit = dialog.getByRole("button", { name: "Suspend organisation" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("I understand the consequence for this merchant.").check();
  await submit.click();
  // The row turns into "Restore" and every storefront is offline.
  await expect(staff.getByTestId("restore-organisation")).toBeVisible();
  await expect(staff.getByTestId("support-store").first()).toContainText("Offline");

  // The merchant can't open it while suspended.
  expect((await page.goto(tenant.orgPath))?.status()).toBe(404);

  await staff.getByTestId("restore-organisation").click();
  const restore = staff.getByRole("dialog");
  await restore.getByLabel(/Type .* to confirm/).fill("Business suspendme");
  await restore.getByLabel("Reason").fill("Report withdrawn after review");
  await restore.getByRole("button", { name: "Restore organisation" }).click();
  await expect(staff.getByTestId("suspend-organisation")).toBeVisible();
  await expect(staff.getByTestId("support-store").first()).toContainText("Coming soon");
  expect((await page.goto(tenant.orgPath))?.status()).toBe(200);
  await context.close();
});
