import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./headers";
import { safeRedirectPath } from "./redirect";
import { clientIp } from "./request";
import { maskIdentifier, parseKeyring, SecretCipher, SecretCipherError } from "./secrets";
import { constantTimeEqual, generateToken, hashToken } from "./tokens";

describe("safeRedirectPath", () => {
  it.each([
    ["/stores/abc", "/stores/abc"],
    ["/a?b=c#d", "/a?b=c#d"],
  ])("keeps %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "evil.test",
    "/\tevil",
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "/./\\evil.com",
    "/%2F/evil.com",
    "/%5Cevil.com",
    "",
    null,
  ])("rejects %s", (input) => {
    expect(safeRedirectPath(input, "/home")).toBe("/home");
  });
});

describe("tokens", () => {
  it("generates distinct 256-bit tokens and hashes them deterministically", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(constantTimeEqual(a, a)).toBe(true);
    expect(constantTimeEqual(a, `${a}x`)).toBe(false);
  });
});

describe("clientIp", () => {
  it("ignores forwarding headers unless a trusted header is configured", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    delete process.env["TRUSTED_CLIENT_IP_HEADER"];
    expect(clientIp(headers)).toBeNull();
    process.env["TRUSTED_CLIENT_IP_HEADER"] = "x-forwarded-for";
    expect(clientIp(headers)).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "not-an-ip" }))).toBeNull();
    // The client-controlled left-most entries are ignored.
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
    delete process.env["TRUSTED_CLIENT_IP_HEADER"];
  });
});

describe("contentSecurityPolicy", () => {
  it("adds only well-formed media origins, never paths or other schemes", () => {
    const csp = contentSecurityPolicy({
      nonce: "abc",
      isDevelopment: false,
      secure: true,
      imageOrigins: ["https://cdn.example.test/media/x", "javascript:alert(1)", "*"],
      uploadOrigins: ["https://bucket.s3.example.test/"],
    });
    expect(csp).toContain("img-src 'self' data: blob: https://cdn.example.test;");
    expect(csp).toContain("connect-src 'self' https://bucket.s3.example.test;");
    expect(csp).not.toContain("javascript");
  });

  it("uses a nonce and forbids framing and plugins", () => {
    const csp = contentSecurityPolicy({ nonce: "abc", isDevelopment: false, secure: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(
      contentSecurityPolicy({ nonce: "abc", isDevelopment: false, secure: false }),
    ).not.toContain("upgrade-insecure-requests");
  });
});

describe("secret cipher (ADR-0031 §4)", () => {
  const key1 = Buffer.alloc(32, 1);
  const key2 = Buffer.alloc(32, 2);

  it("round-trips, binds the ciphertext to its row and never repeats an IV", () => {
    const cipher = new SecretCipher(new Map([[1, key1]]));
    const a = cipher.seal("rzp_secret", "conn:A");
    const b = cipher.seal("rzp_secret", "conn:A");
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
    expect(cipher.open(a, "conn:A")).toBe("rzp_secret");
    // Moved to another row: refused.
    expect(() => cipher.open(a, "conn:B")).toThrow(SecretCipherError);
    // Tampered: refused.
    const tampered = Buffer.from(a.ciphertext);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => cipher.open({ ...a, ciphertext: tampered }, "conn:A")).toThrow(SecretCipherError);
    expect(Buffer.from(a.ciphertext).toString("utf8")).not.toContain("rzp_secret");
  });

  it("encrypts with the newest key and still opens rows written with older ones", () => {
    const old = new SecretCipher(new Map([[1, key1]])).seal("value", "row");
    const rotated = new SecretCipher(
      new Map([
        [1, key1],
        [2, key2],
      ]),
    );
    expect(rotated.currentVersion).toBe(2);
    expect(rotated.open(old, "row")).toBe("value");
    expect(rotated.seal("value", "row").keyVersion).toBe(2);
    expect(() => new SecretCipher(new Map([[2, key2]])).open(old, "row")).toThrow(
      SecretCipherError,
    );
  });

  it("parses keyrings and refuses bad keys", () => {
    const ring = parseKeyring(`1:${key1.toString("base64")}, 3:${key2.toString("base64")}`);
    expect([...ring.keys()]).toEqual([1, 3]);
    expect(() => parseKeyring("x:abc")).toThrow(SecretCipherError);
    expect(() => new SecretCipher(new Map([[1, Buffer.alloc(16)]]))).toThrow(SecretCipherError);
    expect(() => new SecretCipher(new Map())).toThrow(SecretCipherError);
  });

  it("masks identifiers", () => {
    expect(maskIdentifier("rzp_test_ABCDEF1234")).toBe("rzp_test_…1234");
    expect(maskIdentifier("short")).toBe("…hort");
  });
});
