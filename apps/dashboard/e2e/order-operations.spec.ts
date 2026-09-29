import { expect, test, type Browser, type Page } from "@playwright/test";
import { fillDetails, setUpStore, shopperWithCart } from "./checkout-helpers";
import { captureServerAction, createTenant, replay, signIn, type Tenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Order operations after payment (post-M7), end to end: the shipping and
// local-delivery journeys with tracking edits, delivered and complete, as
// the merchant and as the shopper on their private order page; archiving
// (and a refused deletion); and a customer's note reaching the merchant
// through the notification bell.

test.describe.configure({ mode: "serial" });

let tenant: Tenant;
let origin: string;

/** A paid order through the real storefront; returns its number and private link. */
async function buy(browser: Browser, email: string): Promise<{ number: string; link: string }> {
  const { context, shop } = await shopperWithCart(browser, origin, "1");
  await fillDetails(shop, email);
  await shop.getByRole("button", { name: /^Pay / }).click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  const number = (await shop.locator(".sv-order-number strong").textContent()) ?? "";
  const href = (await shop.locator("[data-order-link]").getAttribute("href")) ?? "";
  expect(href).toMatch(/^\/orders\/view\/[A-Za-z0-9_-]{65}$/);
  await context.close();
  return { number, link: `${origin}${href}` };
}

async function openOrder(page: Page, number: string) {
  await page.goto(`${tenant.storePath}/orders?q=${encodeURIComponent(number.replace("#", ""))}`);
  await page.getByRole("link", { name: number }).first().click();
  await page.waitForURL(/\/orders\/order_/);
  await expect(page.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
}

const status = (page: Page, key: string) => page.locator(`[data-status="${key}"]`);

async function step(page: Page, name: string, shipment: string) {
  await page.getByRole("button", { name }).click();
  await expect(page.getByTestId("fulfilment").first()).toHaveAttribute(
    "data-shipment-status",
    shipment,
  );
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await browser.newPage();
  tenant = await createTenant(page, "orderops");
  await addProduct(page, tenant, "Stoneware mug", "450", "20");
  await setUpStore(page, tenant);
  origin = await storefrontOrigin(page, tenant);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await signIn(page, tenant.email);
});

test("shipping: fulfil with Delhivery tracking, edit it, in transit, delivered, complete; the shopper follows along", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const { number, link } = await buy(browser, "shipping@example.test");
  await openOrder(page, number);
  await expect(status(page, "payment")).toContainText("Paid");
  await expect(status(page, "delivery")).toContainText("Not shipped");

  await page.getByRole("button", { name: "Fulfil items" }).click();
  const fulfil = page.getByRole("dialog");
  await fulfil.getByLabel("Delivery method").selectOption("SHIPPING");
  await fulfil.getByLabel("Status").selectOption("SHIPPED");
  await fulfil.getByLabel("Carrier").fill("Delhivery");
  await fulfil.getByLabel("Tracking number").fill("DLV100200");
  await fulfil
    .getByLabel("Tracking link")
    .fill("https://www.delhivery.com/track/package/DLV100200");
  await fulfil.getByRole("button", { name: "Fulfil 1 item" }).click();
  await expect(fulfil).toBeHidden();
  await expect(status(page, "fulfilment")).toContainText("Fulfilled");
  await expect(status(page, "delivery")).toContainText("On its way");
  await expect(page.getByTestId("tracking")).toContainText("Delhivery · DLV100200");

  // Replace the tracking number; a bad link is refused.
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Tracking link").fill("javascript:alert(1)");
  await edit.getByRole("button", { name: "Save fulfilment" }).click();
  await expect(edit.getByText("Enter a full link starting with https://.")).toBeVisible();
  await edit.getByLabel("Tracking number").fill("DLV100999");
  await edit.getByLabel("Tracking link").fill("https://www.delhivery.com/track/package/DLV100999");
  await edit.getByRole("button", { name: "Save fulfilment" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByTestId("tracking")).toContainText("DLV100999");

  await step(page, "Mark in transit", "IN_TRANSIT");
  // Not complete while it's on its way.
  await page.getByRole("button", { name: "Mark complete" }).click();
  const early = page.getByRole("dialog");
  await expect(early.getByText("Not every fulfilment is delivered.")).toBeVisible();
  await early.getByRole("button", { name: "Cancel" }).click();

  await step(page, "Mark out for delivery", "OUT_FOR_DELIVERY");
  await step(page, "Mark delivered", "DELIVERED");
  await expect(status(page, "delivery")).toContainText("Delivered");

  await page.getByRole("button", { name: "Mark complete" }).click();
  const complete = page.getByRole("dialog");
  await complete.getByRole("button", { name: "Mark complete" }).click();
  await expect(complete).toBeHidden();
  await expect(status(page, "order")).toContainText("Completed");

  // The merchant's timeline records every step.
  for (const text of [
    /1 item fulfilled \(shipped\), tracking DLV100200/,
    /Tracking updated: Delhivery DLV100999/,
    /Fulfilment marked in transit/,
    /Fulfilment marked delivered/,
    /Order marked complete/,
  ]) {
    await expect(page.getByText(text)).toBeVisible();
  }

  // The shopper's private page shows the same journey.
  const shopper = await browser.newPage();
  await shopper.goto(link);
  await expect(shopper.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
  await expect(shopper.locator("[data-status=delivery]")).toHaveText("Delivered");
  await expect(shopper.locator("[data-order-state]")).toHaveText("Complete");
  await expect(shopper.locator("[data-tracking]")).toContainText("Delhivery DLV100999");
  for (const milestone of ["placed", "paid", "shipped", "in_transit", "delivered", "completed"]) {
    await expect(shopper.locator(`[data-milestone=${milestone}]`)).toBeVisible();
  }
  // No staff names or internal ids on the shopper's page.
  const html = await shopper.content();
  expect(html).not.toMatch(/Owner orderops/);
  expect(html).not.toMatch(/order_[0-9a-z]{26}/);
  await shopper.close();
});

test("local delivery: ready, out for delivery, delivered, complete", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { number, link } = await buy(browser, "local@example.test");
  await openOrder(page, number);
  await page.getByRole("button", { name: "Fulfil items" }).click();
  const fulfil = page.getByRole("dialog");
  await fulfil.getByLabel("Delivery method").selectOption("LOCAL_DELIVERY");
  await expect(fulfil.getByLabel("Status")).toHaveValue("READY");
  await fulfil.getByRole("button", { name: "Fulfil 1 item" }).click();
  await expect(fulfil).toBeHidden();
  await expect(page.getByText("Local delivery from")).toBeVisible();
  await expect(status(page, "delivery")).toContainText("Ready to send");

  await step(page, "Mark out for delivery", "OUT_FOR_DELIVERY");
  await step(page, "Mark delivered", "DELIVERED");
  await page.getByRole("button", { name: "Mark complete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark complete" }).click();
  await expect(status(page, "order")).toContainText("Completed");

  const shopper = await browser.newPage();
  await shopper.goto(link);
  await expect(shopper.locator("[data-shipment]")).toContainText("Local delivery");
  await expect(shopper.locator("[data-milestone=out_for_delivery]")).toBeVisible();
  await expect(shopper.locator("[data-milestone=delivered]")).toBeVisible();
  await shopper.close();
});

test("archive keeps the order out of the list but searchable; deleting a paid order is refused", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const { number } = await buy(browser, "archive@example.test");
  await openOrder(page, number);
  await page.getByRole("button", { name: "Archive order" }).click();
  await expect(status(page, "archived")).toContainText("Archived");

  await page.goto(`${tenant.storePath}/orders`);
  await expect(page.getByRole("link", { name: number, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /Archived orders/ }).click();
  await expect(page.getByRole("link", { name: number }).first()).toBeVisible();
  // Search still finds it.
  await openOrder(page, number);

  // Deletion needs the typed order number, and the server checks it too.
  await page.getByRole("button", { name: "Delete demo order" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel(/Type .* to confirm/).fill("#1");
  await expect(dialog.getByRole("button", { name: "Delete demo order" })).toBeDisabled();
  await dialog.getByLabel(/Type .* to confirm/).fill(number);
  // Capture the request without letting it through, then send it with a wrong
  // confirmation and with no session.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort()
      : route.continue(),
  );
  const action = await captureServerAction(page, () =>
    dialog.getByRole("button", { name: "Delete demo order" }).click(),
  );
  await page.unroute("**/*");
  const wrong = await replay(page.context(), action, (b) => b.replace(`"${number}"`, '"#1"'));
  expect(wrong.text).toContain(`Type ${number} to confirm.`);
  const anonymous = await browser.newContext();
  const refused = await replay(anonymous, action);
  expect(refused.text).not.toContain("Demo order deleted");
  await anonymous.close();

  // Still there, and restorable.
  await page.goto(page.url());
  await expect(page.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
  await page.getByRole("button", { name: "Restore order" }).click();
  await expect(page.getByRole("button", { name: "Archive order" })).toBeVisible();
  await page.goto(`${tenant.storePath}/orders`);
  await expect(page.getByRole("link", { name: number }).first()).toBeVisible();
});

test("a customer's note reaches the merchant; forged and foreign links open nothing", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const first = await buy(browser, "note@example.test");
  const second = await buy(browser, "other@example.test");

  const shopper = await browser.newPage();
  await shopper.goto(first.link);
  await shopper.getByLabel("Message to the store").fill("Please deliver after 5 PM");
  await shopper.getByRole("button", { name: "Send message" }).click();
  await expect(shopper.getByRole("status")).toContainText("Message sent.");
  await expect(shopper.locator("[data-from=customer]")).toContainText("Please deliver after 5 PM");
  await shopper.close();

  // A forged token, a guessed order number and another order's token.
  const token = first.link.split("/orders/view/")[1] ?? "";
  const forged = token.slice(0, 22) + "A".repeat(43);
  expect((await fetchStore(request, origin, `/orders/view/${forged}`)).status).toBe(404);
  expect(
    (await fetchStore(request, origin, `/orders/view/${first.number.replace("#", "")}`)).status,
  ).toBe(404);
  const other = await fetchStore(request, origin, new URL(second.link).pathname);
  expect(other.status).toBe(200);
  expect(other.text).not.toContain("Please deliver after 5 PM");
  expect(other.text).toContain(`Order ${second.number}`);

  // The worker tells the staff who may answer; the bell shows it, alongside
  // the new-order notifications for this store's orders (final pass, ORD-1).
  await page.goto(`${tenant.storePath}/orders`);
  const messageItem = () =>
    page.getByRole("link", {
      name: new RegExp(`Customer sent a message on Order ${first.number}`),
    });
  // The bell loads after the page: reload until the message is in it.
  await expect
    .poll(
      async () => {
        await page.reload();
        const bell = page.getByTestId("notification-bell");
        await bell.waitFor({ state: "visible", timeout: 5_000 });
        await bell.click();
        const found = await messageItem().count();
        await page.keyboard.press("Escape");
        return found;
      },
      { timeout: 90_000, intervals: [1_000] },
    )
    .toBeGreaterThan(0);
  const unread = Number(await page.getByTestId("notification-count").textContent());
  await page.getByTestId("notification-bell").click();
  const item = messageItem();
  await expect(item).toBeVisible();
  // A new order links straight to the order (Test Provider orders say so).
  const placed = page.getByRole("link", { name: new RegExp(`New test order ${first.number}`) });
  await expect(placed).toBeVisible();
  expect(await placed.getAttribute("href")).toMatch(/\/orders\/order_[^#/]+$/);
  await item.click();
  await page.waitForURL(/\/orders\/order_[^#]+#messages$/);
  await expect(page.getByTestId("order-messages")).toContainText("Please deliver after 5 PM");
  // Opening it marks it read (other notifications may still be unread).
  await expect
    .poll(async () => {
      const count = page.getByTestId("notification-count");
      return (await count.count()) === 0 ? 0 : Number(await count.textContent());
    })
    .toBeLessThan(unread);

  // The store replies; the shopper sees it on their page.
  await page.getByLabel("Reply to the customer").fill("Noted, we'll come after 5.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Reply sent.")).toBeVisible();
  const back = await browser.newPage();
  await back.goto(first.link);
  await expect(back.locator("[data-from=store]")).toContainText("Noted, we'll come after 5.");
  await back.close();
});
