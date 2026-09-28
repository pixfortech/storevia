import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { addRate, addZone, setUpStore } from "./checkout-helpers";
import { createTenant, type Tenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// The shopper's checkout, step by step in a real browser at desktop, tablet
// and phone widths (M6 functional review): each step persists on Continue,
// a failed step keeps what was typed and its errors clear once corrected,
// billing defaults to the shipping address (a separate one is saved on its
// own), shipping methods come from the server and totals follow shipping and
// the discount. Payment goes through the Test Payment Provider; no real
// money moves.

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
] as const;

const EMAIL = "govind.the.lohia.2026@gmail.com";
const SAME_BILLING = "Billing address is the same as shipping address";

/**
 * Puts the tenant's organisation on the Business plan (discount codes are a
 * plan feature). Arranged with the schema owner, as operations would, like
 * the platform staff in admin.ts; the plan change itself is tested in
 * billing.spec.ts.
 */
async function onBusinessPlan(email: string): Promise<void> {
  const url = process.env["DATABASE_MIGRATOR_URL"];
  if (!url) throw new Error("DATABASE_MIGRATOR_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const org = `(SELECT m."organisationId" FROM "Membership" m JOIN "User" u ON u.id = m."userId"
      WHERE u.email = $1 AND m.role = 'OWNER' LIMIT 1)`;
    const plan = `(SELECT id FROM "Plan" WHERE key = 'business')`;
    const updated = await client.query(
      `UPDATE "Subscription" SET "planId" = ${plan}, status = 'ACTIVE', "updatedAt" = now()
       WHERE "organisationId" = ${org} AND "endedAt" IS NULL`,
      [email],
    );
    if (updated.rowCount === 0) {
      await client.query(
        `INSERT INTO "Subscription" (id, "organisationId", "planId", status, source, "startedAt", "updatedAt")
         VALUES (gen_random_uuid(), ${org}, ${plan}, 'ACTIVE', 'MANUAL', now(), now())`,
        [email],
      );
    }
  } finally {
    await client.end();
  }
}

async function setUp(page: Page): Promise<{ tenant: Tenant; origin: string }> {
  const tenant = await createTenant(page, "checkout-flow");
  await onBusinessPlan(tenant.email);
  await addProduct(page, tenant, "Stoneware mug", "999.50", "20");
  await setUpStore(page, tenant);
  // A 10% code, created through the dashboard.
  await page.goto(`${tenant.storePath}/marketing`);
  await page.getByRole("button", { name: "Create code" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Code").fill("SAVE10");
  await dialog.getByLabel("Title").fill("Ten percent");
  await dialog.getByLabel("Percentage off").fill("10");
  await dialog.getByRole("button", { name: "Create code" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("SAVE10").first()).toBeVisible();
  return { tenant, origin: await storefrontOrigin(page, tenant) };
}

/** Product page → cart → checkout, in a fresh browser at `viewport`. */
async function toCheckout(browser: Browser, origin: string, viewport: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const shop = await context.newPage();
  await expect
    .poll(
      async () => (await fetchStore(context.request, origin, "/products/stoneware-mug")).status,
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(200);
  await shop.goto(`${origin}/products/stoneware-mug`);
  await shop.getByRole("button", { name: "Add to cart" }).click();
  await shop.waitForURL(/\/cart$/);
  await shop.getByRole("button", { name: "Check out" }).click();
  await shop.waitForURL(/\/checkout$/);
  return { context, shop };
}

const fieldErrors = (shop: Page) => shop.locator(".sv-field-error:visible");

/** Contact, with a failed attempt first: the error clears once corrected. */
async function contact(shop: Page) {
  // The address step waits for the email, so nothing typed there can be lost.
  await expect(shop.getByText("Add your email address to continue.")).toBeVisible();
  await shop.locator("#contact").getByRole("button", { name: "Continue" }).click();
  await shop.waitForURL(/step=contact&f=/);
  await expect(shop.getByText("Enter your email address.")).toBeVisible();
  await expect(shop.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");

  await shop.getByLabel("Email").fill(EMAIL);
  await shop.locator("#contact").getByRole("button", { name: "Continue" }).click();
  await expect(shop.getByRole("button", { name: "Update email" })).toBeVisible();
  await expect(shop.getByLabel("Email")).toHaveValue(EMAIL);
  await expect(fieldErrors(shop)).toHaveCount(0);
  // Saved, not just shown: a reload still has it and no stale error.
  await shop.reload();
  await expect(shop.getByLabel("Email")).toHaveValue(EMAIL);
  await expect(fieldErrors(shop)).toHaveCount(0);
}

async function shippingAddress(shop: Page, city: string) {
  const form = shop.locator("#address");
  await form.locator("#ship_firstName").fill("Govind");
  await form.locator("#ship_lastName").fill("Lohia");
  await form.locator("#ship_line1").fill("7 Park Street");
  await form.locator("#ship_postalCode").fill("700016");
  await form.locator("#ship_region").selectOption({ label: "West Bengal" });
  if (city) await form.locator("#ship_city").fill(city);
}

/** Shipping method, discount and payment through the test provider. */
async function shipDiscountPay(shop: Page, total: string) {
  // Methods come from the server's rules for the saved address.
  const options = shop.locator(".sv-option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("Standard");
  await expect(options.first()).toContainText("50.00");
  await expect(shop.locator(".sv-summary-total")).toContainText("999.50");
  await shop.getByRole("radio", { name: /Standard/ }).check();
  await shop.getByRole("button", { name: "Use this method" }).click();
  await expect(shop.getByRole("button", { name: "Update shipping" })).toBeVisible();
  await expect(shop.getByRole("radio", { name: /Standard/ })).toBeChecked();
  await expect(shop.locator(".sv-summary-totals")).toContainText("Shipping (Standard)");
  await expect(shop.locator(".sv-summary-total")).toContainText("1,049.50");

  // A wrong code is refused and its error clears when a valid one is applied.
  await shop.getByRole("textbox", { name: "Discount code" }).fill("NOPE");
  await shop.getByRole("button", { name: "Apply" }).click();
  await shop.waitForURL(/step=discount&f=/);
  await expect(shop.getByText("That code isn't valid.")).toBeVisible();
  await expect(shop.getByRole("textbox", { name: "Discount code" })).toHaveValue("NOPE");
  await shop.getByRole("textbox", { name: "Discount code" }).fill("save10");
  await shop.getByRole("button", { name: "Apply" }).click();
  await expect(shop.getByRole("button", { name: /Remove/ })).toBeVisible();
  await expect(fieldErrors(shop)).toHaveCount(0);
  // 999.50 − 99.95 + 50.00 shipping.
  await expect(shop.locator(".sv-summary-total")).toContainText(total);

  // Review: nothing left to fix, and payments are on.
  await expect(shop.locator(".sv-problems")).toHaveCount(0);
  await expect(shop.getByText("isn't taking payments")).toHaveCount(0);
  const pay = shop.getByRole("button", { name: new RegExp(`^Pay .*${total.replace(".", "\\.")}`) });
  await expect(pay).toBeEnabled();
  await pay.click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  await expect(shop.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  return (await shop.locator(".sv-order-number").textContent())?.match(/#\d+/)?.[0] ?? "";
}

test("checkout step by step at desktop, tablet and phone widths", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const { tenant, origin } = await setUp(page);

  for (const viewport of VIEWPORTS) {
    await test.step(`billing same as shipping (${viewport.name})`, async () => {
      const { context, shop } = await toCheckout(browser, origin, viewport);
      await expect(
        shop.getByText("Add your shipping address to see shipping options."),
      ).toBeVisible();
      await contact(shop);

      // Billing defaults to the shipping address; its fields stay hidden.
      await expect(shop.getByLabel(SAME_BILLING)).toBeChecked();
      await expect(shop.locator(".sv-billing")).toBeHidden();

      // A missing city: the error shows and what was typed is kept.
      await shippingAddress(shop, "");
      await shop.locator("#address").getByRole("button", { name: "Continue" }).click();
      await shop.waitForURL(/step=address&f=/);
      await expect(shop.locator("#ship_city-error")).toHaveText(/Enter your city\./);
      await expect(shop.locator("#ship_firstName")).toHaveValue("Govind");
      await expect(shop.locator("#ship_line1")).toHaveValue("7 Park Street");
      await expect(shop.getByLabel(SAME_BILLING)).toBeChecked();

      await shop.locator("#ship_city").fill("Kolkata");
      await shop.locator("#address").getByRole("button", { name: "Continue" }).click();
      await expect(shop.getByRole("button", { name: "Update address" })).toBeVisible();
      await expect(fieldErrors(shop)).toHaveCount(0);
      await expect(shop.locator("#ship_city")).toHaveValue("Kolkata");
      await expect(shop.getByLabel("Email")).toHaveValue(EMAIL);

      const number = await shipDiscountPay(shop, "949.55");
      await context.close();

      await page.goto(`${tenant.storePath}/orders`);
      await page
        .getByRole("link", { name: new RegExp(number) })
        .first()
        .click();
      await expect(page.getByText("Same as shipping address.")).toBeVisible();
    });

    await test.step(`separate billing address (${viewport.name})`, async () => {
      const { context, shop } = await toCheckout(browser, origin, viewport);
      await contact(shop);
      await shippingAddress(shop, "Kolkata");

      // Unticking shows the billing fields (no script needed).
      await shop.getByLabel(SAME_BILLING).uncheck();
      const billing = shop.locator(".sv-billing");
      await expect(billing).toBeVisible();
      await billing.locator("#billing_firstName").fill("Accounts");
      await billing.locator("#billing_lastName").fill("Team");
      await billing.locator("#billing_line1").fill("1 Office Road");
      await billing.locator("#billing_postalCode").fill("411001");
      await billing.locator("#billing_region").selectOption({ label: "Maharashtra" });
      await shop.locator("#address").getByRole("button", { name: "Continue" }).click();

      // Only the billing city is missing: its error, every value kept, box unticked.
      await shop.waitForURL(/step=address&f=/);
      await expect(fieldErrors(shop)).toHaveCount(1);
      await expect(shop.locator("#billing_city-error")).toHaveText(/Enter your city\./);
      await expect(shop.getByLabel(SAME_BILLING)).not.toBeChecked();
      await expect(billing).toBeVisible();
      await expect(shop.locator("#billing_line1")).toHaveValue("1 Office Road");
      await expect(shop.locator("#ship_city")).toHaveValue("Kolkata");

      await shop.locator("#billing_city").fill("Pune");
      await shop.locator("#address").getByRole("button", { name: "Continue" }).click();
      await expect(shop.getByRole("button", { name: "Update address" })).toBeVisible();
      await expect(fieldErrors(shop)).toHaveCount(0);

      // Both addresses were saved, each on its own.
      await shop.reload();
      await expect(shop.getByLabel(SAME_BILLING)).not.toBeChecked();
      await expect(shop.locator("#billing_city")).toHaveValue("Pune");
      await expect(shop.locator("#billing_line1")).toHaveValue("1 Office Road");
      await expect(shop.locator("#ship_city")).toHaveValue("Kolkata");
      await expect(shop.locator("#ship_line1")).toHaveValue("7 Park Street");

      const number = await shipDiscountPay(shop, "949.55");
      await context.close();

      await page.goto(`${tenant.storePath}/orders`);
      await page
        .getByRole("link", { name: new RegExp(number) })
        .first()
        .click();
      const billingCard = page.getByText("1 Office Road");
      await expect(billingCard).toBeVisible();
      await expect(page.getByText("Pune", { exact: false }).first()).toBeVisible();
      await expect(page.getByText("7 Park Street")).toBeVisible();
    });
  }
});

test("changing the address clears a shipping method that no longer applies", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "checkout-reship");
  await addProduct(page, tenant, "Stoneware mug", "999.50", "5");
  await setUpStore(page, tenant);
  // The store also ships to Nepal, at its own rate.
  await addZone(page, tenant, "Nepal", ["Nepal"]);
  await addRate(page, "Nepal", "Nepal post", "300");
  const origin = await storefrontOrigin(page, tenant);

  const { context, shop } = await toCheckout(browser, origin, VIEWPORTS[0]);
  await shop.getByLabel("Email").fill(EMAIL);
  await shop.locator("#contact").getByRole("button", { name: "Continue" }).click();
  await expect(shop.getByRole("button", { name: "Update email" })).toBeVisible();
  await shippingAddress(shop, "Kolkata");
  await shop.locator("#address").getByRole("button", { name: "Continue" }).click();
  await expect(shop.getByRole("button", { name: "Update address" })).toBeVisible();
  await expect(shop.locator(".sv-option")).toHaveCount(1);
  await shop.getByRole("radio", { name: /Standard/ }).check();
  await shop.getByRole("button", { name: "Use this method" }).click();
  await expect(shop.locator(".sv-summary-total")).toContainText("1,049.50");

  // Moving the address to Nepal: India's rate is gone and nothing is chosen.
  // (The Indian state picked earlier is dropped: Nepal has no state list.)
  await shop.locator("#ship_countryCode").selectOption("NP");
  await shop.locator("#address").getByRole("button", { name: "Update address" }).click();
  await expect(shop.locator("#ship_countryCode")).toHaveValue("NP");
  await expect(shop.getByLabel("State / region (optional)")).toHaveValue("");
  await expect(shop.locator(".sv-option")).toHaveCount(1);
  await expect(shop.locator(".sv-option").first()).toContainText("Nepal post");
  await expect(shop.getByRole("radio", { name: /Nepal post/ })).not.toBeChecked();
  await expect(shop.getByText("Choose a shipping method.")).toBeVisible();
  await expect(shop.locator(".sv-summary-total")).toContainText("999.50");
  await expect(shop.getByRole("button", { name: /^Pay / })).toBeDisabled();

  // Back to India: without a script the form can't offer India's states
  // until it's sent, so it comes back asking for one, keeping the country.
  await shop.locator("#ship_countryCode").selectOption("IN");
  await shop.locator("#address").getByRole("button", { name: "Update address" }).click();
  await shop.waitForURL(/step=address&f=/);
  await expect(shop.locator("#ship_countryCode")).toHaveValue("IN");
  await expect(shop.locator("#ship_region-error")).toHaveText(/Choose your state\./);
  await expect(shop.locator("#ship_region")).toHaveAttribute("aria-invalid", "true");
  await shop.locator("#ship_region").selectOption({ label: "West Bengal" });
  await shop.locator("#address").getByRole("button", { name: "Update address" }).click();
  await expect(fieldErrors(shop)).toHaveCount(0);
  await expect(shop.locator("#ship_region")).toHaveValue("WB");
  // ...and the old method isn't silently chosen again.
  await expect(shop.getByRole("radio", { name: /Standard/ })).not.toBeChecked();
  await expect(shop.locator(".sv-summary-total")).toContainText("999.50");
  await context.close();
});
