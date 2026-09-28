import { expect, test } from "@playwright/test";
import { createTenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Product taxonomy and tags, end to end: a merchant chooses a category from
// the shared taxonomy in the picker and adds tags as chips (Enter and
// comma), both survive a save and a reload, the product list filters by tag
// and by category, and the public product page still loads.

test("a merchant categorises and tags a product, then finds it by tag", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const tenant = await createTenant(page, "taxonomy");
  const editor = await addProduct(page, tenant, "Enamel saucepan", "1899", "5");

  // Category: search the taxonomy and pick a breadcrumb; codes never show.
  await page.getByRole("button", { name: "Choose category" }).click();
  const picker = page.getByRole("dialog", { name: "Choose a category" });
  await expect(picker).toBeVisible();
  // Browsing works level by level before searching.
  await picker.getByRole("button", { name: "Show categories in Home & Garden" }).click();
  await expect(picker.getByRole("button", { name: /^Kitchen & Dining/ })).toBeVisible();
  await picker.getByRole("searchbox", { name: "Search categories" }).fill("cookware");
  await picker.getByRole("button", { name: /^Cookware/ }).click();
  await expect(picker).toBeHidden();
  const category = page.getByTestId("product-category");
  await expect(category).toHaveText("Home & Garden › Kitchen & Dining › Cookware");
  await expect(page.getByText("hg-kd-cookware")).toHaveCount(0);

  // Tags: Enter adds one, a comma adds another, duplicates are ignored.
  const tags = page.getByRole("combobox", { name: "Tags" });
  await tags.fill("Kitchen");
  await tags.press("Enter");
  await tags.pressSequentially("gift ideas,");
  await tags.pressSequentially("kitchen");
  await tags.press("Enter");
  await expect(page.getByRole("button", { name: "Remove tag Kitchen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tag gift ideas" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove tag / })).toHaveCount(2);
  await expect(tags).toHaveValue("");

  // A chip can be removed with its button (and added back).
  await page.getByRole("button", { name: "Remove tag gift ideas" }).click();
  await expect(page.getByRole("button", { name: "Remove tag gift ideas" })).toHaveCount(0);
  await tags.pressSequentially("gift ideas,");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  // Both persist through a reload.
  await page.reload();
  await expect(page.getByTestId("product-category")).toHaveText(
    "Home & Garden › Kitchen & Dining › Cookware",
  );
  await expect(page.getByRole("button", { name: "Remove tag Kitchen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tag gift ideas" })).toBeVisible();

  // The product list filters by tag (ignoring case) and by category,
  // including the categories above it.
  await page.goto(`${tenant.storePath}/products?tag=kitchen`);
  await expect(
    page.getByTestId("product-row").filter({ hasText: "Enamel saucepan" }),
  ).toBeVisible();
  await page.goto(`${tenant.storePath}/products?tag=GIFT%20IDEAS`);
  await expect(page.getByTestId("product-row")).toHaveCount(1);
  await page.goto(`${tenant.storePath}/products?tag=no-such-tag`);
  await expect(page.getByRole("heading", { name: "No products match" })).toBeVisible();
  await page.goto(`${tenant.storePath}/products?category=hg-kd`);
  await expect(
    page.getByTestId("product-row").filter({ hasText: "Enamel saucepan" }),
  ).toBeVisible();
  await page.goto(`${tenant.storePath}/products?category=aa`);
  await expect(page.getByRole("heading", { name: "No products match" })).toBeVisible();

  // Clearing the category is saved too.
  await page.goto(editor);
  await page.getByRole("button", { name: "Clear category" }).click();
  await expect(page.getByTestId("product-category")).toHaveText("Not categorised");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("product-category")).toHaveText("Not categorised");
  await expect(page.getByRole("button", { name: "Remove tag Kitchen" })).toBeVisible();

  // The public product page still loads once the store is live.
  const origin = await storefrontOrigin(page, tenant);
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();
  const shopper = await browser.newContext();
  await expect
    .poll(
      async () => {
        const response = await fetchStore(shopper.request, origin, "/products/enamel-saucepan");
        return response.status === 200 && response.text.includes("Enamel saucepan");
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(true);
  await shopper.close();
});
