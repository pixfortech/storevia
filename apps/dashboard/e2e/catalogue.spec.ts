import { expect, test, type Page } from "@playwright/test";
import { deflateSync, crc32 } from "node:zlib";
import { ADMIN_URL, staffSession } from "./admin";
import { captureServerAction, createTenant, replay, type Tenant } from "./helpers";

// Milestone 3, end to end: a merchant builds a product from nothing to an
// archived listing through the dashboard, and the plan's product limit is
// enforced in the UI and on the server.

/** A 400 × 400 PNG, generated so no binary fixture is committed. */
function png(size = 400): { name: string; mimeType: string; buffer: Buffer } {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) row.set([40 + (x % 120), 90, 160], 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return { name: "shirt.png", mimeType: "image/png", buffer };
}

async function addProduct(page: Page, tenant: Tenant, title: string, price = "499") {
  await page.goto(`${tenant.storePath}/products/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Price", { exact: true }).fill(price);
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/products\/prod_[^/]+$/);
  return page.url();
}

test("a merchant builds a product from draft to archive", async ({ page }) => {
  test.setTimeout(180_000);
  const tenant = await createTenant(page, "catalogue");

  // Products → draft.
  await page.goto(`${tenant.storePath}/products`);
  await expect(page.getByRole("heading", { name: "Add your first product" })).toBeVisible();
  await page.getByRole("link", { name: "Add product" }).first().click();
  await page.waitForURL(/\/products\/new$/);
  const editor = await addProduct(page, tenant, "Linen shirt", "1499");
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  // Media: uploaded, checked and resized on the server.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload" }).click(),
  ]);
  await chooser.setFiles(png());
  await expect(page.locator('img[srcset*=".webp"]').first()).toBeVisible({ timeout: 30_000 });

  // Options → variants.
  await page.getByRole("button", { name: "Add options" }).click();
  await page.getByLabel("Option name").first().fill("Size");
  const values = page.getByLabel("Add a value to Size");
  await values.fill("S, M");
  await values.press("Enter");
  await page.getByRole("button", { name: "Save options" }).click();
  const variants = page.getByRole("table", { name: "Variants" });
  await expect(variants.locator("tbody tr")).toHaveCount(2, { timeout: 20_000 });

  // Price and SKU per variant.
  await page.getByLabel("Price for M", { exact: true }).fill("1599");
  await page.getByLabel("SKU for S", { exact: true }).fill("SHIRT-S");
  await page.getByLabel("SKU for M", { exact: true }).fill("SHIRT-M");
  await page.getByRole("button", { name: "Save variants" }).click();
  await expect(page.getByText("Saved 2 variants.")).toBeVisible();

  // Activate.
  await page.getByRole("button", { name: "Set as active" }).first().click();
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();

  // Collection.
  await page.goto(`${tenant.storePath}/products/collections`);
  await page.getByRole("button", { name: "Create collection" }).first().click();
  await page.getByRole("dialog").getByLabel("Title").fill("Summer");
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/collections\/coll_/);
  await page.goto(editor);
  await page.getByLabel("Add to collection").selectOption({ label: "Summer" });
  await expect(page.getByRole("button", { name: /Remove from Summer/ })).toBeVisible();

  // Location.
  await page.goto(`${tenant.storePath}/inventory/locations`);
  await page.getByRole("button", { name: "Add location" }).first().click();
  const locationDialog = page.getByRole("dialog");
  await locationDialog.getByLabel("Name", { exact: true }).fill("Warehouse");
  await locationDialog.getByLabel("Code", { exact: true }).fill("WH");
  await locationDialog.getByRole("button", { name: "Add location" }).click();
  await expect(page.getByText("Warehouse").first()).toBeVisible();

  // Adjust inventory: the ledger records reason and note.
  await page.goto(`${tenant.storePath}/inventory`);
  await page.getByRole("button", { name: "Update stock for Linen shirt · S" }).click();
  const stock = page.getByRole("dialog");
  await stock.getByRole("spinbutton", { name: "Change" }).fill("12");
  await stock.getByLabel("Note").fill("First delivery");
  await stock.getByRole("button", { name: "Save" }).click();
  await expect(stock).toBeHidden();
  await expect(page.getByTestId("inventory-row").filter({ hasText: "SHIRT-S" })).toContainText(
    "12",
  );
  await page.goto(`${tenant.storePath}/inventory/history`);
  await expect(page.getByText("First delivery")).toBeVisible();

  // Archive: gone from the active list, kept under Archived.
  await page.goto(editor);
  await page.getByRole("button", { name: "Archive" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive product" }).click();
  await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
  await page.goto(`${tenant.storePath}/products?status=ARCHIVED`);
  await expect(page.getByTestId("product-row")).toContainText("Linen shirt");
});

test("the plan's product limit is enforced, and archiving makes room", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const tenant = await createTenant(page, "product-limit");

  // Staff lower the limit to one product for this organisation.
  const staff = await staffSession(browser);
  await staff.page.goto(`${ADMIN_URL}/organisations/${tenant.orgId}`);
  await staff.page.getByTestId("add-override").click();
  const dialog = staff.page.getByRole("dialog");
  await dialog.getByLabel("Feature").selectOption("product_limit");
  await dialog.getByLabel("Value").selectOption("limit");
  await dialog.getByLabel("Limit", { exact: true }).fill("1");
  await dialog.getByLabel("Reason").fill("E2E product limit");
  await dialog.getByRole("button", { name: "Save override" }).click();
  await expect(staff.page.getByTestId("override-row")).toContainText("Limit 1");
  await staff.context.close();

  const first = await addProduct(page, tenant, "Only product");

  // At the limit: no "Add product", an explanation, and the form is refused.
  await page.goto(`${tenant.storePath}/products`);
  await expect(page.getByText("You've reached your plan's product limit")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add product" })).toHaveCount(0);
  await page.goto(`${tenant.storePath}/products/new`);
  await expect(page.getByText("You've reached your plan's product limit")).toBeVisible();
  // The server refuses, whatever the page shows.
  await page.getByLabel("Title").fill("One too many");
  await page.getByLabel("Price", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /limit/i }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/products\/new$/);

  // Archiving frees the slot.
  await page.goto(first);
  await page.getByRole("button", { name: "Archive" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive product" }).click();
  await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
  await addProduct(page, tenant, "Replacement");

  // Restoring the archived one would exceed the limit: refused with a reason.
  await page.goto(first);
  await page.getByRole("button", { name: "Restore as draft" }).click();
  await expect(page.getByText(/limit/i).first()).toBeVisible();
  await page.goto(`${tenant.storePath}/products?status=ARCHIVED`);
  await expect(page.getByTestId("product-row")).toContainText("Only product");
});

test("another tenant can't open or change a product by swapping ids", async ({ browser }) => {
  test.setTimeout(180_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const A = await createTenant(pageA, "cat-iso-a");
  const B = await createTenant(pageB, "cat-iso-b");
  const productA = /\/products\/(prod_[^/?]+)/.exec(await addProduct(pageA, A, "A's secret"))?.[1];
  const editorB = await addProduct(pageB, B, "B's own");
  const productB = /\/products\/(prod_[^/?]+)/.exec(editorB)?.[1];
  if (!productA || !productB) throw new Error("no product ids");

  // URLs: A's product under B's store, and under A's store as B, are 404s.
  for (const path of [
    `${B.storePath}/products/${productA}`,
    `${A.storePath}/products/${productA}`,
  ]) {
    const response = await pageB.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  await expect(pageB.getByText("A's secret")).toHaveCount(0);

  // A captured "Set as active" from B, rewritten to A's product: refused.
  await pageB.goto(editorB);
  const action = await captureServerAction(pageB, () =>
    pageB.getByRole("button", { name: "Set as active" }).first().click(),
  );
  await expect(pageB.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
  const swapped = await replay(contextB, action, (body) => body.replaceAll(productB, productA));
  expect(swapped.text).toContain("Not found");
  // A's product under A's store id in the same request: still B's session, still refused.
  const both = await replay(contextB, action, (body) =>
    body.replaceAll(productB, productA).replaceAll(B.storeId, A.storeId),
  );
  expect(both.text).toContain("Not found");

  await pageA.goto(`${A.storePath}/products/${productA}`);
  await expect(pageA.getByRole("button", { name: "Set as active" }).first()).toBeVisible();
  await contextA.close();
  await contextB.close();
});

test("media: only processed files are served, safely, and uploads need a signed token", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const tenant = await createTenant(page, "cat-media");
  await addProduct(page, tenant, "Poster");

  // An SVG named .png is refused by its bytes, not its name.
  const [svgChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload" }).click(),
  ]);
  await svgChooser.setFiles({
    name: "evil.png",
    mimeType: "image/png",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('img[srcset*=".webp"]')).toHaveCount(0);

  // A real image becomes a clean rendition.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload" }).click(),
  ]);
  await chooser.setFiles(png());
  const image = page.locator('img[srcset*=".webp"]').first();
  await expect(image).toBeVisible({ timeout: 30_000 });
  const src = new URL((await image.getAttribute("src")) ?? "", page.url());
  // Node doesn't resolve *.localhost: send to localhost with the original Host.
  const direct = (path: string) => {
    const target = new URL(path, src);
    const host = target.host;
    target.hostname = "localhost";
    return { url: target.toString(), headers: { host } };
  };

  const media = direct(src.pathname);
  const served = await page.request.get(media.url, { headers: media.headers });
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toMatch(/^image\/(webp|png)/);
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect(served.headers()["content-security-policy"]).toContain("sandbox");

  // The raw upload is never servable, and encoded slashes can't climb out.
  const folder = src.pathname.slice(0, src.pathname.lastIndexOf("/"));
  for (const path of [`${folder}/upload`, `${folder}/..%2F..%2F..%2F..%2Fpackage.json`]) {
    const target = direct(path);
    const response = await page.request.get(target.url, { headers: target.headers });
    expect([400, 404], path).toContain(response.status());
  }
  // Dot segments are resolved before routing: they reach the app, never a file.
  for (const path of ["/media/%2e%2e/%2e%2e/.env", "/media/%2e%2e/%2e%2e/package.json"]) {
    const target = direct(path);
    const response = await page.request.get(target.url, {
      headers: target.headers,
      maxRedirects: 0,
    });
    const body = await response.text();
    expect(body, path).not.toContain("DATABASE_URL");
    expect(body, path).not.toContain('"name": "@storevia');
  }

  // Forged upload fields are refused before anything is written.
  const upload = direct("/api/media/upload");
  const forged = await page.request.post(upload.url, {
    headers: upload.headers,
    multipart: {
      key: src.pathname.replace(/^\/media\//, "").replace(/[^/]+$/, "upload"),
      maxBytes: "20000000",
      expires: String(Math.floor(Date.now() / 1000) + 600),
      signature: "0".repeat(64),
      file: { name: "x.png", mimeType: "image/png", buffer: png().buffer },
    },
  });
  expect(forged.status()).toBe(403);
});
