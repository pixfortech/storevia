import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createTenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";
import { goLiveReady } from "./launch-helpers";

// Automated accessibility audit (axe-core, WCAG 2.1 A and AA) of the
// Milestone 5 surfaces: the website hub, pages list, builder (desktop and
// phone), themes (library, customiser, demo) and menus in the dashboard, and the published home and
// content pages on the storefront. Serious and critical violations fail;
// automated checks don't replace a manual keyboard and screen-reader pass.

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ")}`,
    );
  expect(blocking, label).toEqual([]);
}

test("the builder and the pages it publishes pass an automated accessibility audit", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "a11y");
  await addProduct(page, tenant, "Stoneware mug", "999.50", "5");
  const origin = await storefrontOrigin(page, tenant);
  await goLiveReady(page, tenant);

  await page.goto(`${tenant.storePath}/website`);
  await audit(page, "website hub");

  // A content page with some text, published.
  await page.goto(`${tenant.storePath}/pages`);
  await audit(page, "pages list");
  await page.getByRole("button", { name: "New page" }).click();
  await audit(page, "new page dialog");
  await page.getByRole("dialog", { name: "New page" }).getByLabel("Title").fill("About us");
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/website\/pages\/page_/);
  const canvas = page.frameLocator('iframe[title="Page preview"]');
  await expect(canvas.getByRole("heading", { name: "About us" })).toBeVisible({ timeout: 20_000 });
  await audit(page, "builder (desktop)");
  await page.getByRole("button", { name: "Add section" }).click();
  await audit(page, "add section dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "About us" })).toBeVisible();
  await audit(page, "builder (phone)");
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto(`${tenant.storePath}/themes`);
  await expect(
    page.frameLocator('iframe[title="Boutique demo store, home page"]').locator(".sv-demo"),
  ).toBeAttached({ timeout: 20_000 });
  await audit(page, "theme library");
  await page.goto(`${tenant.storePath}/themes/customise`);
  await audit(page, "theme customiser");
  await page.goto(`${tenant.storePath}/themes/demo/boutique`);
  await expect(
    page.frameLocator('iframe[title="Boutique demo store, home page"]').locator(".sv-demo"),
  ).toBeAttached({ timeout: 20_000 });
  await audit(page, "theme demo");
  await page.goto(`${tenant.storePath}/website/navigation`);
  await audit(page, "menus");

  const shopper = await browser.newContext();
  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/pages/about-us")).status, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toBe(200);
  const shop = await shopper.newPage();
  for (const path of ["/", "/pages/about-us"]) {
    await shop.goto(`${origin}${path}`);
    await audit(shop, `storefront ${path}`);
  }
  await shopper.close();
});
