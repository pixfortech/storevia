import { describe, expect, it } from "vitest";
import {
  MAX_VERIFY_ATTEMPTS,
  parseCustomHostname,
  storeviaOwnedDomains,
  verifyDelayMs,
} from "./custom";

const env = {
  STOREFRONT_ROOT_DOMAIN: "storevia.site",
  DASHBOARD_URL: "https://app.storevia.com",
  MARKETING_URL: "https://storevia.com",
  PLATFORM_ADMIN_URL: "https://admin.storevia.com",
} as NodeJS.ProcessEnv;

const parse = (raw: unknown, allowTestDomains = false) =>
  parseCustomHostname(raw, { env, allowTestDomains });

describe("parseCustomHostname", () => {
  it.each(["abc.com", "www.abc.com", "shop.abc.com", "ABC.com.", "  shop.abc.co.uk  "])(
    "accepts %s",
    (raw) => {
      expect(parse(raw)).toMatchObject({ ok: true });
    },
  );

  it("normalises case, trailing dots and IDNs to punycode", () => {
    expect(parse("Shop.ABC.com.")).toEqual({ ok: true, hostname: "shop.abc.com" });
    expect(parse("bücher.de")).toEqual({ ok: true, hostname: "xn--bcher-kva.de" });
  });

  it.each([
    ["https://abc.com", /without https/],
    ["http://abc.com/", /without https/],
    ["abc.com/shop", /without https/],
    ["abc.com?x=1", /without https/],
    ["abc.com#x", /without https/],
    ["user@abc.com", /without https/],
    ["abc .com", /without https/],
    ["abc.com:443", /port/],
    ["abc.com:", /port/],
    ["[::1]", /port/],
    ["192.168.1.1", /IP address/],
    ["127.1", /IP address/],
    ["localhost", /valid domain|can't be used/],
    ["shop.localhost", /can't be used/],
    ["printer.local", /can't be used/],
    ["db.internal", /can't be used/],
    ["x.invalid", /can't be used/],
    ["router.home.arpa", /can't be used/],
    ["abc.test", /reserved for testing/],
    ["shop.example", /reserved for testing/],
    ["storevia.site", /Storevia addresses/],
    ["acme.storevia.site", /Storevia addresses/],
    ["admin.storevia.com", /Storevia addresses/],
    ["app.storevia.com", /Storevia addresses/],
    ["storevia.com", /Storevia addresses/],
    ["-bad.com", /valid domain/],
    ["a..b.com", /valid domain/],
    ["abc", /valid domain/],
    ["", /Enter a domain/],
    [42, /Enter a domain/],
    [`${"a".repeat(64)}.com`, /valid domain/],
    [`${"a.".repeat(130)}com`, /too long/],
  ])("refuses %s", (raw, message) => {
    const result = parse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  });

  it("allows RFC 2606 test names only for the local simulator", () => {
    expect(parse("abc.test", true)).toEqual({ ok: true, hostname: "abc.test" });
    expect(parse("localhost", true).ok).toBe(false);
  });

  it("Storevia's own domains include the configured hosts and their parents", () => {
    expect(storeviaOwnedDomains(env)).toEqual(
      expect.arrayContaining([
        "storevia.site",
        "app.storevia.com",
        "storevia.com",
        "admin.storevia.com",
      ]),
    );
  });
});

describe("verification schedule", () => {
  it("backs off from every minute to every two hours, then gives up", () => {
    expect(verifyDelayMs(0)).toBe(60_000);
    expect(verifyDelayMs(10)).toBe(5 * 60_000);
    expect(verifyDelayMs(30)).toBe(30 * 60_000);
    expect(verifyDelayMs(60)).toBe(120 * 60_000);
    let total = 0;
    for (let i = 0; i < MAX_VERIFY_ATTEMPTS; i++) total += verifyDelayMs(i);
    // Roughly three and a half days of trying.
    expect(total / 3_600_000).toBeGreaterThan(60);
    expect(total / 3_600_000).toBeLessThan(100);
  });
});
