import { expect, type BrowserContext, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PASSWORD = "a long enough password";
const MAIL_DIR = process.env["EMAIL_FILE_DIR"] ?? "/tmp/storevia-mail";

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.test`;
}

/** Reads the newest email of a template sent to `to` (file transport) and returns the link token. */
export async function tokenFromEmail(
  to: string,
  template: string,
  pattern = /[?&]token=([^\s&]+)/,
): Promise<string> {
  let found: string | undefined;
  await expect
    .poll(() => {
      const files = readdirSync(MAIL_DIR)
        .filter((f) => f.includes(to) && f.endsWith(`-${template}.json`))
        .sort();
      const last = files.at(-1);
      if (!last) return undefined;
      const { text } = JSON.parse(readFileSync(join(MAIL_DIR, last), "utf8")) as { text: string };
      found = pattern.exec(text)?.[1];
      return found;
    })
    .toBeTruthy();
  return decodeURIComponent(found ?? "");
}

/** Signs up through the UI and confirms the email via the emailed link. */
export async function signUpAndVerify(
  page: Page,
  name: string,
  email: string,
  next?: string,
): Promise<void> {
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/check-email/);
  const token = await tokenFromEmail(email, "verify-email");
  await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);
  await page.waitForURL(/\/sign-in\?verified=1/);
}

export async function signIn(page: Page, email: string, next?: string): Promise<void> {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

export interface Tenant {
  email: string;
  orgPath: string; // /o/org_...
  storePath: string; // /s/store_...
  storeId: string; // store_...
  orgId: string; // org_...
}

/** Full onboarding through the UI: sign up → verify → sign in → organisation → store. */
export async function createTenant(
  page: Page,
  label: string,
  options: { businessType?: string } = {},
): Promise<Tenant> {
  const email = uniqueEmail(label);
  await signUpAndVerify(page, `Owner ${label}`, email);
  await signIn(page, email);
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Business name").fill(`Business ${label}`);
  await page.getByLabel("Country").selectOption("IN");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/o\/org_[^/]+\/stores\/new/);
  const orgId = /\/o\/(org_[^/]+)/.exec(page.url())?.[1] ?? "";
  if (options.businessType) {
    await page.getByRole("radio", { name: new RegExp(options.businessType) }).check();
  }
  await page.getByLabel("Store name").fill(`Store ${label} ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Create store" }).click();
  await page.waitForURL(/\/s\/store_[^/?]+/);
  const storeId = /\/s\/(store_[^/?]+)/.exec(page.url())?.[1] ?? "";
  return { email, orgId, storeId, orgPath: `/o/${orgId}`, storePath: `/s/${storeId}` };
}

export interface CapturedAction {
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

/** Performs `trigger` and captures the Server Action POST it sends. */
export async function captureServerAction(
  page: Page,
  trigger: () => Promise<void>,
): Promise<CapturedAction> {
  const requestPromise = page.waitForRequest(
    (r) => r.method() === "POST" && Boolean(r.headers()["next-action"]),
  );
  await trigger();
  const request = await requestPromise;
  const headers = Object.fromEntries(
    Object.entries(await request.allHeaders()).filter(
      ([k]) =>
        !["cookie", "content-length", "host"].includes(k.toLowerCase()) && !k.startsWith(":"),
    ),
  );
  return { url: request.url(), headers, body: request.postDataBuffer() ?? Buffer.alloc(0) };
}

/**
 * Replays a captured action as the identity of `context` (its cookies; none for
 * a fresh context), optionally rewriting the body. The request goes to
 * localhost with the original Host header, because Node (unlike browsers)
 * doesn't resolve *.localhost names.
 */
export async function replay(
  context: BrowserContext,
  action: CapturedAction,
  rewrite: (body: string) => string = (b) => b,
): Promise<{ status: number; text: string }> {
  const target = new URL(action.url);
  const cookies = (await context.cookies(action.url)).map((c) => `${c.name}=${c.value}`).join("; ");
  const hostHeader = target.host;
  target.hostname = "localhost";
  const response = await context.request.fetch(target.toString(), {
    method: "POST",
    headers: { ...action.headers, host: hostHeader, ...(cookies ? { cookie: cookies } : {}) },
    data: Buffer.from(rewrite(action.body.toString("latin1")), "latin1"),
    maxRedirects: 0,
  });
  return { status: response.status(), text: await response.text() };
}
