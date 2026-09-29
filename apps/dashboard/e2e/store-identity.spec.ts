import { expect, test } from "@playwright/test";
import { addRate, addZone, fillDetails, shopperWithCart } from "./checkout-helpers";
import { captureServerAction, createTenant, replay } from "./helpers";
import {
  fillSellerDetails,
  REQUIRED_POLICIES,
  SAMPLE_SELLER,
  writeAndPublishPolicy,
} from "./identity-helpers";
import { connectTestPayments, setSupportEmail } from "./launch-helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Final pass, Phase 2A: a store's public seller identity and its policies.
// The merchant fills the seller details and writes each policy (starter
// headings are a template; headings alone can't be published); the launch
// checks wait for both; the storefront shows them in the footer, on policy
// pages, on the contact page and by the Pay button, escaped; and another
// tenant can neither open the editor nor replay a save against the store.

const LEGAL_NAME = "<b>Clay</b> Studio <script>alert(1)</script> LLP";
const OWN_TEXT = "Unused items can be returned within 7 days of delivery for a full refund.";

test("seller details and policies: required to go live, shown on the store, escaped and isolated", async ({
  page,
  browser,
}) => {
  test.setTimeout(480_000);
  const tenant = await createTenant(page, "identity");
  await addProduct(page, tenant, "Stoneware mug", "450", "20");
  const origin = await storefrontOrigin(page, tenant);
  await setSupportEmail(page, tenant, "help@clay.example");
  await connectTestPayments(page, tenant);
  await addZone(page, tenant, "India", ["India"]);
  await addRate(page, "India", "Standard", "50");

  // The launch checks name what's left, each linked to where it's fixed.
  await page.goto(`${tenant.storePath}/settings`);
  const list = page.getByTestId("launch-readiness");
  const check = (key: string) => list.locator(`[data-check="${key}"]`);
  await expect(check("seller")).toHaveAttribute("data-state", "missing");
  await expect(check("policies")).toHaveAttribute("data-state", "missing");
  await expect(list).toContainText("Before you go live: 2 steps left");
  await expect(page.getByRole("button", { name: "Go live" })).toBeDisabled();
  await check("seller").getByRole("link", { name: /Fix/ }).click();
  await page.waitForURL(/\/settings#seller$/);

  // Seller details: checked on the server, then saved.
  const seller = page.locator("#seller");
  await seller.getByLabel("Phone").fill("call me");
  await seller.getByRole("button", { name: "Save seller details" }).click();
  await expect(seller.getByText(/Enter a phone number with digits/)).toBeVisible();
  await fillSellerDetails(page, tenant, { ...SAMPLE_SELLER, legalName: LEGAL_NAME });
  await expect(check("seller")).toHaveAttribute("data-state", "ok");
  await expect(check("policies")).toHaveAttribute("data-state", "missing");

  // Policies: every kind listed with its status and whether it's required.
  await check("policies").getByRole("link", { name: /Fix/ }).click();
  await page.waitForURL(/\/settings\/policies$/);
  await expect(page.getByTestId("policy-row")).toHaveCount(6);
  const refundsRow = page.locator('[data-testid="policy-row"][data-kind="refunds"]');
  await expect(refundsRow).toHaveAttribute("data-status", "empty");
  await expect(refundsRow).toContainText("Required to go live");
  await expect(page.getByTestId("policies-readiness")).toContainText("Write and publish your");
  await refundsRow.getByRole("link", { name: /^Write/ }).click();
  await page.waitForURL(/\/settings\/policies\/refunds$/);

  // Starter headings: a marked template, never policy text.
  await expect(page.getByText("Starter headings are a template")).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Policy text" });
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "Insert starter headings" }).click();
  await expect(editor.getByRole("heading", { name: "Returns", exact: true })).toBeVisible();
  await expect(editor.getByRole("heading", { name: "Refunds", exact: true })).toBeVisible();
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeDisabled();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(page.getByTestId("policy-status")).toHaveText("Draft");

  // Headings alone are refused by the server too (the button forced on).
  await publish.evaluate((button) => {
    button.removeAttribute("disabled");
  });
  await publish.click();
  await expect(page.getByText(/Write the policy before publishing it/)).toBeVisible();
  await expect(page.getByTestId("policy-status")).toHaveText("Draft");

  // The merchant's own words under the headings: published. A fresh page
  // first: the button's disabled attribute was removed by hand above, and
  // React won't restore it while its prop stays the same.
  await page.reload();
  await expect(editor.getByRole("heading", { name: "Refunds", exact: true })).toBeVisible();
  await expect(publish).toBeDisabled();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await editor.pressSequentially(OWN_TEXT);
  await expect(editor.locator("p", { hasText: OWN_TEXT })).toBeVisible();
  await expect(publish).toBeEnabled();
  await publish.click();
  // Whatever the form says, so a refusal shows up in the failure itself.
  await expect(
    page.getByText(/^(Published\. Shoppers|Write the policy before|This policy was changed)/),
  ).toHaveText("Published. Shoppers can read it on your store.");
  await expect(page.getByTestId("policy-status")).toHaveText("Published");
  await expect(page.getByRole("link", { name: /View on your store/ })).toHaveAttribute(
    "href",
    `${origin}/policies/refunds`,
  );

  for (const handle of REQUIRED_POLICIES) await writeAndPublishPolicy(page, tenant, handle);
  await writeAndPublishPolicy(
    page,
    tenant,
    "contact",
    "Customer support is open Monday to Friday, 10am to 6pm.",
  );

  // Two tabs on one draft: the older save is refused, not silently applied.
  // (The refused tab keeps unsaved edits: leaving it asks first, accepted here.)
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  const cancellation = `${tenant.storePath}/settings/policies/cancellation`;
  const otherTab = await page.context().newPage();
  await page.goto(cancellation);
  await otherTab.goto(cancellation);
  await otherTab.getByLabel("Title", { exact: true }).fill("Cancelling an order");
  await otherTab.getByRole("button", { name: "Save draft" }).click();
  await expect(otherTab.getByText("Draft saved.")).toBeVisible();
  await otherTab.close();
  await page.getByLabel("Title", { exact: true }).fill("Cancellations");
  const save = await captureServerAction(page, async () => {
    await page.getByRole("button", { name: "Save draft" }).click();
  });
  await expect(page.getByText(/This policy was changed somewhere else/)).toBeVisible();

  // An unknown policy in the URL is a 404.
  expect((await page.goto(`${tenant.storePath}/settings/policies/returns`))?.status()).toBe(404);

  // Ready: go live.
  await page.goto(`${tenant.storePath}/settings`);
  await expect(list).toContainText("Ready to go live");
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();

  // The storefront: the footer from the store's own data, text escaped.
  const shopper = await browser.newContext();
  const shop = await shopper.newPage();
  let alerted = false;
  shop.on("dialog", (dialog) => {
    alerted = true;
    void dialog.dismiss();
  });
  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/")).text.includes("MG Road"), {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toBe(true);
  const home = await fetchStore(shopper.request, origin, "/");
  expect(home.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(home.text).not.toContain("<script>alert(1)</script>");
  expect(home.text).not.toContain("<b>Clay</b>");

  await shop.goto(`${origin}/`);
  const footer = shop.getByRole("contentinfo");
  await expect(footer).toContainText(LEGAL_NAME);
  await expect(footer).toContainText("12 MG Road");
  await expect(footer).toContainText("Bengaluru, Karnataka, 560001");
  await expect(footer.getByRole("link", { name: "help@clay.example" })).toHaveAttribute(
    "href",
    "mailto:help@clay.example",
  );
  await expect(footer.getByRole("link", { name: SAMPLE_SELLER.phone })).toHaveAttribute(
    "href",
    "tel:+918040001234",
  );
  await expect(footer.locator("b, script")).toHaveCount(0);
  const policyNav = footer.getByRole("navigation", { name: "Policies" });
  for (const name of [
    "Shipping policy",
    "Returns and refunds",
    "Privacy policy",
    "Terms of service",
    "Contact us",
  ])
    await expect(policyNav.getByRole("link", { name, exact: true })).toBeVisible();
  // The draft-only cancellation policy isn't linked.
  await expect(policyNav.getByRole("link", { name: /Cancel/ })).toHaveCount(0);

  // Each policy page renders the published text.
  await policyNav.getByRole("link", { name: "Returns and refunds", exact: true }).click();
  await shop.waitForURL(/\/policies\/refunds$/);
  await expect(shop.getByRole("heading", { level: 1, name: "Returns and refunds" })).toBeVisible();
  await expect(shop.getByRole("heading", { level: 2, name: "Returns", exact: true })).toBeVisible();
  await expect(shop.getByText(OWN_TEXT)).toBeVisible();
  await expect(shop).toHaveTitle(/^Returns and refunds/);
  for (const handle of ["privacy", "terms", "shipping"]) {
    const response = await shop.goto(`${origin}/policies/${handle}`);
    expect(response?.status(), handle).toBe(200);
    await expect(shop.getByText(`This is the ${handle} policy of this store`)).toBeVisible();
  }
  for (const missing of ["/policies/cancellation", "/policies/returns"]) {
    expect((await fetchStore(shopper.request, origin, missing)).status, missing).toBe(404);
  }

  // The contact page: who the seller is and how to reach them.
  await shop.goto(`${origin}/policies/contact`);
  await expect(shop.getByRole("heading", { level: 1, name: "Contact us" })).toBeVisible();
  const details = shop.getByTestId("contact-details");
  await expect(details).toContainText(LEGAL_NAME);
  await expect(details).toContainText("12 MG Road");
  await expect(details.getByRole("link", { name: "help@clay.example" })).toHaveAttribute(
    "href",
    "mailto:help@clay.example",
  );
  await expect(details.getByRole("link", { name: SAMPLE_SELLER.phone })).toBeVisible();
  await expect(shop.getByText("Customer support is open Monday to Friday")).toBeVisible();

  // The sitemap lists the published policies and the contact page.
  const sitemap = (await fetchStore(shopper.request, origin, "/sitemap.xml")).text;
  expect(sitemap).toContain("/policies/refunds</loc>");
  expect(sitemap).toContain("/policies/contact</loc>");
  expect(sitemap).not.toContain("/policies/cancellation");
  await shopper.close();

  // Checkout: the published terms, returns, shipping and privacy policies by the Pay button.
  const { context: buyer, shop: checkout } = await shopperWithCart(browser, origin, "1");
  await fillDetails(checkout, "buyer@example.test");
  const note = checkout.getByTestId("checkout-policies");
  await expect(note).toContainText("By placing your order you agree to our Terms of service");
  for (const name of ["Returns and refunds", "Shipping policy", "Privacy policy"])
    await expect(note.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  const [popup] = await Promise.all([
    checkout.waitForEvent("popup"),
    note.getByRole("link", { name: /^Terms of service/ }).click(),
  ]);
  await expect(popup.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
  await expect(checkout.getByRole("button", { name: /^Pay / })).toBeEnabled();
  await buyer.close();
  expect(alerted, "no merchant text ran as script").toBe(false);

  // Another tenant: no editor, and a replayed save is refused either way.
  const otherContext = await browser.newContext();
  const intruder = await otherContext.newPage();
  const other = await createTenant(intruder, "identity-b");
  const denied = await intruder.goto(`${tenant.storePath}/settings/policies/refunds`);
  expect(denied?.status()).toBe(404);
  // The other tenant replays this store's save with its own session...
  const asOther = await replay(otherContext, save);
  expect(asOther.text).toContain("Not found");
  // ...and this merchant can't aim it at the other tenant's store.
  const idor = await replay(page.context(), save, (body) =>
    body.replaceAll(tenant.storeId, other.storeId),
  );
  expect(idor.text).toContain("Not found");
  await intruder.goto(`${other.storePath}/settings/policies/cancellation`);
  await expect(intruder.getByTestId("policy-status")).toHaveText("Not written");
  await page.goto(cancellation);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Cancelling an order");
  await otherContext.close();
});
