import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAIL_DIR = mkdtempSync(join(tmpdir(), "storevia-auth-mail-"));
process.env["EMAIL_TRANSPORT"] = "file";
process.env["EMAIL_FILE_DIR"] = MAIL_DIR;
process.env["AUTH_BREACHED_PASSWORD_CHECK"] = "off";

interface StoredEmail {
  to: string;
  template: string;
  text: string;
}

export function emailsTo(to: string, template?: string): StoredEmail[] {
  return readdirSync(MAIL_DIR)
    .sort()
    .map((file) => JSON.parse(readFileSync(join(MAIL_DIR, file), "utf8")) as StoredEmail)
    .filter((m) => m.to === to && (!template || m.template === template));
}

/** Extracts the `token` query parameter from the newest matching email. */
export function latestToken(to: string, template: string): string {
  const message = emailsTo(to, template).at(-1);
  if (!message) throw new Error(`no ${template} email for ${to}`);
  const match = /[?&]token=([^\s&]+)/.exec(message.text);
  if (!match?.[1]) throw new Error("no token in email");
  return decodeURIComponent(match[1]);
}

/** Converts Set-Cookie headers into a Cookie request header. */
export function cookieHeader(setCookies: readonly string[]): Headers {
  const pairs = setCookies
    .map((c) => c.split(";")[0] ?? "")
    .filter((pair) => pair.includes("=") && !pair.endsWith("="));
  return new Headers({ cookie: pairs.join("; "), "user-agent": "vitest" });
}

export const noCookies = () => new Headers({ "user-agent": "vitest" });
