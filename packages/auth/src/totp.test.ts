import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  totpAt,
  totpStep,
  verifyTotp,
} from "./totp";

// RFC 6238 Appendix B, SHA-1 seed "12345678901234567890" (8-digit codes
// there; the 6-digit code is the last six digits).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const VECTORS: readonly (readonly [number, string])[] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(VECTORS)("at %i s the code is %s", (seconds, code) => {
    expect(totpAt(RFC_SECRET, totpStep(seconds * 1000))).toBe(code);
  });

  it("base32 round-trips", () => {
    const bytes = Buffer.from("any bytes at all ÿ", "utf8");
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Decode("gezd gnbv-gy3t qojq")).toEqual(Buffer.from("1234567890"));
  });

  it("accepts one step either side, never a used or older step", () => {
    const secret = generateTotpSecret();
    const at = 1_700_000_000_000;
    const now = totpStep(at);
    expect(verifyTotp(secret, totpAt(secret, now), { at })).toBe(now);
    expect(verifyTotp(secret, totpAt(secret, now - 1), { at })).toBe(now - 1);
    expect(verifyTotp(secret, totpAt(secret, now + 1), { at })).toBe(now + 1);
    expect(verifyTotp(secret, totpAt(secret, now - 2), { at })).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now + 2), { at })).toBeNull();
    // Replay: the step already used (or an older one) is refused.
    expect(verifyTotp(secret, totpAt(secret, now), { at, afterStep: now })).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now - 1), { at, afterStep: now })).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now + 1), { at, afterStep: now })).toBe(now + 1);
  });

  it("refuses malformed codes and another secret's code", () => {
    const secret = generateTotpSecret();
    const other = generateTotpSecret();
    const at = Date.now();
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5x"]) {
      expect(verifyTotp(secret, bad, { at })).toBeNull();
    }
    expect(verifyTotp(secret, totpAt(other, totpStep(at)), { at })).toBeNull();
    // Spaces an app shows are fine.
    const code = totpAt(secret, totpStep(at));
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { at })).not.toBeNull();
  });

  it("builds an authenticator URI and 160-bit secrets", () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    const uri = new URL(otpauthUri("Storevia Admin", "ops@example.test", secret));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.searchParams.get("secret")).toBe(secret);
    expect(uri.searchParams.get("issuer")).toBe("Storevia Admin");
  });

  it("recovery codes are distinct, readable, and hashed case- and dash-insensitively", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    const first = codes[0] ?? "";
    expect(hashRecoveryCode(first.toUpperCase().replace("-", " "))).toBe(hashRecoveryCode(first));
    expect(hashRecoveryCode(first)).not.toBe(hashRecoveryCode(codes[1] ?? ""));
  });
});
