import { expect, test, type Page } from "@playwright/test";
import { createTenant, type Tenant } from "./helpers";
import { fetchStore, storefrontOrigin } from "./storefront-helpers";

// The builder's draft lifecycle after publishing (PB-1, PB-2) and its
// field-level validation (PB-3): editing carries on after Publish with no
// false "saved somewhere else", nothing typed after a publish is lost on
// reload, a stale tab still gets a real conflict, "Revert to published"
// brings the live content back into the draft without touching the live
// site, and an invalid field is named (section and field) and never sent.

const canvas = (page: Page) => page.frameLocator('iframe[title="Page preview"]');
const sections = (page: Page) => page.getByRole("navigation", { name: "Page sections" });
const heading = (page: Page) => page.getByRole("textbox", { name: "Heading", exact: true });

async function goLive(page: Page, storePath: string) {
  await page.goto(`${storePath}/settings`);
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();
}

async function newPage(page: Page, tenant: Tenant, title: string): Promise<string> {
  await page.goto(`${tenant.storePath}/pages`);
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog", { name: "New page" }).getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/website\/pages\/page_/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url();
}

async function saved(page: Page) {
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 20_000 });
}

/** "Save draft", unless autosave got there first (the button is disabled once saved). */
async function saveDraft(page: Page) {
  await page
    .getByRole("button", { name: "Save draft" })
    .click({ timeout: 2_000 })
    .catch(() => undefined);
}

async function editTextHeading(page: Page, from: string, to: string) {
  await sections(page)
    .getByRole("button", { name: `Text: ${from}`, exact: true })
    .click();
  await heading(page).fill(to);
  await expect(canvas(page).getByRole("heading", { name: to })).toBeVisible();
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Published\. Your site shows these changes now\./)).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
}

