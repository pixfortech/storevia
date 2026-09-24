import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  captureServerAction,
  createTenant,
  PASSWORD,
  replay,
  signIn,
  signUpAndVerify,
  tokenFromEmail,
  uniqueEmail,
  type Tenant,
} from "./helpers";
import { grantPlan } from "./admin";

test.describe.configure({ mode: "serial" });

let ownerContext: BrowserContext;
let memberContext: BrowserContext;
let owner: Page;
let member: Page;
let A: Tenant;
const memberEmail = uniqueEmail("member");

test.beforeAll(async ({ browser }) => {
  ownerContext = await browser.newContext();
  memberContext = await browser.newContext();
  owner = await ownerContext.newPage();
  member = await memberContext.newPage();
  A = await createTenant(owner, "roles");
  // Inviting staff needs seats beyond the owner (ADR-0022): staff assign a plan.
  await grantPlan(browser, A.orgId);
});

test.afterAll(async () => {
  await ownerContext.close();
  await memberContext.close();
});

test("an unaccepted invitation grants no access", async () => {
  await owner.goto(`${A.orgPath}/members`);
  await owner.getByLabel("Email").fill(memberEmail);
  await owner.getByLabel("Role", { exact: true }).selectOption("VIEWER");
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText("Invitation sent.")).toBeVisible();
  await expect(owner.getByTestId("invitation-row").filter({ hasText: memberEmail })).toBeVisible();

  const token = await tokenFromEmail(memberEmail, "invitation", /\/invitations\/([A-Za-z0-9_-]+)/);
  await signUpAndVerify(member, "Vera Viewer", memberEmail, `/invitations/${token}`);
  await signIn(member, memberEmail);
  // Not a member yet: onboarding, and the store is a 404.
  expect((await member.goto(A.storePath))?.status()).toBe(404);

  await member.goto(`/invitations/${token}`);
  await expect(member.getByRole("heading", { name: /Join Business roles/ })).toBeVisible();
  await member.getByRole("button", { name: "Accept invitation" }).click();
  await member.waitForURL(new RegExp(A.orgPath));
});

test("a VIEWER gets permission-aware navigation and read-only settings", async () => {
  await member.goto(A.storePath);
  const nav = member.getByRole("navigation", { name: "Primary" }).first();
  await expect(nav.getByRole("link", { name: "Products" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Analytics" })).toBeVisible();
  for (const hidden of ["Orders", "Customers", "Website", "Pages"]) {
    await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  }
  await member.goto(`${A.storePath}/settings`);
  await expect(member.getByLabel("Store name")).toBeDisabled();
  await expect(member.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await member.goto(`${A.storePath}/orders`);
  await expect(member.getByText("You don't have access to this area")).toBeVisible();
  await member.goto(`${A.orgPath}/members`);
  await expect(member.getByText("You don't have access to the member list")).toBeVisible();
  await member.goto(`${A.orgPath}/stores/new`);
  await expect(member.getByText("You can't create stores")).toBeVisible();
});

test("a VIEWER cannot bypass permissions with a crafted request", async () => {
  await owner.goto(`${A.storePath}/settings`);
  await owner.getByLabel("Store name").fill("Owner name");
  const action = await captureServerAction(owner, () =>
    owner.getByRole("button", { name: "Save changes" }).click(),
  );
  await expect(owner.getByText("Settings saved.")).toBeVisible();

  const result = await replay(memberContext, action, (b) =>
    b.replace("Owner name", "Viewer was here"),
  );
  expect(result.text).toContain("You don't have permission to do that.");
  await owner.goto(`${A.storePath}/settings`);
  await expect(owner.getByLabel("Store name")).toHaveValue("Owner name");
});

test("a role change applies on the next request", async () => {
  await owner.goto(`${A.orgPath}/members`);
  const row = owner.getByTestId("member-row").filter({ hasText: memberEmail });
  await row.getByLabel(/Role for/).selectOption("STORE_MANAGER");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("Role updated.")).toBeVisible();

  await member.goto(`${A.storePath}/settings`);
  await member.getByLabel("Store name").fill("Managed by store manager");
  await member.getByRole("button", { name: "Save changes" }).click();
  await expect(member.getByText("Settings saved.")).toBeVisible();
  // Still no owner-only powers.
  await member.goto(`${A.orgPath}/stores/new`);
  await expect(member.getByText("You can't create stores")).toBeVisible();
});

test("granting Admin requires a recent password confirmation", async () => {
  await owner.goto(`${A.orgPath}/members`);
  const row = owner.getByTestId("member-row").filter({ hasText: memberEmail });
  await row.getByLabel(/Role for/).selectOption("ADMIN");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(
    owner.getByText("Confirm your password before granting the Admin role."),
  ).toBeVisible();
  await owner.getByRole("link", { name: "Confirm your password" }).click();
  await owner.waitForURL(/\/account\/security/);
  await owner.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await owner.getByRole("button", { name: "Confirm password" }).click();
  await expect(owner.getByText(/Confirmed\./)).toBeVisible();

  await owner.goto(`${A.orgPath}/members`);
  const again = owner.getByTestId("member-row").filter({ hasText: memberEmail });
  await again.getByLabel(/Role for/).selectOption("ADMIN");
  await again.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("Role updated.")).toBeVisible();
});

test("a removed member loses access immediately", async () => {
  await owner.goto(`${A.orgPath}/members`);
  const row = owner.getByTestId("member-row").filter({ hasText: memberEmail });
  await row.getByRole("button", { name: "Remove" }).click();
  await owner.getByRole("button", { name: "Remove member" }).click();
  await expect(owner.getByText("Member removed.")).toBeVisible();

  expect((await member.goto(A.storePath))?.status()).toBe(404);
  expect((await member.goto(A.orgPath))?.status()).toBe(404);
});
