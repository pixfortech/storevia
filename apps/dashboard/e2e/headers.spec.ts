import { expect, test } from "@playwright/test";
import { createTenant } from "./helpers";

test("responses carry a nonce-based CSP and hardening headers", async ({ page }) => {
  const response = await page.goto("/sign-in");
  const headers = response?.headers() ?? {};
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-request-id"]).toBeTruthy();
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  // Browsers hide the nonce attribute from the DOM after parsing; the property keeps it.
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  for (const value of scripts) expect(value).toBe(nonce);
});

test("the session cookie is HttpOnly, SameSite=Lax and host-only", async ({ page, context }) => {
  await createTenant(page, "cookies");
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.domain.startsWith(".")).toBe(false);
});
