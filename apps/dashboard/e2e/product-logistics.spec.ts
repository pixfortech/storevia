import { expect, test, type Page } from "@playwright/test";
import { createTenant, signIn, type Tenant } from "./helpers";

// Phase 2A, end to end: a product's logistics fields (weight with its unit,
// shipping, tax, SKU and the HSN code) are saved and read back; an invalid
// HSN code is refused by the server; and publishing a product priced at 0
// asks first ("This product is free. Publish anyway?"), where cancelling
// keeps it a draft and confirming publishes it. A priced product publishes
// without a question.

const FREE_DIALOG = "This product is free. Publish anyway?";

async function newProduct(
  page: Page,
  tenant: Tenant,
  fields: { title: string; price?: string; active?: boolean },
) {
  await page.goto(`${tenant.storePath}/products/new`);
  await page.getByLabel("Title").fill(fields.title);
  if (fields.price) await page.getByLabel("Price", { exact: true }).fill(fields.price);
  if (fields.active) await page.getByRole("radio", { name: "Active", exact: true }).check();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save product" }).click();
}

test.describe.configure({ mode: "serial" });

let tenant: Tenant;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  tenant = await createTenant(page, "logistics");
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await signIn(page, tenant.email);
});

test("weight, shipping, tax, SKU and HSN code are saved with the product", async ({ page }) => {
  test.setTimeout(120_000);
  await newProduct(page, tenant, { title: "Cotton tee", price: "499" });
  await page.getByLabel("SKU").fill("TEE-01");
  await page.getByLabel("Weight", { exact: true }).fill("1.2");
  await page.getByLabel("Weight unit").selectOption("kg");
  await page.getByLabel("HSN code").fill("6109");
  await save(page);
  await page.waitForURL(/\/products\/prod_[^/?]+/);

  // Read back in the editor: the weight shows in kilograms, the HSN code as saved.
  await expect(page.getByLabel("HSN code")).toHaveValue("6109");
  await expect(page.getByLabel("SKU", { exact: true })).toHaveValue("TEE-01");
  await expect(page.getByLabel("Weight", { exact: true })).toHaveValue("1.2");
  await expect(page.getByLabel("Weight unit")).toHaveValue("kg");
  await expect(
    page.getByRole("switch", { name: "Physical product that needs shipping" }),
  ).toBeChecked();
  const tax = page.getByRole("checkbox", { name: "Charge tax on this product" });
  await expect(tax).toBeChecked();

  // Change the variant's logistics: 250 g, no tax, a new SKU.
  await page.getByLabel("SKU", { exact: true }).fill("TEE-02");
  await page.getByLabel("Weight", { exact: true }).fill("250");
  await page.getByLabel("Weight unit").selectOption("g");
  await tax.uncheck();
  await page.getByRole("button", { name: "Save pricing and shipping" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  // An unreadable weight is refused before anything is sent.
  await page.getByLabel("Weight", { exact: true }).fill("12.5");
  await page.getByRole("button", { name: "Save pricing and shipping" }).click();
  await expect(page.getByText(/Enter a weight such as 250 g or 1\.5 kg/)).toBeVisible();

  // The variant's changes were saved, the unreadable weight wasn't.
  await page.reload();
  await expect(page.getByLabel("SKU", { exact: true })).toHaveValue("TEE-02");
  await expect(page.getByLabel("Weight", { exact: true })).toHaveValue("250");
  await expect(page.getByLabel("Weight unit")).toHaveValue("g");
  await expect(
    page.getByRole("checkbox", { name: "Charge tax on this product" }),
  ).not.toBeChecked();

  // The HSN code: an invalid one is refused by the server…
  await page.getByLabel("HSN code").fill("12345");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Enter an HSN code of 4, 6 or 8 digits.")).toBeVisible();
  // …and a valid one (spaces ignored) replaces the saved one.
  await page.getByLabel("HSN code").fill("6109 10");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("HSN code")).toHaveValue("610910");

  // A service needs no shipping: the weight field goes away.
  await page.getByRole("switch", { name: "Physical product that needs shipping" }).click();
  await expect(page.getByLabel("Weight", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save pricing and shipping" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Physical product that needs shipping" }),
  ).not.toBeChecked();
});

test("publishing a free product asks first; cancel keeps it a draft, confirm publishes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newProduct(page, tenant, { title: "Free sticker" });
  await save(page);
  await page.waitForURL(/\/products\/prod_[^/?]+/);

  await page.getByRole("button", { name: "Set as active" }).first().click();
  const dialog = page.getByRole("alertdialog", { name: FREE_DIALOG });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('"Free sticker" is priced at ₹0.00.');
  await dialog.getByRole("button", { name: "Keep as draft" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Set as active" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Set as active" }).first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Publish anyway" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
});

test("saving a free product as active asks first too", async ({ page }) => {
  test.setTimeout(120_000);
  await newProduct(page, tenant, { title: "Free sample", active: true });
  await save(page);
  const dialog = page.getByRole("alertdialog", { name: FREE_DIALOG });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('"Free sample" is priced at ₹0.00.');
  // Keep editing: nothing was created.
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeHidden();
  expect(page.url()).toMatch(/\/products\/new$/);

  await save(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Publish anyway" }).click();
  await page.waitForURL(/\/products\/prod_[^/?]+/);
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
});

test("a priced product publishes without a question", async ({ page }) => {
  test.setTimeout(120_000);
  await newProduct(page, tenant, { title: "Stoneware mug", price: "450" });
  await save(page);
  await page.waitForURL(/\/products\/prod_[^/?]+/);
  await page.getByRole("button", { name: "Set as active" }).first().click();
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
  await expect(page.getByRole("alertdialog", { name: FREE_DIALOG })).toHaveCount(0);

  await newProduct(page, tenant, { title: "Linen apron", price: "650", active: true });
  await save(page);
  await page.waitForURL(/\/products\/prod_[^/?]+/);
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
});

test("set as active in bulk leaves free products as drafts and says why", async ({ page }) => {
  test.setTimeout(120_000);
  await newProduct(page, tenant, { title: "Bulk free" });
  await save(page);
  await page.waitForURL(/\/products\/prod_[^/?]+/);
  await newProduct(page, tenant, { title: "Bulk priced", price: "300" });
  await save(page);
  await page.waitForURL(/\/products\/prod_[^/?]+/);

  await page.goto(`${tenant.storePath}/products?q=Bulk`);
  await page.getByRole("checkbox", { name: "Select all products on this page" }).first().check();
  await page.getByLabel("Bulk action").selectOption({ label: "Set as active" });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/couldn't be changed/)).toBeVisible();
  await expect(page.getByText(/Bulk free: It's priced at 0, so it wasn't published/)).toBeVisible();
});
