import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./headers";
import { safeRedirectPath } from "./redirect";
import { clientIp } from "./request";
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
