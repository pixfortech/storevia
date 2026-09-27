import { expect, test, type Page } from "@playwright/test";
import { createTenant } from "./helpers";
import { images } from "./images";
import { addProduct, fetchStore, storefrontOrigin } from "./storefront-helpers";

// Processed product images, as a shopper's browser loads them on the store's
// own origin ({store}.store.localhost:3002) from the media origin (locally
// the dashboard, app.localhost:3001; in production the media CDN). The two
// are different sites, so the public media response must allow cross-origin
// embedding (Cross-Origin-Resource-Policy: cross-origin): with "same-site"
// the browser refuses every image (net::ERR_BLOCKED_BY_RESPONSE.NotSameSite).
// Raw uploads stay unservable.

/** Every product image on the page loaded and decoded, and every srcset rendition decodes too. */
async function assertImagesDecode(page: Page, label: string): Promise<string[]> {
  const main = page.locator("main img[src*='/media/']");
  await expect(main.first(), `${label}: a product image`).toBeVisible();
  await expect
    .poll(
      () =>
        main.evaluateAll((imgs) =>
          imgs.every(
            (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
      { message: `${label}: every product image displays`, timeout: 15_000 },
    )
    .toBe(true);
  // Each candidate of every srcset, loaded by this page (the storefront origin).
  const candidates = await main.evaluateAll((imgs) => [
    ...new Set(
      imgs.flatMap((i) =>
        ((i as HTMLImageElement).srcset || (i as HTMLImageElement).src)
          .split(",")
          .map((c) => c.trim().split(/\s+/)[0] ?? "")
          .filter(Boolean),
      ),
    ),
  ]);
  const decoded = await page.evaluate(
    (urls) =>
      Promise.all(
        urls.map(async (url) => {
          const img = new Image();
          img.src = url;
          try {
            await img.decode();
            return { url, ok: img.naturalWidth > 0 };
          } catch {
            return { url, ok: false };
          }
        }),
      ),
    candidates,
  );
  expect(
    decoded.filter((d) => !d.ok).map((d) => d.url),
    `${label}: renditions refused`,
  ).toEqual([]);
  return candidates;
}

test("storefront pages display processed product images from the media origin", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tenant = await createTenant(page, "sf-media");
  const editor = await addProduct(page, tenant, "Stoneware mug", "999.50", "5");

  // A 1600 px photo, so the 320, 640 and 1280 renditions exist.
  const [jpeg] = await images(page, 1600);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload" }).click(),
  ]);
  await chooser.setFiles(jpeg ? [jpeg] : []);
  const tile = page.locator("li:has(button[aria-label^='Options for image']) img");
  await expect(tile).toHaveCount(1, { timeout: 60_000 });
  // The dashboard itself still shows it (this page is on app.localhost).
  await expect
    .poll(() => tile.evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  await page.goto(`${tenant.storePath}/products/collections`);
  await page.getByRole("button", { name: "Create collection" }).first().click();
  await page.getByRole("dialog").getByLabel("Title").fill("Summer");
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/collections\/coll_/);
  await page.goto(editor);
  await page.getByLabel("Add to collection").selectOption({ label: "Summer" });
  await expect(page.getByRole("button", { name: /Remove from Summer/ })).toBeVisible();

  const origin = await storefrontOrigin(page, tenant);
  await page.goto(`${tenant.storePath}/settings`);
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByText("Your store is live.")).toBeVisible();

  const shopper = await browser.newContext();
  await expect
    .poll(
      async () =>
        (await fetchStore(shopper.request, origin, "/collections/summer")).text.includes(
          "/w640.webp",
        ),
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(true);

  const shop = await shopper.newPage();
  const refused: string[] = [];
  shop.on("requestfailed", (r) => {
    if (r.url().includes("/media/")) refused.push(`${r.url()} ${r.failure()?.errorText ?? ""}`);
  });

  // The storefront allows images from its own origin and the media origin only.
  const home = await shop.goto(`${origin}/`);
  const csp = home?.headers()["content-security-policy"] ?? "";
  expect(/img-src ([^;]+)/.exec(csp)?.[1]?.trim().split(/\s+/)).toEqual([
    "'self'",
    "data:",
    "blob:",
    "http://app.localhost:3001",
  ]);

  const renditions = new Set<string>();
  for (const [label, path] of [
    ["home", "/"],
    ["product", "/products/stoneware-mug"],
    ["collection", "/collections/summer"],
  ] as const) {
    if (path !== "/") await shop.goto(`${origin}${path}`);
    for (const url of await assertImagesDecode(shop, label)) renditions.add(url);
  }
  const names = [...renditions].map((u) => u.split("/").pop());
  expect(names).toEqual(expect.arrayContaining(["w640.webp", "w1280.webp"]));
  expect(refused).toEqual([]);

  // The public media response: embeddable anywhere, without CORS, nosniff.
  const sample = new URL([...renditions][0] ?? "");
  const direct = (path: string) =>
    shopper.request.get(`http://localhost:${sample.port}${path}`, {
      headers: { host: sample.host },
    });
  const served = await direct(sample.pathname);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/webp");
  expect(served.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect(served.headers()["access-control-allow-origin"]).toBeUndefined();

  // Raw and temporary uploads are never served, by either key shape.
  const [org, store, media] = sample.pathname.replace(/^\/media\//, "").split("/");
  for (const path of [
    `/media/uploads/${org ?? ""}/${store ?? ""}/${media ?? ""}`,
    `/media/${org ?? ""}/${store ?? ""}/${media ?? ""}/upload`,
    `/media/${org ?? ""}/${store ?? ""}/${media ?? ""}/..%2Fupload`,
  ]) {
    const response = await direct(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()["cross-origin-resource-policy"], path).not.toBe("cross-origin");
  }
  await shopper.close();
});
