// Plans, entitlements and billing across both apps (ADR-0022): staff assign
// plans in platform-admin, merchants see them (read-only) in the dashboard,
// limits hold against crafted requests, merchants never reach the platform
// surface, and mock billing flows through the real webhook pipeline.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_URL, adminSignIn, confirmPassword, createStaff, submitDialog } from "./admin";
import {
  captureServerAction,
  createTenant,
  PASSWORD,
  replay,
  signIn,
  signUpAndVerify,
  uniqueEmail,
  type Tenant,
} from "./helpers";

test.describe.configure({ mode: "serial" });

let merchantContext: BrowserContext;
let staffContext: BrowserContext;
let merchant: Page;
let staff: Page;
let A: Tenant;
let staffEmail: string;

const adminOrg = () => `${ADMIN_URL}/organisations/${A.orgId}`;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  merchantContext = await browser.newContext();
  merchant = await merchantContext.newPage();
  A = await createTenant(merchant, "billing");
  staffEmail = await createStaff(browser, "BILLING");
  staffContext = await browser.newContext();
  staff = await staffContext.newPage();
});

test.afterAll(async () => {
  await merchantContext.close();
  await staffContext.close();
});

test("a new organisation runs on the system default: one store, shown read-only", async () => {
  await merchant.goto(`${A.orgPath}/billing`);
  await expect(merchant.getByTestId("plan-card")).toContainText("No plan");
  await expect(merchant.getByTestId("usage-store_count")).toContainText("1 of 1");
  // No fake payment controls: no buttons at all in the payments region.
  await expect(merchant.getByTestId("payments-card").getByRole("button")).toHaveCount(0);
  await expect(merchant.getByTestId("payments-card")).toContainText(
    "Online payments aren't available yet",
  );

  await merchant.goto(`${A.orgPath}/stores/new`);
  await expect(merchant.getByText("Your plan's store limit has been reached")).toBeVisible();
});

test("the store limit holds against crafted create-store requests", async ({ browser }) => {
  // Tenant C: capture its (successful) create-store action while it has a free slot.
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail("billing-crafted");
  await signUpAndVerify(page, "Casey Crafted", email);
  await signIn(page, email);
  await page.getByLabel("Business name").fill("Crafted Co");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/o\/org_[^/]+\/stores\/new/);
  const orgC = /\/o\/(org_[^/]+)/.exec(page.url())?.[1] ?? "";
  const slug = `crafted-${Date.now().toString(36)}`;
  await page.getByLabel("Store name").fill("Crafted store");
  await page.getByLabel("Store address").fill(slug);
  const captured = await captureServerAction(page, async () => {
    await page.getByRole("button", { name: "Create store" }).click();
  });
  await page.waitForURL(/\/s\/store_[^/?]+/);

  // Replayed with a new address: the organisation is now at its limit.
  const again = await replay(context, captured, (body) => body.replaceAll(slug, `${slug}-2`));
  expect(again.text).toContain("Your plan's limit for stores (1) has been reached.");

  // Replayed into tenant A (also full) with A's own cookies and org ID.
  const intoA = await replay(merchantContext, captured, (body) =>
    body.replaceAll(orgC, A.orgId).replaceAll(slug, `${slug}-3`),
  );
  expect(intoA.text).toContain("Your plan's limit for stores (1) has been reached.");

  await page.goto(`/o/${orgC}`);
  await expect(page.getByText(`${slug}-2`)).toHaveCount(0);
  await context.close();
});

