import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillDetails, setUpStore, shopperWithCart } from "./checkout-helpers";
import { createTenant } from "./helpers";
import { addProduct, storefrontOrigin } from "./storefront-helpers";

// Milestone 6 quality: an automated accessibility audit (axe-core, WCAG 2.1
// A and AA; serious and critical violations fail) and a responsive check (no
// horizontal page scroll from 320 to 1920 px) of the checkout pages and the
// dashboard's orders, customers, discounts and checkout settings. Automated
// checks don't replace a manual keyboard and screen-reader pass.

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920] as const;

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => `${n.target.join(" ")} (${n.failureSummary ?? ""})`)
          .slice(0, 3)
          .join(" | ")}`,
    );
  expect(blocking, label).toEqual([]);
}

async function noHorizontalScroll(page: Page, label: string): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label} at ${String(width)}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test("checkout and order pages are accessible and fit every width", async ({ page, browser }) => {
  test.setTimeout(420_000);
  const tenant = await createTenant(page, "checkout-a11y");
  await addProduct(page, tenant, "Stoneware mug", "999.50", "5");
  await setUpStore(page, tenant);
  const origin = await storefrontOrigin(page, tenant);

  // --- Storefront ---
  const { context, shop } = await shopperWithCart(browser, origin, "1");
  // An invalid email shows a field error, announced and linked to its input.
  await shop.getByLabel("Email").fill("not-an-email");
  await shop.getByRole("button", { name: "Continue" }).first().click();
  await shop.waitForURL(/\/checkout\?step=contact&f=/);
  await expect(shop.getByText(/Enter a valid email address/)).toBeVisible();
  await expect(shop.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await audit(shop, "checkout with a field error");
  await noHorizontalScroll(shop, "checkout (empty steps)");
  await fillDetails(shop, "a11y@example.test");
  await audit(shop, "checkout ready to pay");
  await noHorizontalScroll(shop, "checkout ready to pay");
  await shop.getByRole("button", { name: /^Pay / }).click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  await audit(shop, "test payment page");
  await noHorizontalScroll(shop, "test payment page");
  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  await audit(shop, "order confirmation");
  await noHorizontalScroll(shop, "order confirmation");
  await context.close();

  // --- Dashboard ---
  const pages: [string, string][] = [
    ["orders list", `${tenant.storePath}/orders`],
    ["customers list", `${tenant.storePath}/customers`],
    ["discount codes", `${tenant.storePath}/marketing`],
    ["shipping settings", `${tenant.storePath}/settings/shipping`],
    ["tax settings", `${tenant.storePath}/settings/tax`],
    ["payment settings", `${tenant.storePath}/settings/payments`],
  ];
  for (const [label, path] of pages) {
    await page.goto(path);
    await audit(page, label);
    await noHorizontalScroll(page, label);
  }
  await page.goto(`${tenant.storePath}/orders`);
  await page.getByRole("link", { name: /#1001/ }).first().click();
  await page.waitForURL(/\/orders\/order_/);
  await audit(page, "order detail");
  await noHorizontalScroll(page, "order detail");
  await page.getByRole("button", { name: "Fulfil items" }).click();
  await audit(page, "fulfil dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Refund" }).first().click();
  await audit(page, "refund dialog");
  await page.keyboard.press("Escape");
  await page.goto(`${tenant.storePath}/customers`);
  await page
    .getByRole("link", { name: /a11y@example\.test|Asha Rao/ })
    .first()
    .click();
  await page.waitForURL(/\/customers\/cus_/);
  await audit(page, "customer detail");
  await noHorizontalScroll(page, "customer detail");
  // The store home's live sales figures.
  await page.goto(tenant.storePath);
  await audit(page, "store home with orders");
  await noHorizontalScroll(page, "store home with orders");
});
