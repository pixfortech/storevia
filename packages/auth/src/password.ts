import { createHash } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// OWASP Password Storage Cheat Sheet: Argon2id, m = 19 MiB, t = 2, p = 1.
const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (a const enum, unusable with verbatimModuleSyntax)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Pwned Passwords k-anonymity check (only the first 5 hex chars of the SHA-1
 * leave the server). Fails open (returns false) on network errors so an outage
 * of the third party can't block sign-ups; disabled with
 * AUTH_BREACHED_PASSWORD_CHECK=off (tests, offline development).
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (process.env["AUTH_BREACHED_PASSWORD_CHECK"] === "off") return false;
  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const body = await response.text();
    return body.split("\n").some((line) => {
      const [hashSuffix, count] = line.trim().split(":");
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
