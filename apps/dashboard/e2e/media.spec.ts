import { expect, test, type Page } from "@playwright/test";
import { captureServerAction, createTenant, replay, type Tenant } from "./helpers";

// Product media end to end, on http://localhost:3001: the address Next.js
// prints and many people open, which isn't the configured DASHBOARD_URL
// (app.localhost). Local media and uploads must work on whichever host the
// dashboard is opened (they are same-origin paths), not only on the one in
// the configuration: before the fix, every image here was refused by the
// page's Content-Security-Policy.
test.use({ baseURL: "http://localhost:3001" });

/** A real image in each format, drawn by the browser (no image library needed here). */
async function images(page: Page) {
  const encoded = await page.evaluate(async () => {
    const draw = async (type: string, colour: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = "#fff";
      ctx.fillRect(100, 100, 300, 200);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, type, 0.9);
      });
      if (blob?.type !== type) throw new Error(`can't encode ${type}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary);
    };
    return {
      jpeg: await draw("image/jpeg", "#b45309"),
      png: await draw("image/png", "#1d4ed8"),
      webp: await draw("image/webp", "#15803d"),
    };
  });
  return [
    { name: "mug.jpg", mimeType: "image/jpeg", buffer: Buffer.from(encoded.jpeg, "base64") },
    { name: "bowl.png", mimeType: "image/png", buffer: Buffer.from(encoded.png, "base64") },
    { name: "vase.webp", mimeType: "image/webp", buffer: Buffer.from(encoded.webp, "base64") },
  ];
}

async function addProduct(page: Page, tenant: Tenant, title: string): Promise<string> {
  await page.goto(`${tenant.storePath}/products/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Price", { exact: true }).fill("499");
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/products\/prod_[^/]+$/);
  return page.url();
}

const tiles = (page: Page) => page.locator("li:has(button[aria-label^='Options for image']) img");

/** Every product image has loaded (not blocked, not broken), and their sources in order. */
async function loadedSources(page: Page): Promise<string[]> {
  await expect
    .poll(
      async () =>
        tiles(page).evaluateAll((imgs) =>
          imgs.every(
            (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  return tiles(page).evaluateAll((imgs) =>
    imgs.map((i) => (i as HTMLImageElement).getAttribute("src") ?? ""),
  );
}

test("product media: upload, library, attach, remove, reorder and isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Refused to (load|connect)/.test(m.text())) blocked.push(m.text());
  });

  const A = await createTenant(page, "media-a");
  const editor = await addProduct(page, A, "Stoneware set");

  // JPEG, PNG and WebP upload, process to READY and attach, in order.
  const files = await images(page);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload" }).click(),
  ]);
  await chooser.setFiles(files);
  await expect(page.getByRole("button", { name: /^Options for image/ })).toHaveCount(3, {
    timeout: 60_000,
  });
  const uploaded = await loadedSources(page);
  expect(uploaded).toHaveLength(3);
  for (const src of uploaded) {
    // Same-origin paths, served as processed renditions.
    expect(src).toMatch(/^\/media\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\/w\d+\.webp$/);
    const served = await page.request.get(src);
    expect(served.status(), src).toBe(200);
    expect(served.headers()["content-type"]).toBe("image/webp");
  }

  // The attachments persist.
  await page.reload();
  expect(await loadedSources(page)).toEqual(uploaded);

  // The Media library lists them, READY and loading.
  await page.goto(`${A.storePath}/media`);
  for (const name of ["mug.jpg", "bowl.png", "vase.webp"]) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
  await expect
    .poll(async () =>
      page
        .locator("img[src^='/media/']")
        .evaluateAll(
          (imgs) => imgs.length >= 3 && imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);

  // Removing from the product keeps the image in the library.
  await page.goto(editor);
  await page.getByRole("button", { name: "Options for image 3" }).click();
  await page.getByRole("menuitem", { name: "Remove from product" }).click();
  await expect(page.getByRole("button", { name: /^Options for image/ })).toHaveCount(2);
  await page.goto(`${A.storePath}/media`);
  await expect(page.getByText("vase.webp").first()).toBeVisible();

  // Library selection attaches an existing image again (captured for the isolation check).
  await page.goto(editor);
  await page.getByRole("button", { name: "Library" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose from library" });
  await dialog.getByRole("checkbox", { name: "Choose vase.webp" }).check();
  const attach = await captureServerAction(page, () =>
    dialog.getByRole("button", { name: "Add 1 image" }).click(),
  );
  await expect(page.getByRole("button", { name: /^Options for image/ })).toHaveCount(3);
  const reattached = await loadedSources(page);
  expect(reattached[2]).toBe(uploaded[2]);

  // Make primary, and move later; both persist.
  await page.getByRole("button", { name: "Options for image 3" }).click();
  await page.getByRole("menuitem", { name: "Make primary" }).click();
  await expect.poll(async () => (await loadedSources(page))[0]).toBe(uploaded[2]);
  await page.getByRole("button", { name: "Options for image 1" }).click();
  await page.getByRole("menuitem", { name: "Move later" }).click();
  await expect.poll(async () => (await loadedSources(page))[1]).toBe(uploaded[2]);
  await page.reload();
  expect(await loadedSources(page)).toEqual([uploaded[0], uploaded[2], uploaded[1]]);

  // A file that isn't an image gets a clear, user-safe message.
  const [again] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Upload" }).click(),
  ]);
  await again.setFiles({
    name: "notes.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByText(/notes\.jpg: .+/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Something went wrong on our side")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Options for image/ })).toHaveCount(3);
  expect(blocked, "no image or upload was refused by the page's policy").toEqual([]);

  // Another tenant sees none of A's media and can't attach it.
  const contextB = await browser.newContext({ baseURL: "http://localhost:3001" });
  const pageB = await contextB.newPage();
  const B = await createTenant(pageB, "media-b");
  const editorB = await addProduct(pageB, B, "Other product");
  await pageB.getByRole("button", { name: "Library" }).click();
  await expect(pageB.getByText("No other images in the library yet.")).toBeVisible();
  await pageB.keyboard.press("Escape");
  const productB = /\/products\/(prod_[^/]+)$/.exec(editorB)?.[1] ?? "";
  const productA = /\/products\/(prod_[^/]+)$/.exec(editor)?.[1] ?? "";
  // A's own attach, replayed as B, and rewritten to B's store and product.
  expect((await replay(contextB, attach)).text).toContain("Not found");
  const idor = await replay(contextB, attach, (body) =>
    body.replaceAll(A.storeId, B.storeId).replaceAll(productA, productB),
  );
  expect(idor.text).toContain("Not found");
  await pageB.reload();
  await expect(pageB.getByRole("button", { name: /^Options for image/ })).toHaveCount(0);
  await contextB.close();
});
