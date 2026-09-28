// Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30-second steps,
// 6 digits) and recovery codes, for platform staff MFA (M8, ADR-0035).
// Pure: no database, no server-only import, so tests (and the E2E helper
// that plays a staff member's authenticator) use the same code.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Codes one step either side of now are accepted (clock drift). */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32.charAt((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 (what authenticator apps take). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export const totpStep = (at: number = Date.now()): number =>
  Math.floor(at / 1000 / TOTP_STEP_SECONDS);

/** The code for `secret` at time step `step`. */
export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * The time step a code matches (within the window, and only steps after
 * `afterStep`, so a code can't be used twice), or null.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { readonly at?: number; readonly afterStep?: number | null } = {},
): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const now = totpStep(options.at);
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    if (options.afterStep !== undefined && options.afterStep !== null && step <= options.afterStep)
      continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

/** The URI an authenticator app imports (usually shown as a QR code). */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Recovery codes: ten single-use codes, shown once, stored hashed.
// ---------------------------------------------------------------------------

export const RECOVERY_CODE_COUNT = 10;

/** "abcde-fghij" style: 10 base32 characters (50 bits), easy to read out. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export const normaliseRecoveryCode = (code: string): string =>
  code.toLowerCase().replace(/[^a-z2-7]/g, "");

export const hashRecoveryCode = (code: string): string =>
  createHash("sha256")
    .update(`storevia:recovery:${normaliseRecoveryCode(code)}`)
    .digest("hex");