test("merchants cannot reach the platform surface, even as owners", async ({ browser }) => {
  // The dashboard session cookie is not valid on the admin host.
  await merchant.goto(`${ADMIN_URL}/organisations`);
  await expect(merchant).toHaveURL(/\/sign-in/);
  // Merchant credentials don't open a platform session.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ADMIN_URL}/sign-in`);
  await page.getByLabel("Email").fill(A.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await context.close();
  // There is no plan-changing route in the dashboard.
  const response = await merchant.goto(`${A.orgPath}/billing/change`);
  expect(response?.status()).toBe(404);
});

test("staff changes need a recent password confirmation", async () => {
  await adminSignIn(staff, staffEmail);
  await staff.goto(adminOrg());
  await submitDialog(staff, "assign-plan", { plan: "business", reason: "Pilot" }, "Assign plan");
  await expect(staff.getByRole("dialog")).toContainText(
    "Confirm your password to make billing changes.",
  );
  await staff.keyboard.press("Escape");
});

test("staff assign a plan; the merchant sees it and can use the new limit", async () => {
  await confirmPassword(staff);
  await staff.goto(adminOrg());
  await submitDialog(staff, "assign-plan", { plan: "", reason: "" }, "Assign plan").catch(
    () => undefined,
  );
  // Missing reason is rejected.
  await expect(staff.getByRole("dialog")).toContainText("Give a reason");
  await staff.keyboard.press("Escape");

  await submitDialog(
    staff,
    "assign-plan",
    { plan: "business", reason: "Pilot contract signed" },
    "Assign plan",
  );
  await expect(staff.getByTestId("subscription-status")).toHaveText("Active");
  await expect(staff.getByTestId("subscription-source")).toHaveText("Manual");
  await expect(staff.getByTestId("subscription-plan")).toHaveText("Business");
  await expect(staff.getByTestId("history-row").first()).toContainText("Pilot contract signed");

  await merchant.goto(`${A.orgPath}/billing`);
  await expect(merchant.getByTestId("plan-card")).toContainText("Business");
  await expect(merchant.getByTestId("plan-card")).toContainText("Managed by Storevia");
  await expect(merchant.getByTestId("usage-store_count")).toContainText("1 of 3");

  await merchant.goto(`${A.orgPath}/stores/new`);
  await merchant.getByLabel("Store name").fill(`Second ${Date.now().toString(36)}`);
  await merchant.getByRole("button", { name: "Create store" }).click();
  await merchant.waitForURL(/\/s\/store_[^/?]+/);
});

test("a crafted replay of a staff action with merchant cookies changes nothing", async ({
  browser,
}) => {
  await staff.goto(adminOrg());
  const captured = await captureServerAction(staff, async () => {
    await submitDialog(
      staff,
      "change-plan",
      { plan: "enterprise", reason: "Upgrade" },
      "Save changes",
    );
  });
  await expect(staff.getByTestId("subscription-plan")).toHaveText("Enterprise");

  // The merchant's browser context holds only dashboard cookies.
  const attacker = await browser.newContext();
  await attacker.addCookies(await merchantContext.cookies());
  const result = await replay(attacker, captured);
  expect([303, 307, 308]).toContain(result.status); // redirected to sign-in by the proxy
  await attacker.close();
  await staff.reload();
  await expect(staff.getByTestId("history-row")).toHaveCount(2);
});

test("a downgrade keeps data, marks over-limit and blocks new stores", async () => {
  await staff.goto(adminOrg());
  await submitDialog(
    staff,
    "change-plan",
    { plan: "starter", reason: "Customer downgraded" },
    "Save changes",
  );
  const dialog = staff.getByRole("dialog");
  await expect(dialog).toContainText("over its limit for stores (2 of 1)");
  await dialog.getByLabel(/I understand/).check();
  await dialog.getByLabel("Reason").fill("Customer downgraded");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(staff.getByTestId("subscription-plan")).toHaveText("Starter");
  await expect(staff.getByTestId("usage-store_count")).toContainText("Over limit");

  await merchant.goto(`${A.orgPath}/billing`);
  await expect(merchant.getByText("You're over your plan's limits")).toBeVisible();
  await merchant.goto(A.storePath);
  await expect(merchant.getByRole("heading", { level: 1 })).toBeVisible(); // stores keep working
  await merchant.goto(`${A.orgPath}/stores/new`);
  await expect(merchant.getByText("Your plan's store limit has been reached")).toBeVisible();
});

test("an override takes precedence over the plan", async () => {
  await staff.goto(adminOrg());
  await staff.getByTestId("add-override").click();
  const dialog = staff.getByRole("dialog");
  await dialog.getByLabel("Feature").selectOption("store_count");
  await dialog.getByLabel("Value").selectOption("limit");
  await dialog.getByLabel("Limit", { exact: true }).fill("5");
  await dialog.getByLabel("Reason").fill("Enterprise pilot exception");
  await dialog.getByRole("button", { name: "Save override" }).click();
  await expect(staff.getByTestId("override-row")).toContainText("Limit 5");
  await expect(staff.getByTestId("entitlement-store_count")).toContainText("Override");

  await merchant.goto(`${A.orgPath}/billing`);
  await expect(merchant.getByTestId("usage-store_count")).toContainText("2 of 5");
});

test("mock billing events flow through the webhook pipeline", async () => {
  await staff.goto(adminOrg());
  await submitDialog(staff, "expire", { reason: "Switching to test billing" }, "Expire now");
  await expect(staff.getByTestId("subscription-card")).toContainText("No live subscription");

  const form = staff.getByTestId("simulation-form");
  await form.getByLabel("Event").selectOption("created");
  await form.getByLabel(/^Plan/).selectOption("business");
  await form.getByLabel("Reason").fill("E2E simulation");
  await form.getByRole("button", { name: "Send event" }).click();
  await expect(form).toContainText("Webhook processed");
  await expect(staff.getByTestId("subscription-source")).toHaveText("Mock billing");

  await form.getByLabel("Event").selectOption("past_due");
  await form.getByLabel("Reason").fill("E2E simulation");
  await form.getByRole("button", { name: "Send event" }).click();
  await expect(staff.getByTestId("subscription-status")).toHaveText("Past due");
  await merchant.goto(`${A.orgPath}/billing`);
  await expect(merchant.getByText("Payment is overdue")).toBeVisible();
  await expect(merchant.getByTestId("plan-card")).toContainText("Test billing");

  for (const [kind, expected] of [
    ["duplicate", "Webhook duplicate"],
    ["invalid_signature", "Webhook rejected (invalid_signature)"],
    ["replayed", "Webhook rejected (stale_signature)"],
    ["out_of_order", "Webhook ignored (stale)"],
  ] as const) {
    await form.getByLabel("Event").selectOption(kind);
    await form.getByLabel("Reason").fill("E2E simulation");
    await form.getByRole("button", { name: "Send event" }).click();
    await expect(form, kind).toContainText(expected);
  }
  await expect(staff.getByTestId("subscription-status")).toHaveText("Past due");
});

test("the webhook endpoint verifies signatures and hides disabled providers", async ({
  request,
}) => {
  const post = (provider: string, body: string, headers: Record<string, string> = {}) =>
    request.post(`http://localhost:3001/api/webhooks/billing/${provider}`, {
      headers: { host: "app.localhost:3001", "content-type": "application/json", ...headers },
      data: body,
    });
  const unsigned = await post("mock", JSON.stringify({ id: "mock_evt_attack-0001" }));
  expect(unsigned.status()).toBe(400);
  const forged = await post("mock", "{}", {
    "storevia-mock-signature": `t=${String(Math.floor(Date.now() / 1000))},v1=${"0".repeat(64)}`,
  });
  expect(forged.status()).toBe(400);
  expect((await post("stripe", "{}")).status()).toBe(404);
  expect((await post("razorpay", "{}")).status()).toBe(404);
});
