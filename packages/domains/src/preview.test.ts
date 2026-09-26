import { describe, expect, it } from "vitest";
import { storefrontOrigin } from "./hostname";
import { PREVIEW_TTL_SECONDS, signPreviewToken, verifyPreviewToken } from "./preview";

const SECRET = "test-preview-secret-that-is-long-enough-000";
const STORE = "0190f2a4-0000-7000-8000-000000000001";
const OTHER = "0190f2a4-0000-7000-8000-000000000002";
const NOW = Date.UTC(2026, 8, 26, 12);

describe("preview tokens", () => {
  it("verify for their own store until they expire", () => {
    const token = signPreviewToken(STORE, SECRET, NOW);
    expect(verifyPreviewToken(token, STORE, SECRET, NOW + 60_000)).toMatchObject({
      storeId: STORE,
      scope: "store",
    });
    expect(verifyPreviewToken(token, STORE, SECRET, NOW + PREVIEW_TTL_SECONDS * 1000)).toBeNull();
  });

  it("are refused on another store, with another secret, or when altered", () => {
    const token = signPreviewToken(STORE, SECRET, NOW);
    expect(verifyPreviewToken(token, OTHER, SECRET, NOW)).toBeNull();
    expect(verifyPreviewToken(token, STORE, `${SECRET}x`, NOW)).toBeNull();
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ v: 1, storeId: OTHER, scope: "store", exp: NOW / 1000 + 60 }),
    ).toString("base64url");
    expect(verifyPreviewToken(`${forged}.${signature ?? ""}`, OTHER, SECRET, NOW)).toBeNull();
    expect(
      verifyPreviewToken(`${payload ?? ""}.${signature ?? ""}.x`, STORE, SECRET, NOW),
    ).toBeNull();
    expect(verifyPreviewToken(payload ?? "", STORE, SECRET, NOW)).toBeNull();
    for (const junk of ["", null, undefined, "a.b", "x".repeat(600)]) {
      expect(verifyPreviewToken(junk, STORE, SECRET, NOW)).toBeNull();
    }
  });

  it("never live longer than 15 minutes and need a real secret", () => {
    const token = signPreviewToken(STORE, SECRET, NOW, 24 * 3600);
    expect(
      verifyPreviewToken(token, STORE, SECRET, NOW + (PREVIEW_TTL_SECONDS + 1) * 1000),
    ).toBeNull();
    expect(() => signPreviewToken(STORE, "short", NOW)).toThrow();
    expect(() => signPreviewToken("not-a-uuid", SECRET, NOW)).toThrow();
  });
});

describe("storefront origins", () => {
  it("use https in production and carry the development port", () => {
    expect(
      storefrontOrigin("clay.storevia.site", { STOREFRONT_ROOT_DOMAIN: "storevia.site" }),
    ).toBe("https://clay.storevia.site");
    expect(
      storefrontOrigin("clay.store.localhost", {
        STOREFRONT_ROOT_DOMAIN: "store.localhost:3002",
        STOREFRONT_PROTOCOL: "http",
      }),
    ).toBe("http://clay.store.localhost:3002");
  });
});
