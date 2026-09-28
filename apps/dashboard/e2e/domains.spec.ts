import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN_URL, adminSignIn, createStaff, grantPlan } from "./admin";
import { addRate, addZone, fillDetails, goLive, shopperWithCart } from "./checkout-helpers";
import {
  captureServerAction,
  createTenant,
  replay,
  type Tenant,
  confirmDashboardPassword,
} from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Custom domains end to end (ADR-0032) with the deterministic local
// provider: add a domain, read its DNS records in the dashboard, "publish"
// them with `pnpm domains:simulate`, let the worker verify it, make it
// primary, shop and pay on it, then remove it. Chromium maps *.test to this
// machine; Node requests send the Host header instead.

const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
test.use({
  launchOptions: {
    ...(executablePath ? { executablePath } : {}),
    args: ["--host-resolver-rules=MAP *.test 127.0.0.1"],
  },
});

const ROOT = resolve(import.meta.dirname, "../../..");
const STOREFRONT_PORT = new URL(process.env["E2E_STOREFRONT_URL"] ?? "http://localhost:3002").port;
const stamp = Date.now().toString(36);

/** Sets what the simulated DNS says about `hostname` (the documented dev tool). */
function simulateDns(hostname: string, args: readonly string[]) {
  execFileSync(
    "pnpm",
    ["-s", "--filter", "@storevia/domains", "domains:simulate", hostname, ...args],
    { cwd: ROOT, stdio: "pipe" },
  );
}

const originOf = (hostname: string) => `http://${hostname}:${STOREFRONT_PORT}`;

async function merchantWithPlan(page: Page, browser: Browser, label: string): Promise<Tenant> {
  const tenant = await createTenant(page, label);
  await grantPlan(browser, tenant.orgId);
  return tenant;
}

async function openDomains(page: Page, tenant: Tenant) {
  await page.goto(`${tenant.storePath}/settings/domains`);
  await expect(page.getByRole("heading", { name: "Your domains" })).toBeVisible();
}

const domainCard = (page: Page, hostname: string) =>
  page.locator(`[data-testid="domain-row"][data-hostname="${hostname}"]`);

async function addDomain(page: Page, hostname: string) {
  await page.getByLabel("Domain", { exact: true }).fill(hostname);
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(`${hostname} added.`)).toBeVisible();
}

/** The ownership record's value, read from the DNS records table. */
async function ownershipValue(page: Page, hostname: string): Promise<string> {
  const row = domainCard(page, hostname)
    .getByTestId("dns-records")
    .getByRole("row")
    .filter({ hasText: `_storevia-verification.${hostname}` });
  const value = await row.getByRole("cell").nth(2).locator("span.font-mono").textContent();
  return (value ?? "").trim();
}

