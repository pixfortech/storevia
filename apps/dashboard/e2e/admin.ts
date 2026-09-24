import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { PASSWORD, signUpAndVerify, uniqueEmail } from "./helpers";

// Platform-admin helpers (ADR-0022). Staff accounts are ordinary users that
// operations grants PlatformStaff to (the application roles can't write that
// table, so the arrangement uses the schema owner, as operations would).

export const ADMIN_URL = process.env["E2E_ADMIN_URL"] ?? "http://admin.localhost:3003";

type StaffRole = "SUPER_ADMIN" | "BILLING" | "OPERATIONS" | "SUPPORT" | "READ_ONLY";

export async function grantPlatformRole(email: string, role: StaffRole): Promise<void> {
  const url = process.env["DATABASE_MIGRATOR_URL"];
  if (!url) throw new Error("DATABASE_MIGRATOR_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO "PlatformStaff" ("userId", role, "updatedAt")
       SELECT id, $2::"PlatformRole", now() FROM "User" WHERE email = $1
       ON CONFLICT ("userId") DO UPDATE SET role = EXCLUDED.role, active = true, "updatedAt" = now()`,
      [email, role],
    );
    if (result.rowCount !== 1) throw new Error(`no user ${email}`);
  } finally {
    await client.end();
  }
}

/** Creates a verified user through the dashboard, then grants a platform role. */
export async function createStaff(browser: Browser, role: StaffRole): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(`staff-${role.toLowerCase()}`);
  await signUpAndVerify(page, `Staff ${role}`, email);
  await context.close();
  await grantPlatformRole(email, role);
  return email;
}

export async function adminSignIn(page: Page, email: string): Promise<void> {
  await page.goto(`${ADMIN_URL}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${ADMIN_URL}/organisations`);
}

/** Step-up: confirm the password on the account page. */
export async function confirmPassword(page: Page): Promise<void> {
  await page.goto(`${ADMIN_URL}/account`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Confirm password" }).click();
  await expect(page.getByText("Confirmed. For the next 10 minutes")).toBeVisible();
}

let billingStaff: string | undefined;

/** A signed-in, stepped-up BILLING staff member (created once per run). */
export async function staffSession(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  billingStaff ??= await createStaff(browser, "BILLING");
  const context = await browser.newContext();
  const page = await context.newPage();
  await adminSignIn(page, billingStaff);
  await confirmPassword(page);
  return { context, page };
}

/** Opens an action dialog on the organisation page and submits it. */
export async function submitDialog(
  page: Page,
  trigger: string,
  fields: { plan?: string; reason: string },
  submit: string,
): Promise<void> {
  await page.getByTestId(trigger).click();
  const dialog = page.getByRole("dialog");
  if (fields.plan) await dialog.getByLabel("Plan", { exact: true }).selectOption(fields.plan);
  await dialog.getByLabel("Reason").fill(fields.reason);
  // High-risk actions need an explicit acknowledgement before submitting.
  const acknowledge = dialog.getByLabel("I understand the consequence for this merchant.");
  if ((await acknowledge.count()) > 0) {
    await expect(dialog.getByRole("button", { name: submit })).toBeDisabled();
    await acknowledge.check();
  }
  await dialog.getByRole("button", { name: submit }).click();
}

/** Gives an organisation a plan through platform-admin (the real staff path). */
export async function grantPlan(browser: Browser, orgId: string, plan = "business"): Promise<void> {
  const { context, page } = await staffSession(browser);
  await page.goto(`${ADMIN_URL}/organisations/${orgId}`);
  await submitDialog(page, "assign-plan", { plan, reason: "E2E fixture" }, "Assign plan");
  await expect(page.getByTestId("subscription-status")).toHaveText("Active");
  await context.close();
}
