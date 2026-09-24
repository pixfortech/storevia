import { expect, test } from "@playwright/test";
import pg from "pg";
import { tokenFromEmail, uniqueEmail } from "./helpers";

// Public marketing site (ADR-0025): honest navigation, pricing straight from
// the plan catalogue, a working contact form and layouts for every screen.

const SITE = process.env["E2E_MARKETING_URL"] ?? "http://localhost:3000";
const APP = process.env["E2E_BASE_URL"] ?? "http://app.localhost:3001";
const PAGES = ["/", "/products", "/solutions", "/pricing", "/resources", "/about", "/contact"];

interface PlanRow {
  name: string;
  monthly: string | null;
}

async function publicPlans(): Promise<PlanRow[]> {
  const url = process.env["DATABASE_MIGRATOR_URL"];
  if (!url) throw new Error("DATABASE_MIGRATOR_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<PlanRow>(`
      SELECT p.name,
             (SELECT pp.amount::text FROM "PlanPrice" pp
               WHERE pp."planId" = p.id AND pp.interval = 'MONTH' AND pp.active LIMIT 1) AS monthly
      FROM "Plan" p WHERE p."isPublic" AND p.status = 'ACTIVE' ORDER BY p."sortOrder", p.key`);
    return rows;
  } finally {
    await client.end();
  }
}

test("navigation, entry points into the product and security headers", async ({ page }) => {
  const response = await page.goto(SITE);
  expect(response?.headers()["content-security-policy"]).toContain("nonce-");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  const main = page.getByRole("navigation", { name: "Main" });
  for (const label of ["Products", "Solutions", "Pricing", "Resources", "Company"]) {
    await expect(main.getByRole("link", { name: label })).toBeVisible();
  }
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: "Start free" })).toHaveAttribute(
    "href",
    `${APP}/sign-up`,
  );
  await expect(banner.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    `${APP}/sign-in`,
  );
  // The future point-of-sale section is labelled as such.
  await expect(page.getByRole("heading", { name: "Selling in person too?" })).toBeVisible();
  await expect(page.locator("#retail-heading").locator("..")).toContainText("Future");
  for (const path of ["/legal/privacy", "/legal/terms"]) {
    await page.goto(`${SITE}${path}`);
    await expect(page.getByText("is not a legal agreement")).toBeVisible();
  }
});

test("pricing shows exactly the public plans and prices from the catalogue", async ({ page }) => {
  const plans = await publicPlans();
  expect(plans.length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${SITE}/pricing`);
  const cards = page
    .getByTestId("plan-cards")
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { level: 3 }),
    });
  // Free allowance + every public plan, in catalogue order.
  await expect(cards.getByRole("heading", { level: 3 })).toHaveText([
    "Free",
    ...plans.map((p) => p.name),
  ]);
  for (const plan of plans) {
    const card = cards.filter({ has: page.getByRole("heading", { name: plan.name, exact: true }) });
    if (plan.monthly) {
      const dollars = `$${(Number(plan.monthly) / 100).toLocaleString("en-US")}`;
      await expect(card).toContainText(dollars);
    } else {
      await expect(card).toContainText("Priced by agreement");
    }
    // No checkout exists: paid plans lead to a conversation, never a payment form.
    await expect(card.getByRole("link", { name: "Talk to us" })).toHaveAttribute(
      "href",
      /\/contact\?topic=plans/,
    );
  }
  await expect(page.getByTestId("comparison-table")).toBeVisible();
  await expect(page.getByTestId("comparison-table")).toContainText("On the roadmap");
  await expect(page.getByRole("button", { name: /buy|checkout|subscribe|pay/i })).toHaveCount(0);
});

test("the contact form delivers a message to the Storevia inbox", async ({ page }) => {
  const email = uniqueEmail("contact");
  await page.goto(`${SITE}/contact?topic=plans&plan=Business`);
  await expect(page.getByLabel("Message")).toHaveValue(/Business plan/);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByLabel("Your name")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Your name").fill("Ana Example");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("your message is on its way")).toBeVisible();
  const inbox = process.env["CONTACT_INBOX"] ?? "hello@storevia.test";
  const token = await tokenFromEmail(
    inbox,
    "contact-request",
    new RegExp(`Reply directly to (${email})`),
  );
  expect(token).toBe(email);
});

test.describe("responsive marketing layouts", () => {
  test("phones get a menu sheet, stacked pricing and no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of PAGES) {
      await page.goto(`${SITE}${path}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.goto(`${SITE}/pricing`);
    await expect(page.getByTestId("comparison-table")).toBeHidden();
    await expect(page.getByText("Free: every feature")).toBeVisible();
    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await sheet.getByRole("link", { name: "Solutions" }).click();
    await page.waitForURL(`${SITE}/solutions`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("tablet uses the menu sheet and the full comparison table", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(`${SITE}/pricing`);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.getByTestId("comparison-table")).toBeVisible();
  });
});
