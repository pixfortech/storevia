import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { grantPlan } from "./admin";
import { fillDetails, setUpStore, shopperWithCart } from "./checkout-helpers";
import {
  createTenant,
  signIn,
  signUpAndVerify,
  tokenFromEmail,
  uniqueEmail,
  type Tenant,
} from "./helpers";
import { addProduct, storefrontOrigin } from "./storefront-helpers";

// Phase 2A, end to end: a merchant exports orders as CSV from the orders
// page (a real order placed through the storefront's test payments), with a
// date range; another tenant's export URL is a 404 and a member without
// order.read is refused.

test.describe.configure({ mode: "serial" });

/**
 * A signed-in GET from Node: *.localhost doesn't resolve there, so it goes to
 * localhost with the original Host and the context's cookies for that host.
 */
async function getAsMember(context: BrowserContext, page: Page, path: string) {
  const target = new URL(path, page.url());
  const cookie = (await context.cookies(target.toString()))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const host = target.host;
  target.hostname = "localhost";
  return context.request.get(target.toString(), {
    headers: { host, ...(cookie ? { cookie } : {}) },
    maxRedirects: 0,
  });
}

const COLUMNS = [
  "Order",
  "Placed at",
  "Order state",
  "Payment status",
  "Fulfilment status",
  "Test order",
  "Customer name",
  "Customer email",
  "Items",
  "Currency",
  "Subtotal",
  "Discount",
  "Shipping",
  "Tax",
  "Total",
  "Refunded",
  "Net",
];

let tenant: Tenant;
let orderNumber = "";

/** RFC 4180: quoted cells may hold commas, quotes ("") and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows;
}

/** Clicks "Export CSV" and returns the downloaded file's name and bytes. */
async function exportCsv(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

async function buy(browser: Browser, origin: string, email: string): Promise<string> {
  const { context, shop } = await shopperWithCart(browser, origin, "2");
  await fillDetails(shop, email);
  await shop.getByRole("button", { name: /^Pay / }).click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  const number = (await shop.locator(".sv-order-number strong").textContent()) ?? "";
  await context.close();
  return number.trim();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await browser.newPage();
  tenant = await createTenant(page, "orderexport");
  await addProduct(page, tenant, "Stoneware mug", "450", "20");
  await setUpStore(page, tenant);
  const origin = await storefrontOrigin(page, tenant);
  await page.close();
  orderNumber = await buy(browser, origin, "export.buyer@example.test");
  expect(orderNumber).toMatch(/^#\d+$/);
});

test("the merchant exports orders as CSV, with a date range", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, tenant.email);
  await page.goto(`${tenant.storePath}/orders`);
  await expect(page.getByTestId("order-row").first()).toBeVisible();

  const { name, bytes } = await exportCsv(page);
  expect(name).toMatch(/^orders-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.csv$/);
  // UTF-8 with a byte-order mark, for spreadsheet apps.
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const [header, ...rows] = parseCsv(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  expect(header).toEqual(COLUMNS);
  expect(rows).toHaveLength(1);
  const row = Object.fromEntries(COLUMNS.map((c, i) => [c, rows[0]?.[i] ?? ""]));
  expect(row).toMatchObject({
    Order: orderNumber,
    "Order state": "Open",
    "Payment status": "Paid",
    "Fulfilment status": "Unfulfilled",
    // Paid through the Test Provider: a test order.
    "Test order": "yes",
    "Customer name": "Asha Rao",
    "Customer email": "export.buyer@example.test",
    Items: "2",
    Currency: "INR",
    Subtotal: "900.00",
    Shipping: "50.00",
    Refunded: "0.00",
  });
  expect(row["Placed at"]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/);
  expect(row["Net"]).toBe(row["Total"]);
  // No internal ids or payment references.
  const text = bytes.toString("utf8");
  expect(text).not.toMatch(/order_[0-9a-z]{26}|tp_[A-Za-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-/);

  // A date range with no orders in it: the columns only.
  await page.getByLabel("From", { exact: true }).fill("2099-01-01");
  await page.getByLabel("To", { exact: true }).fill("2099-12-31");
  const empty = await exportCsv(page);
  expect(parseCsv(empty.bytes.toString("utf8").replace(/^\uFEFF/, ""))).toEqual([COLUMNS]);

  // The test orders tab exports the same order.
  await page.goto(`${tenant.storePath}/orders?status=test`);
  const testTab = await exportCsv(page);
  const [, ...testRows] = parseCsv(testTab.bytes.toString("utf8").replace(/^\uFEFF/, ""));
  expect(testRows.map((r) => r[0])).toEqual([orderNumber]);
});

test("another tenant's export URL is a 404", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await createTenant(page, "orderexport-other");
  const response = await getAsMember(context, page, `${tenant.storePath}/orders/export`);
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain(orderNumber);
  await context.close();
});

test("a member without order.read is refused", async ({ browser }) => {
  test.setTimeout(240_000);
  await grantPlan(browser, tenant.orgId);
  const owner = await browser.newPage();
  await signIn(owner, tenant.email);
  const email = uniqueEmail("viewer");
  await owner.goto(`${tenant.orgPath}/members`);
  await owner.getByLabel("Email").fill(email);
  await owner.getByLabel("Role", { exact: true }).selectOption("VIEWER");
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText("Invitation sent.")).toBeVisible();
  await owner.close();

  const context: BrowserContext = await browser.newContext();
  const member = await context.newPage();
  const token = await tokenFromEmail(email, "invitation", /\/invitations\/([A-Za-z0-9_-]+)/);
  await signUpAndVerify(member, "Vera Viewer", email, `/invitations/${token}`);
  await signIn(member, email);
  await member.goto(`/invitations/${token}`);
  await member.getByRole("button", { name: "Accept invitation" }).click();
  await member.waitForURL(new RegExp(tenant.orgPath));

  await member.goto(`${tenant.storePath}/orders`);
  await expect(member.getByText("You don't have access to orders")).toBeVisible();
  await expect(member.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  const response = await getAsMember(context, member, `${tenant.storePath}/orders/export`);
  expect(response.status()).toBe(403);
  expect(await response.text()).not.toContain(orderNumber);
  await context.close();
});
