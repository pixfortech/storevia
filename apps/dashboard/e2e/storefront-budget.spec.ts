import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { createTenant } from "./helpers";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";
import { goLiveReady } from "./launch-helpers";

// Storefront JavaScript regression controls (ADR-0029 §4). The fixed 90 kB
// budget is replaced by measurements per route: the framework baseline (the
// scripts every store page loads) and each route's own increment on top.
// The check fails if a route gains its own client code beyond a small
// allowance, if the baseline grows materially past the recorded figure, or
// if any store page loads code that belongs to the dashboard, the editor,
// charts, auth or billing.

/** Recorded on 2026-09-26 (Next.js 16.3, React 19.3): see 06-storefront.md §10. */
const BASELINE_RECORDED_GZIP = 173_000;
/** Growth tolerated before the baseline counts as a regression (framework updates move it). */
const BASELINE_TOLERANCE = 1.15;
/** Client JavaScript a single route may add on top of the baseline. */
const ROUTE_INCREMENT_ALLOWANCE_GZIP = 8_000;
/** Strings that only appear in code a public store page must never load. */
const FORBIDDEN = [
  /ProseMirror/,
  /tiptap/i,
  /recharts/i,
  /better-auth/i,
  /platform-admin/i,
  /createMediaUpload|setStorefrontLive|assignPlan/,
];

test("store pages ship the framework runtime and no application code", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "budget");
  const editor = await addProduct(page, tenant, "Stoneware mug", "999.50", "5");
  await page.goto(`${tenant.storePath}/products/collections`);
  await page.getByRole("button", { name: "Create collection" }).first().click();
  await page.getByRole("dialog").getByLabel("Title").fill("Summer");
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/collections\/coll_/);
  await page.goto(editor);
  await page.getByLabel("Add to collection").selectOption({ label: "Summer" });
  await expect(page.getByRole("button", { name: /Remove from Summer/ })).toBeVisible();

  // A content page (Milestone 5), published.
  await page.goto(`${tenant.storePath}/pages`);
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog", { name: "New page" }).getByLabel("Title").fill("About us");
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/website\/pages\/page_/);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  const origin = await storefrontOrigin(page, tenant);
  await goLiveReady(page, tenant);

  const shopper = await browser.newContext();
  await expect
    .poll(
      async () =>
        (await fetchStore(shopper.request, origin, "/collections/summer")).text.includes(
          "Stoneware mug",
        ),
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(true);

  await expect
    .poll(async () => (await fetchStore(shopper.request, origin, "/pages/about-us")).status, {
      timeout: 60_000,
      intervals: [1_000],
    })
    .toBe(200);

  const routes = {
    home: "/",
    page: "/pages/about-us",
    product: "/products/stoneware-mug",
    collection: "/collections/summer",
    search: "/search?q=mug",
    cart: "/cart",
  } as const;
  const shop = await shopper.newPage();
  const scriptsByRoute = new Map<string, Set<string>>();
  const vitals: Record<string, { lcpMs: number; cls: number; ttfbMs: number; htmlBytes: number }> =
    {};
  for (const [name, path] of Object.entries(routes)) {
    const response = await shop.goto(`${origin}${path}`);
    expect(response?.status(), name).toBe(200);
    await shop.waitForLoadState("networkidle");
    // Web vitals from the browser's own observers (local, uncached-at-the-edge figures).
    const measured = await shop.evaluate(
      () =>
        new Promise<{ lcpMs: number; cls: number; ttfbMs: number }>((resolve) => {
          let lcp = 0;
          let cls = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) lcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) cls += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => {
            const nav = performance.getEntriesByType("navigation")[0] as
              PerformanceNavigationTiming | undefined;
            resolve({ lcpMs: Math.round(lcp), cls, ttfbMs: Math.round(nav?.responseStart ?? 0) });
          }, 500);
        }),
    );
    vitals[name] = { ...measured, htmlBytes: (await response?.body())?.length ?? 0 };
    const urls = await shop.evaluate(() => [
      ...new Set([
        ...[...document.querySelectorAll("script[src]")].map((s) => (s as HTMLScriptElement).src),
        ...performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((n) => /\.js(\?|$)/.test(n)),
      ]),
    ]);
    scriptsByRoute.set(name, new Set(urls.map((u) => new URL(u).pathname)));
  }

  // Static chunks are served for any host (the proxy doesn't touch /_next/static).
  const port = new URL(origin).port;
  const sizes = new Map<string, number>();
  const bodies = new Map<string, string>();
  for (const path of new Set([...scriptsByRoute.values()].flatMap((s) => [...s]))) {
    const response = await shopper.request.get(`http://localhost:${port}${path}`);
    expect(response.status(), path).toBe(200);
    const body = await response.body();
    sizes.set(path, gzipSync(body).length);
    bodies.set(path, body.toString("utf8"));
  }
  const gz = (paths: Iterable<string>) => [...paths].reduce((n, p) => n + (sizes.get(p) ?? 0), 0);
  const all = [...scriptsByRoute.values()];
  const baseline = [...(all[0] ?? [])].filter((p) => all.every((s) => s.has(p)));
  const report = {
    vitals,
    baselineGzip: gz(baseline),
    baselineScripts: baseline.length,
    routes: Object.fromEntries(
      [...scriptsByRoute].map(([name, scripts]) => {
        const own = [...scripts].filter((p) => !baseline.includes(p));
        return [name, { totalGzip: gz(scripts), incrementGzip: gz(own), ownScripts: own }];
      }),
    ),
  };
  await testInfo.attach("storefront-js.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  console.log(`storefront JS (gzip bytes): ${JSON.stringify(report)}`);

  expect(report.baselineGzip).toBeLessThanOrEqual(
    Math.round(BASELINE_RECORDED_GZIP * BASELINE_TOLERANCE),
  );
  for (const [name, measured] of Object.entries(vitals)) {
    expect(measured.cls, `${name} layout shift`).toBeLessThanOrEqual(0.1);
    expect(measured.lcpMs, `${name} largest contentful paint`).toBeLessThanOrEqual(2_500);
  }
  for (const [name, route] of Object.entries(report.routes)) {
    expect(route.incrementGzip, `${name} adds its own client JavaScript`).toBeLessThanOrEqual(
      ROUTE_INCREMENT_ALLOWANCE_GZIP,
    );
  }
  const leaks = [...bodies].flatMap(([path, body]) =>
    FORBIDDEN.filter((re) => re.test(body)).map((re) => `${path}: ${String(re)}`),
  );
  expect(leaks).toEqual([]);
  await shopper.close();
});