test("a custom domain from DNS records to primary, shopping on it, then removal", async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  const tenant = await merchantWithPlan(page, browser, "domains");
  await addZone(page, tenant, "India", ["India"]);
  await addRate(page, "India", "Standard", "50");
  await addProduct(page, tenant, "Stoneware Mug", "450", "20");
  await goLive(page, tenant);
  const platformOrigin = await storefrontOrigin(page, tenant);
  const platformHost = new URL(platformOrigin).hostname;
  const hostname = `shop-${stamp}.test`;
  const origin = originOf(hostname);

  // 1. Settings → Domains: validation, then the records to add.
  await openDomains(page, tenant);
  await expect(page.getByRole("link", { name: "Domains", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByLabel("Domain", { exact: true }).fill(`https://${hostname}/shop`);
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(/without https:\/\/ or a path/).first()).toBeVisible();
  await addDomain(page, hostname);
  const card = domainCard(page, hostname);
  await expect(card.getByTestId("domain-status")).toHaveText("Waiting for DNS");
  await expect(card.getByText("The verification record hasn't been found yet.")).toBeVisible();
  const records = card.getByTestId("dns-records");
  await expect(records.getByRole("columnheader")).toHaveText(["Type", "Name", "Value", "Status"]);
  await expect(records.getByRole("row").filter({ hasText: "TXT" })).toContainText(
    `_storevia-verification.${hostname}`,
  );
  // A root domain gets an A record (a subdomain would get a CNAME).
  const routing = records.getByRole("row").nth(2).getByRole("cell");
  await expect(routing.first()).toHaveText("A");
  await expect(routing.nth(1)).toContainText(hostname);
  await expect(routing.nth(2)).toContainText("192.0.2.10");
  const txt = await ownershipValue(page, hostname);
  expect(txt).toMatch(/^storevia-verification=[A-Za-z0-9_-]{43}$/);
  // Not served while unverified.
  expect((await fetchStore(page.request, origin, "/")).status).toBe(404);

  // 2. DNS "published"; the worker verifies it on its own.
  simulateDns(hostname, ["--txt", txt, "--routed"]);
  await expect
    .poll(
      async () => {
        await page.reload();
        return domainCard(page, hostname).getByTestId("domain-status").textContent();
      },
      { timeout: 180_000, intervals: [5_000] },
    )
    .toBe("Active");
  await expect(card.getByText("HTTPS on")).toBeVisible();
  await expect(card.getByText(`Redirects to ${platformHost}.`)).toBeVisible();
  // Active but not primary: it redirects to the store's primary address.
  await expect
    .poll(async () => (await fetchStore(page.request, origin, "/")).headers["location"], {
      timeout: 60_000,
    })
    .toBe(`${platformOrigin}/`);

  // 3. Primary: the platform address now redirects, keeping path and query.
  await card.getByRole("button", { name: `Make primary ${hostname}` }).click();
  // The card itself is the confirmation: its Make primary button is gone.
  await expect(card.getByText("Primary", { exact: true })).toBeVisible();
  await expect(card.getByText("Your store is served here.")).toBeVisible();
  await expect(domainCard(page, platformHost)).toContainText(`Redirects to ${hostname}.`);
  await expect
    .poll(
      async () =>
        (await fetchStore(page.request, platformOrigin, "/products/stoneware-mug?ref=ad")).headers[
          "location"
        ],
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBe(`${origin}/products/stoneware-mug?ref=ad`);
  // The custom host's cached entry goes when the worker dispatches the
  // change (every 15 s here): poll rather than race it.
  await expect
    .poll(async () => (await fetchStore(page.request, origin, "/")).status, {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBe(200);
  const home = await fetchStore(page.request, origin, "/");
  expect(home.text).toContain(`<link rel="canonical" href="${origin}/"`);
  const sitemap = await fetchStore(page.request, origin, "/sitemap.xml");
  expect(sitemap.status).toBe(200);
  expect(sitemap.text).toContain(`<loc>${origin}/products/stoneware-mug</loc>`);
  expect(sitemap.text).not.toContain(platformHost);
  const robots = await fetchStore(page.request, origin, "/robots.txt");
  expect(robots.text).toContain(`Sitemap: ${origin}/sitemap.xml`);
  // A forged store hint changes nothing: the Host decides.
  const forged = await page.request.get(
    `http://localhost:${STOREFRONT_PORT}/?storeId=${tenant.storeId}`,
    { headers: { host: `unknown-${stamp}.test`, "x-store": tenant.storeId }, maxRedirects: 0 },
  );
  expect(forged.status()).toBe(404);

  // 4. Shopping on the custom domain: cart, checkout, test payment, order.
  const { context: shopper, shop } = await shopperWithCart(browser, origin, "2");
  expect(new URL(shop.url()).hostname).toBe(hostname);
  await fillDetails(shop, `buyer-${stamp}@example.test`);
  await shop.getByRole("button", { name: /^Pay / }).click();
  await shop.waitForURL(/\/checkout\/test-payment\?ref=tp_/);
  expect(new URL(shop.url()).hostname).toBe(hostname);
  await shop.getByRole("button", { name: "Pay successfully" }).click();
  await shop.waitForURL(/\/checkout\/complete$/);
  await expect(shop.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  // Shopper cookies are host-only: never shared with another domain.
  const cookies = await shopper.cookies();
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) expect(cookie.domain).toBe(hostname);
  await shopper.close();
  await page.goto(`${tenant.storePath}/orders`);
  await expect(page.getByText(`buyer-${stamp}@example.test`)).toBeVisible();

  // 5. Staff see it, read-only.
  const staffEmail = await createStaff(browser, "SUPPORT");
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await adminSignIn(staff, staffEmail);
  await staff.goto(`${ADMIN_URL}/domains?q=${hostname}`);
  const staffRow = staff.getByTestId("domain-row").filter({ hasText: hostname });
  await expect(staffRow).toContainText("Active");
  await expect(staff.getByRole("button", { name: /Remove|Make primary|Check/ })).toHaveCount(0);
  await expect(staff.locator("body")).not.toContainText(txt.split("=")[1] ?? "never");
  await staffContext.close();

  // 6. Removal (after a password confirmation, M8): the platform address is
  //    primary again; the domain stops resolving.
  await confirmDashboardPassword(page);
  await openDomains(page, tenant);
  await domainCard(page, hostname)
    .getByRole("button", { name: `Remove ${hostname}` })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(`Your store will be served at ${platformHost} again`);
  await dialog.getByRole("button", { name: "Remove domain" }).click();
  await expect(domainCard(page, hostname)).toHaveCount(0);
  await expect(domainCard(page, platformHost).getByText("Primary", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await fetchStore(page.request, platformOrigin, "/")).status, {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBe(200);
  await expect
    .poll(async () => (await fetchStore(page.request, origin, "/")).status, {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBe(404);
});

test("domains belong to one store: claims, crafted requests and plans", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const hostname = `owned-${stamp}.test`;
  const a = await merchantWithPlan(page, browser, "domain-a");
  await openDomains(page, a);
  await addDomain(page, hostname);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const b = await merchantWithPlan(pageB, browser, "domain-b");
  await openDomains(pageB, b);
  // Another store can't claim it, and isn't told whose it is.
  await pageB.getByLabel("Domain", { exact: true }).fill(hostname);
  await pageB.getByRole("button", { name: "Add domain" }).click();
  await expect(
    pageB.getByText("This domain is already connected to another Storevia store.").first(),
  ).toBeVisible();

  // B's own Remove, replayed with A's domain id, finds nothing.
  const theirs = `mine-${stamp}.test`;
  await addDomain(pageB, theirs);
  const aId = await page.evaluate(() => {
    const m = /domain_[0-9a-z]{26}/.exec(document.documentElement.innerHTML);
    return m?.[0] ?? "";
  });
  const bId = await pageB.evaluate(() => {
    const m = /domain_[0-9a-z]{26}/.exec(document.documentElement.innerHTML);
    return m?.[0] ?? "";
  });
  expect(aId).toMatch(/^domain_/);
  // B is stepped up, so only tenant isolation can stop the replay.
  const bUrl = pageB.url();
  await confirmDashboardPassword(pageB, bUrl);
  const action = await captureServerAction(pageB, async () => {
    await domainCard(pageB, theirs)
      .getByRole("button", { name: `Remove ${theirs}` })
      .click();
    await pageB.getByRole("alertdialog").getByRole("button", { name: "Remove domain" }).click();
  });
  const idor = await replay(contextB, action, (body) => body.replaceAll(bId, aId));
  expect(idor.text).not.toContain("Domain removed.");
  await page.reload();
  await expect(domainCard(page, hostname)).toHaveCount(1);
  await contextB.close();

  // Without the feature, there's no form, and the server refuses anyway.
  const contextC = await browser.newContext();
  const pageC = await contextC.newPage();
  const c = await createTenant(pageC, "domain-free");
  await openDomains(pageC, c);
  await expect(pageC.getByText("Custom domains aren't included in your plan")).toBeVisible();
  await expect(pageC.getByRole("button", { name: "Add domain" })).toHaveCount(0);
  await contextC.close();
});

test("the Domains page fits phone, tablet and desktop with long DNS values", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const tenant = await merchantWithPlan(page, browser, "domain-layout");
  await openDomains(page, tenant);
  const long = `a-very-long-subdomain-label-for-wrapping-${stamp}.shop.example-brand.test`;
  await addDomain(page, long);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no sideways scroll at ${String(width)}px`).toBeLessThanOrEqual(0);
    const card = domainCard(page, long);
    await expect(card.getByText("Waiting for DNS")).toBeVisible();
    await expect(card.getByRole("button", { name: /Copy TXT record value/ }).first()).toBeVisible();
  }
});
