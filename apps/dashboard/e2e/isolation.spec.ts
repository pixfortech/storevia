// HTTP-level tenant isolation (docs/architecture/03-tenancy.md §8): route
// parameter tampering, malformed identifiers and crafted Server Action
// requests. Service- and database-level proofs live in the integration suites.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { grantPlan } from "./admin";
import { captureServerAction, createTenant, replay, type Tenant } from "./helpers";

test.describe.configure({ mode: "serial" });

let contextA: BrowserContext;
let contextB: BrowserContext;
let pageA: Page;
let pageB: Page;
let A: Tenant;
let B: Tenant;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  contextA = await browser.newContext();
  contextB = await browser.newContext();
  pageA = await contextA.newPage();
  pageB = await contextB.newPage();
  A = await createTenant(pageA, "tenant-a");
  B = await createTenant(pageB, "tenant-b");
  await grantPlan(browser, A.orgId); // seats for the invitation tests (ADR-0022)
});

test.afterAll(async () => {
  await contextA.close();
  await contextB.close();
});

async function storeName(page: Page, tenant: Tenant): Promise<string> {
  await page.goto(`${tenant.storePath}/settings`);
  return page.getByLabel("Store name").inputValue();
}

test("User A cannot open Store B or Organisation B by changing route parameters", async () => {
  for (const path of [
    B.storePath,
    `${B.storePath}/settings`,
    `${B.storePath}/orders`,
    B.orgPath,
    `${B.orgPath}/members`,
    `${B.orgPath}/settings`,
    `${B.orgPath}/stores/new`,
  ]) {
    const response = await pageA.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(pageA.getByText("We couldn't find that page")).toBeVisible();
    await expect(pageA.getByText(B.email)).toHaveCount(0);
  }
});

test("malformed identifiers are 404s", async () => {
  for (const path of [
    "/s/not-an-id",
    `/s/${A.orgId}`,
    `/o/${A.storeId}`,
    "/s/store_' OR '1'='1",
    `/s/${A.storeId}x`,
    "/s/0190f2a4-0000-7000-8000-000000000000",
  ]) {
    const response = await pageA.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("User A cannot enumerate Tenant B through the switchers", async () => {
  await pageA.goto(A.storePath);
  await pageA
    .getByRole("button", { name: /Switch store/ })
    .first()
    .click();
  const menu = pageA.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByText("tenant-b")).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Business tenant-a" })).toBeVisible();
});

test("crafted Server Action requests cannot read or change another tenant's store", async () => {
  await pageA.goto(`${A.storePath}/settings`);
  await pageA.getByLabel("Store name").fill("A legit name");
  const action = await captureServerAction(pageA, () =>
    pageA.getByRole("button", { name: "Save changes" }).click(),
  );
  await expect(pageA.getByText("Settings saved.")).toBeVisible();

  const body = action.body.toString("latin1");
  expect(body, "the bound store ID travels in the request").toContain(A.storeId);
  const bNameBefore = await storeName(pageB, B);

  // 1. Tenant B replays Tenant A's request with B's own session.
  const asB = await replay(contextB, action);
  expect(asB.text).toContain("Not found");
  expect(await storeName(pageA, A)).toBe("A legit name");

  // 2. Tenant A rewrites the store ID to Store B (IDOR attempt).
  const idor = await replay(contextA, action, (b) =>
    b.replaceAll(A.storeId, B.storeId).replace("A legit name", "pwned by A"),
  );
  expect(idor.text).toContain("Not found");
  expect(await storeName(pageB, B)).toBe(bNameBefore);

  // 3. No session at all.
  const anonymous = await pageA.context().browser()?.newContext();
  if (!anonymous) throw new Error("no context");
  const anon = await replay(anonymous, action, (b) =>
    b.replace("A legit name", "pwned anonymously"),
  );
  expect([303, 307, 308]).toContain(anon.status);
  expect(await storeName(pageA, A)).toBe("A legit name");
});

test("crafted invitation requests cannot target another organisation", async () => {
  await pageA.goto(`${A.orgPath}/members`);
  await pageA.getByLabel("Email").fill(`invitee-${Date.now().toString(36)}@example.test`);
  const action = await captureServerAction(pageA, () =>
    pageA.getByRole("button", { name: "Send invitation" }).click(),
  );
  await expect(pageA.getByText("Invitation sent.")).toBeVisible();

  const hijack = await replay(contextA, action, (b) =>
    b
      .replaceAll(A.orgId, B.orgId)
      .replace(/invitee-[a-z0-9]+@example\.test/, "attacker@example.test"),
  );
  expect(hijack.text).toContain("Not found");
  await pageB.goto(`${B.orgPath}/members`);
  await expect(pageB.getByText("attacker@example.test")).toHaveCount(0);
});
