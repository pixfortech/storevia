import { describe, expect, it } from "vitest";
import { normaliseHostname, platformHostname, storefrontRootDomain } from "./hostname";

describe("normaliseHostname", () => {
  it.each([
    ["shop.example.com", "shop.example.com"],
    ["Shop.Example.COM", "shop.example.com"],
    ["shop.example.com.", "shop.example.com"],
    ["shop.example.com:443", "shop.example.com"],
    ["demo.store.localhost:3002", "demo.store.localhost"],
    ["  shop.example.com  ", "shop.example.com"],
    ["bücher.example", "xn--bcher-kva.example"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
    ["ПРИМЕР.рф", "xn--e1afmkfd.xn--p1ai"],
    ["a-b.c", "a-b.c"],
  ])("%j → %j", (input, expected) => {
    expect(normaliseHostname(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["localhost"],
    ["127.0.0.1"],
    ["127.1"],
    ["0x7f.1"],
    ["10.0.0.1:80"],
    ["[::1]"],
    ["[::1]:3000"],
    ["::1"],
    ["shop.example.com:abc"],
    ["shop.example.com:99999999"],
    ["shop..example.com"],
    ["-shop.example.com"],
    ["shop-.example.com"],
    ["sh_op.example.com"],
    ["shop.example.com/evil"],
    ["shop.example.com@evil.test"],
    ["shop example.com"],
    [`${"a".repeat(64)}.example.com`],
    [`${"abcdefghi.".repeat(26)}com`],
    ["evil.test\r\nX-Injected: 1"],
  ])("rejects %j", (input) => {
    expect(normaliseHostname(input)).toBeNull();
  });
});

describe("platform hostnames", () => {
  it("drops the development port from the root domain", () => {
    expect(storefrontRootDomain({ STOREFRONT_ROOT_DOMAIN: "store.localhost:3002" })).toBe(
      "store.localhost",
    );
    expect(storefrontRootDomain({})).toBe("storevia.site");
    expect(platformHostname("clay", "storevia.site")).toBe("clay.storevia.site");
  });
});