test("publish, keep editing, reload, publish again, and revert to published", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "drafts");
  const origin = await storefrontOrigin(page, tenant);
  await goLive(page, tenant.storePath);
  const shopper = await browser.newContext();
  const liveText = async () => (await fetchStore(shopper.request, origin, "/pages/journal")).text;
  const expectLive = async (text: string) => {
    await expect.poll(liveText, { timeout: 60_000, intervals: [1_000] }).toContain(text);
  };

  await newPage(page, tenant, "Journal");
  await editTextHeading(page, "Journal", "Version one");
  await saveDraft(page);
  await saved(page);
  await publish(page);
  await expectLive("Version one");
  // Nothing new to publish until the next edit.
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();

  // Editing right after publishing autosaves into the new draft: no conflict.
  await editTextHeading(page, "Version one", "Version two");
  await saved(page);
  await expect(page.getByText("This page changed somewhere else")).toBeHidden();
  await expect(page.getByText("Unpublished changes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  // The edit survives a reload, and the live page is still the published one.
  await page.reload();
  await expect(
    sections(page).getByRole("button", { name: "Text: Version two", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Unpublished changes")).toBeVisible();
  expect(await liveText()).toContain("Version one");

  // "Save draft" after a second publish works the same way.
  await publish(page);
  await expectLive("Version two");
  await editTextHeading(page, "Version two", "Version three");
  await saveDraft(page);
  await saved(page);
  await expect(page.getByText("This page changed somewhere else")).toBeHidden();

  // Revert to published: asks first, then the draft is the live content again.
  await page.getByRole("button", { name: "Revert to published" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Revert to the published version?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Revert", exact: true }).click();
  await expect(page.getByText("Your draft is back to the published version.")).toBeVisible();
  await expect(confirm).toBeHidden();
  await expect(
    sections(page).getByRole("button", { name: "Text: Version two", exact: true }),
  ).toBeVisible();
  await sections(page).getByRole("button", { name: "Text: Version two", exact: true }).click();
  await expect(heading(page)).toHaveValue("Version two");
  await expect(canvas(page).getByRole("heading", { name: "Version two" })).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revert to published" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  expect(await liveText()).toContain("Version two");
  expect(await liveText()).not.toContain("Version three");
  await page.reload();
  await expect(
    sections(page).getByRole("button", { name: "Text: Version two", exact: true }),
  ).toBeVisible();
  await shopper.close();
});

test("two tabs: a save after the other tab saved or published is a real conflict", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "twotabs");
  const builder = await newPage(page, tenant, "Visit");
  const other = await page.context().newPage();
  await other.goto(builder);
  await expect(other.getByRole("heading", { level: 1, name: "Visit" })).toBeVisible();

  // Tab A saves; tab B (still at the old revision) edits: refused, nothing overwritten.
  await editTextHeading(page, "Visit", "From tab A");
  await saveDraft(page);
  await saved(page);
  await editTextHeading(other, "Visit", "From tab B");
  await saveDraft(other);
  await expect(other.getByText("This page changed somewhere else")).toBeVisible();
  await expect(other.getByText("Not saved: changed elsewhere")).toBeVisible();
  await other.reload();
  await expect(
    sections(other).getByRole("button", { name: "Text: From tab A", exact: true }),
  ).toBeVisible();

  // Tab A publishes (a new draft starts); tab B's revision is stale again.
  await publish(page);
  await editTextHeading(other, "From tab A", "Late from tab B");
  await expect(other.getByText("This page changed somewhere else")).toBeVisible({
    timeout: 20_000,
  });
  // Tab A keeps editing without any conflict, and its work is what's stored.
  await editTextHeading(page, "From tab A", "Still tab A");
  await saved(page);
  await expect(page.getByText("This page changed somewhere else")).toBeHidden();
  await page.reload();
  await expect(
    sections(page).getByRole("button", { name: "Text: Still tab A", exact: true }),
  ).toBeVisible();
  await other.close();
});

test("an invalid field is named, shown and fixed; nothing is lost meanwhile", async ({ page }) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "fields");
  await newPage(page, tenant, "Offers");

  // A hero with a button, after the text section.
  await sections(page).getByRole("button", { name: "Text: Offers", exact: true }).click();
  await page.getByRole("button", { name: "Add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .getByRole("button", { name: /^Hero/ })
    .click();
  await page.getByRole("button", { name: "Add button", exact: true }).click();
  const buttonText = page.getByRole("textbox", { name: "Button text" });
  await expect(buttonText).toHaveAttribute("maxlength", "80");
  await saved(page);

  // Clearing the button's text: the problem is named, the save isn't sent.
  await buttonText.fill("");
  await expect(buttonText).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter at least 1 character.").first()).toBeVisible();
  const problems = page.getByRole("alert", { name: "Problems on this page" });
  await expect(problems).toContainText(
    "Section 2 · Hero › Button › Button text: Enter at least 1 character.",
  );
  await expect(page.getByText("Not saved — fix 1 problem")).toBeVisible();
  await expect(sections(page).getByRole("button", { name: /^Hero\b.*Needs a fix/ })).toBeVisible();

  // A valid edit elsewhere is kept locally, not lost, while the problem stands.
  await editTextHeading(page, "Offers", "Weekly offers");
  await page.waitForTimeout(2_500); // longer than the autosave delay
  await expect(page.getByText("Not saved — fix 1 problem")).toBeVisible();

  // "Show" selects the section and focuses the field.
  await problems.getByRole("button", { name: /^Show Section 2 · Hero/ }).click();
  await expect(buttonText).toBeFocused();

  // Fixing it lets autosave carry on; both edits are stored.
  await buttonText.fill("See the offers");
  await expect(problems).toBeHidden();
  await saved(page);
  await page.reload();
  await expect(
    sections(page).getByRole("button", { name: "Text: Weekly offers", exact: true }),
  ).toBeVisible();
  await sections(page).getByRole("button", { name: "Hero", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Button text" })).toHaveValue("See the offers");
});
