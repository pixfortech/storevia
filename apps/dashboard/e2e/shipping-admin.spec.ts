import { expect, test, type Page } from "@playwright/test";
import { addRate, goLive, shopperWithCart } from "./checkout-helpers";
import { createTenant } from "./helpers";
import { addProduct, storefrontOrigin } from "./storefront-helpers";

// Shipping settings to checkout, in a real browser: a zone is set up by
// ticking India and West Bengal by name (no codes typed), its rate is
// offered to a West Bengal address chosen from the State list, and taken
// away again when the rate is made inactive, deleted, or the address moves
// to a state the zone doesn't cover. Rates come only from the store's own
// settings.

const UNAVAILABLE = "We don't currently ship to this address.";

async function editRateActive(page: Page, active: boolean) {
  await page.getByRole("button", { name: "Edit Standard" }).click();
  const dialog = page.getByRole("dialog");
  const toggle = dialog.getByRole("switch", { name: "Active" });
  if ((await toggle.getAttribute("aria-checked")) !== String(active)) await toggle.click();
  await dialog.getByRole("button", { name: "Save rate" }).click();
  await expect(dialog).toBeHidden();
}

test("zones by country and state, from settings to checkout", async ({ page, browser }) => {
  test.setTimeout(420_000);
  const tenant = await createTenant(page, "shipping-admin");
  await addProduct(page, tenant, "Stoneware mug", "799", "10");

  // --- Settings → Shipping: India, narrowed to West Bengal, chosen by name. ---
  await page.goto(`${tenant.storePath}/settings/shipping`);
  await page.getByRole("button", { name: "Add zone" }).first().click();
  const zone = page.getByRole("dialog");
  await zone.getByLabel("Zone name").fill("Bengal");
  await zone.getByRole("searchbox", { name: "Search countries" }).fill("indi");
  await zone.getByRole("checkbox", { name: "India", exact: true }).check();
  await expect(zone.getByText("Chosen: India.")).toBeVisible();
  // One country with a state list: its states appear, none ticked = whole country.
  const states = zone.getByRole("group", { name: "States and union territories of India" });
  await expect(states).toBeVisible();
  await expect(zone.getByText("Whole country: all of India.")).toBeVisible();
  await states.getByRole("searchbox").fill("bengal");
  await states.getByRole("checkbox", { name: "West Bengal" }).check();
  await expect(zone.getByText("1 of 36 chosen.")).toBeVisible();
  // A second country hides the state list: regions narrow single-country zones only.
  await zone.getByRole("searchbox", { name: "Search countries" }).fill("nepal");
  await zone.getByRole("checkbox", { name: "Nepal", exact: true }).check();
  await expect(states).toBeHidden();
  await zone.getByRole("checkbox", { name: "Nepal", exact: true }).uncheck();
  await expect(states.getByRole("checkbox", { name: "West Bengal" })).toBeChecked();
  await zone.getByRole("button", { name: "Add zone" }).click();
  await expect(zone).toBeHidden();
  // The zone is listed by names, not codes.
  const section = page.getByRole("region", { name: "Bengal", exact: true });
  await expect(section).toContainText("India");
  await expect(section).toContainText("States and union territories: West Bengal");
  await addRate(page, "Bengal", "Standard", "60");

  // India is now taken: another zone can't have it, and says which zone does.
  await page.getByRole("button", { name: "Add zone" }).first().click();
  const second = page.getByRole("dialog");
  await second.getByRole("searchbox", { name: "Search countries" }).fill("india");
  await expect(second.getByRole("checkbox", { name: "India", exact: true })).toBeDisabled();
  await expect(second.getByText("In Bengal")).toBeVisible();
  await second.getByRole("button", { name: "Cancel" }).click();
  await expect(second).toBeHidden();

  await goLive(page, tenant);
  const origin = await storefrontOrigin(page, tenant);

  // --- Checkout: a West Bengal address, its state from the list. ---
  const { context, shop } = await shopperWithCart(browser, origin, "1");
  await shop.getByLabel("Email").fill("bengal@example.test");
  await shop.getByRole("button", { name: "Continue" }).first().click();
  await expect(shop.getByRole("button", { name: "Update email" })).toBeVisible();
  const address = shop.locator("#address");
  await address.locator("#ship_firstName").fill("Govind");
  await address.locator("#ship_lastName").fill("Lohia");
  await address.locator("#ship_line1").fill("7 Park Street");
  await address.locator("#ship_city").fill("Kolkata");
  await expect(address.getByLabel("State", { exact: true })).toBeVisible();
  await address.getByLabel("State", { exact: true }).selectOption({ label: "West Bengal" });
  await address.getByLabel("PIN code").fill("700 016");
  await address.getByRole("button", { name: "Continue" }).click();
  await expect(shop.getByRole("button", { name: "Update address" })).toBeVisible();
  await expect(address.locator("#ship_postalCode")).toHaveValue("700016");

  const shipping = shop.locator("#shipping");
  const options = shipping.locator(".sv-option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("Standard");
  await expect(options.first()).toContainText("60.00");
  await shop.getByRole("radio", { name: /Standard/ }).check();
  await shop.getByRole("button", { name: "Use this method" }).click();
  await expect(shop.getByRole("button", { name: "Update shipping" })).toBeVisible();
  await expect(shop.locator(".sv-summary-totals")).toContainText("Shipping (Standard)");

  // Moving to Karnataka: not covered, the chosen rate is cleared, and the
  // shopper is told why (not asked for an address they already gave).
  await address.locator("#ship_region").selectOption({ label: "Karnataka" });
  await address.locator("#ship_city").fill("Bengaluru");
  await address.locator("#ship_postalCode").fill("560001");
  await address.getByRole("button", { name: "Update address" }).click();
  await expect(address.locator("#ship_region")).toHaveValue("KA");
  await expect(shipping.getByText(UNAVAILABLE)).toBeVisible();
  await expect(shipping.getByText("Add your shipping address")).toHaveCount(0);
  await expect(options).toHaveCount(0);
  await expect(shop.locator(".sv-summary-totals")).not.toContainText("Shipping (Standard)");
  await expect(shop.locator(".sv-problems")).toContainText(UNAVAILABLE);
  await expect(shop.getByRole("button", { name: /^Pay / })).toBeDisabled();

  // Back in West Bengal: offered again, but not silently re-chosen.
  await address.locator("#ship_region").selectOption({ label: "West Bengal" });
  await address.locator("#ship_city").fill("Kolkata");
  await address.locator("#ship_postalCode").fill("700016");
  await address.getByRole("button", { name: "Update address" }).click();
  await expect(options).toHaveCount(1);
  await expect(shop.getByRole("radio", { name: /Standard/ })).not.toBeChecked();

  // --- The rate made inactive, then deleted: it disappears from checkout. ---
  await page.goto(`${tenant.storePath}/settings/shipping`);
  await editRateActive(page, false);
  await expect(page.getByTestId("shipping-rate-row")).toContainText("Inactive");
  await shop.reload();
  await expect(options).toHaveCount(0);
  await expect(shipping.getByText(UNAVAILABLE)).toBeVisible();

  await editRateActive(page, true);
  await shop.reload();
  await expect(options).toHaveCount(1);

  await page.getByRole("button", { name: "Delete Standard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete rate" }).click();
  await expect(page.getByRole("button", { name: "Edit Standard" })).toHaveCount(0);
  await shop.reload();
  await expect(options).toHaveCount(0);
  await expect(shipping.getByText(UNAVAILABLE)).toBeVisible();
  await context.close();
});
