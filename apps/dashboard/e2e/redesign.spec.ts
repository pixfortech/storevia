import { expect, test } from "@playwright/test";
import { createTenant, uniqueEmail } from "./helpers";

// The redesigned surfaces keep their promises: the store home shows only real
// data (composed for the business type), example data never reaches a
// production build, the shell never offers an action the plan can't allow,
// and keyboard users can reach the marketing menus and auth messages.

const SITE = process.env["E2E_MARKETING_URL"] ?? "http://localhost:3000";

test("the store home is composed for the business type and shows only real data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const tenant = await createTenant(page, "home", { businessType: "Blog or publication" });
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("heading", { name: "Get set up" })).toBeVisible();

  // Figures that aren't collected yet are listed once, in the publication's
  // words, and analytics (not in the default plan) says so.
  const tracking = page.getByTestId("dashboard-tracking");
  await expect(tracking).toContainText("Readers");
  await expect(tracking).not.toContainText("Revenue");
  await expect(tracking).toContainText("Not in your plan");

  // Production builds never show example figures, even when asked.
  await expect(page.getByText("Example data")).toHaveCount(0);
  await page.goto(`${tenant.storePath}?preview=example&range=7d`);
  await expect(main.getByRole("heading", { name: "Get set up" })).toBeVisible();
  await expect(page.getByText("Example data")).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: /period/i })).toHaveCount(0);
});

test("at the store limit the shell offers no create action and billing says what's built", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const tenant = await createTenant(page, "limit");

  // The default allowance is one store, now used.
  await page.locator('button[aria-label^="Switch store or organisation"]:visible').first().click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Store limit reached");
  await expect(menu.getByRole("menuitem", { name: "Create store" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto(`${tenant.orgPath}/billing`);
  await expect(page.getByRole("link", { name: "Create store" })).toHaveCount(0);
  // Plan features that aren't built yet carry their availability.
  await expect(page.getByText(/Coming in Milestone \d/).first()).toBeVisible();
  await expect(page.getByText("On the roadmap").first()).toBeVisible();
  await expect(page.getByTestId("payments-card").getByRole("button")).toHaveCount(0);
});

test("marketing mega-menus open and close from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(SITE);
  const header = page.getByRole("banner");
  // Each label is a real link; its chevron opens the panel.
  await expect(header.getByRole("link", { name: "Products", exact: true })).toBeVisible();
  const chevron = header.getByRole("button", { name: "Products menu" });
  await chevron.focus();
  await page.keyboard.press("Enter");
  await expect(chevron).toHaveAttribute("aria-expanded", "true");
  const panelLink = header.locator('a[href^="/products#"]:visible').first();
  await expect(panelLink).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chevron).toHaveAttribute("aria-expanded", "false");
  await expect(chevron).toBeFocused();
});

test("auth forms move focus to what needs attention", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // Empty submit: the first invalid field takes focus and says why.
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();
  const email = page.getByLabel("Email");
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");

  // A server error takes focus, so it is announced and Tab continues from it.
  await email.fill(uniqueEmail("nobody"));
  await page.getByLabel("Password").fill("not the right password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(":focus")).toContainText("Email or password is incorrect.");

  // The reset-link confirmation replaces the form and takes focus.
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(uniqueEmail("forgot"));
  await page.getByRole("button", { name: "Send reset link" }).click();
  const sent = page.getByRole("heading", { level: 1, name: "Check your inbox" });
  await expect(sent).toBeFocused();
  await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Email")).toBeFocused();
});
