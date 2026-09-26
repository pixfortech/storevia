import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Tenant } from "./helpers";

// Shared by the storefront E2E specs.

/** Node can't resolve *.localhost names (browsers can): send the Host header instead. */
export async function fetchStore(
  request: APIRequestContext,
  origin: string,
  path: string,
): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  const url = new URL(path, origin);
  const response = await request.get(`http://localhost:${url.port}${url.pathname}${url.search}`, {
    headers: { host: url.host },
    maxRedirects: 0,
  });
  return { status: response.status(), headers: response.headers(), text: await response.text() };
}

export async function storefrontOrigin(page: Page, tenant: Tenant): Promise<string> {
  await page.goto(`${tenant.storePath}/settings`);
  const link = page.getByRole("link", { name: /\.store\.localhost/ }).first();
  return new URL((await link.getAttribute("href")) ?? "").origin;
}

export async function addProduct(
  page: Page,
  tenant: Tenant,
  title: string,
  price: string,
  stock: string,
) {
  await page.goto(`${tenant.storePath}/products/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Price", { exact: true }).fill(price);
  await page.getByLabel("Stock on hand").fill(stock);
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/products\/prod_[^/]+$/);
  await page.getByRole("button", { name: "Set as active" }).first().click();
  await expect(page.getByRole("button", { name: "Set as draft" }).first()).toBeVisible();
  return page.url();
}
