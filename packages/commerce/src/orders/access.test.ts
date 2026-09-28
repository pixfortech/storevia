import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  hashOrderAccessToken,
  orderAccessConfigured,
  orderAccessToken,
  verifiedOrderAccessHash,
} from "./access";

const ID = "01a0e7fe-97b8-781f-b6c7-216d21d135b7";
const PROD = { STOREVIA_ENV: "production", ORDER_ACCESS_SECRET: "x".repeat(40) };

describe("order access tokens", () => {
  it("round-trips: a token Storevia issued verifies to its hash", () => {
    const token = orderAccessToken(ID, PROD);
    expect(token).toMatch(/^[A-Za-z0-9_-]{65}$/);
    expect(verifiedOrderAccessHash(token, PROD)).toBe(hashOrderAccessToken(token));
  });

  it("refuses forged, altered, truncated and foreign-secret tokens before any lookup", () => {
    const token = orderAccessToken(ID, PROD);
    const last = token.endsWith("A") ? "B" : "A";
    expect(verifiedOrderAccessHash(token.slice(0, -1) + last, PROD)).toBeNull();
    expect(verifiedOrderAccessHash(token.slice(0, 64), PROD)).toBeNull();
    expect(verifiedOrderAccessHash(`${token}A`, PROD)).toBeNull();
    expect(verifiedOrderAccessHash("1004", PROD)).toBeNull();
    expect(verifiedOrderAccessHash(null, PROD)).toBeNull();
    const other = { ...PROD, ORDER_ACCESS_SECRET: "y".repeat(40) };
    expect(verifiedOrderAccessHash(token, other)).toBeNull();
  });

  it("deployed environments need their own secret; development and test derive one", () => {
    expect(orderAccessConfigured({ STOREVIA_ENV: "production" })).toBe(false);
    expect(orderAccessConfigured({ STOREVIA_ENV: "staging", ORDER_ACCESS_SECRET: "short" })).toBe(
      false,
    );
    expect(orderAccessConfigured({ STOREVIA_ENV: "test" })).toBe(true);
    expect(() => orderAccessToken(ID, { STOREVIA_ENV: "production" })).toThrow(
      /ORDER_ACCESS_SECRET/,
    );
    expect(verifiedOrderAccessHash("A".repeat(65), { STOREVIA_ENV: "production" })).toBeNull();
  });
});
