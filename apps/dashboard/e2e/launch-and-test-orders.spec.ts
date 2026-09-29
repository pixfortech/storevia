import { expect, test } from "@playwright/test";
import { fillDetails, setUpStore, shopperWithCart } from "./checkout-helpers";
import { captureServerAction, createTenant, replay } from "./helpers";
import { prepareToGoLive } from "./launch-helpers";
import { addProduct, storefrontOrigin } from "./storefront-helpers";

// Final pass, Phase 1: an incomplete store can't go live (DB-1), and a test
// order is marked TEST everywhere, left out of revenue, and announced to the
// staff with a link to it (CO-1, ORD-1). Replies go to the store (CO-3).

test("an incomplete store can't go live; the dashboard says exactly what is missing", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const tenant = await createTenant(page, "launch");
  await addProduct(page, tenant, "Stoneware mug", "450", "5");

  await page.goto(`${tenant.storePath}/settings`);
  const list = page.getByTestId("launch-readiness");
  const check = (key: string) => list.locator(`[data-check="${key}"]`);
  await expect(check("payments")).toHaveAttribute("data-state", "missing");
  await expect(check("shipping")).toHaveAttribute("data-state", "missing");
  await expect(check("identity")).toHaveAttribute("data-state", "missing");
  await expect(check("seller")).toHaveAttribute("data-state", "missing");
  await expect(check("policies")).toHaveAttribute("data-state", "missing");
  await expect(check("products")).toHaveAttribute("data-state", "ok");
  await expect(check("home")).toHaveAttribute("data-state", "ok");
  await expect(list).toContainText("Before you go live: 5 steps left");
  await expect(page.getByRole("button", { name: "Go live" })).toBeDisabled();
  // Replies go to Storevia's address until the store has one of its own.
  await expect(page.getByTestId("reply-to-note")).toContainText("no support or contact email");
  // Each missing step links to where it's fixed.
  await check("shipping").getByRole("link", { name: /Fix/ }).click();
  await page.waitForURL(/\/settings\/shipping$/);
  await page.goto(`${tenant.storePath}/settings`);
  await check("policies").getByRole("link", { name: /Fix/ }).click();
  await page.waitForURL(/\/settings\/policies$/);

  // The store home's set-up steps list the same things.
  await page.goto(tenant.storePath);
  await expect(page.getByText("Connect a payment provider so shoppers can pay.")).toBeVisible();

  await prepareToGoLive(page, tenant);
  await page.goto(`${tenant.storePath}/settings`);
  await expect(check("payments")).toHaveAttribute("data-state", "warning");
  await expect(check("payments")).toContainText("test mode");
  await expect(list).toContainText("Ready to go live");
  await expect(page.getByTestId("reply-to-note")).toContainText("help@shop.example");
  const goLive = await captureServerAction(page, async () => {
    await page.getByRole("button", { name: "Go live" }).click();
  });
  await expect(page.getByText("Your store is live.")).toBeVisible();

  // The server refuses on its own: back to coming soon, remove the email,
  // and replay the captured Go live request.
  await page.getByRole("button", { name: "Switch to coming soon" }).click();
  await expect(page.getByText("Your store now shows a coming-soon page.")).toBeVisible();
  await page.getByLabel("Support email").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  const refused = await replay(context, goLive);
  expect(refused.text).toContain("isn't ready to go live");
  await page.reload();
  await expect(page.getByRole("button", { name: "Go live" })).toBeDisabled();
  await expect(check("identity")).toHaveAttribute("data-state", "missing");
});

test("a test order is marked TEST, left out of revenue, and announced with a link", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "testorder");
  await addProduct(page, tenant, "Stoneware mug", "450", "20");
  const origin = await storefrontOrigin(page, tenant);
  await setUpStore(page, tenant);

  const { context: shopper, shop } = await shopperWithCart(browser, origin, "1");
  await fillDetails(shop, "tester@example.test");
  await shop.getByRole("button", { name: /^Pay / }).click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  const number = (await shop.locator(".sv-order-number strong").textContent()) ?? "";
  await shopper.close();

  // The list shows it, marked, with a note; the Test orders tab has it.
  await page.goto(`${tenant.storePath}/orders`);
  const row = page.getByTestId("order-row").filter({ hasText: number });
  await expect(row.getByTestId("test-badge")).toBeVisible();
  await expect(page.getByTestId("test-orders-note")).toBeVisible();
  await expect(page.getByText("₹0.00")).toBeVisible(); // Revenue, 30 days
  await page.getByRole("link", { name: /^Test orders/ }).click();
  await expect(page.getByTestId("order-row")).toHaveCount(1);

  // The order and its payment say so.
  await row.getByRole("link", { name: number }).click();
  await page.waitForURL(/\/orders\/order_/);
  await expect(page.getByText("Test order", { exact: true })).toBeVisible();
  await expect(page.getByTestId("test-badge")).toHaveCount(2);

  // The bell: a new-order notification that opens the order.
  await page.goto(tenant.storePath);
  await expect
    .poll(
      async () => {
        await page.reload();
        const count = page.getByTestId("notification-count");
        return count.waitFor({ state: "visible", timeout: 5_000 }).then(
          () => count.textContent(),
          () => null,
        );
      },
      { timeout: 90_000, intervals: [1_000] },
    )
    .toBe("1");
  await page.getByTestId("notification-bell").click();
  await page.getByRole("link", { name: new RegExp(`New test order ${number}`) }).click();
  await page.waitForURL(/\/orders\/order_[^#/]+$/);
  await expect(page.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
});
