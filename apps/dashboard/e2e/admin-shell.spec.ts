import { expect, test } from "@playwright/test";
import { ADMIN_URL, adminSignIn, createStaff, grantPlan, staffSession } from "./admin";
import { createTenant } from "./helpers";

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
  await context.close();
});
