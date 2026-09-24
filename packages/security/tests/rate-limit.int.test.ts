import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectTestClients, truncateAll } from "@storevia/database/testing";
import { marketingDb } from "@storevia/database/marketing";
import { consumeRateLimit, consumeRateLimits } from "../src/rate-limit";
import { consumeRateLimitWith } from "../src/rate-limit-core";

beforeAll(truncateAll);
afterAll(disconnectTestClients);

describe("consumeRateLimit", () => {
  it("allows up to the limit, then blocks, even under concurrency", async () => {
    const rule = { name: "test:concurrent", limit: 5, windowSeconds: 60 };
    const results = await Promise.all(
      Array.from({ length: 12 }, () => consumeRateLimit(rule, "subject")),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed).every((r) => r.retryAfterSeconds > 0)).toBe(true);
  });

  it("keeps subjects independent", async () => {
    const rule = { name: "test:subjects", limit: 1, windowSeconds: 60 };
    expect((await consumeRateLimit(rule, "a")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "b")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "a")).allowed).toBe(false);
  });

  it("skips rules whose subject is unknown instead of pooling them under one key", async () => {
    const rule = { name: "test:unknown-ip", limit: 1, windowSeconds: 60 };
    for (let i = 0; i < 5; i++) {
      expect((await consumeRateLimits([[rule, null] as const])).allowed).toBe(true);
    }
  });
});

describe("consumeRateLimitWith (marketing role, ADR-0025)", () => {
  it("counts marketing buckets under the marketing role, concurrently", async () => {
    const rule = { name: "marketing:test-contact", limit: 3, windowSeconds: 60 };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => consumeRateLimitWith(marketingDb(), rule, "198.51.100.7")),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it("can't touch other buckets", async () => {
    const rule = { name: "sign-in:ip", limit: 3, windowSeconds: 60 };
    await expect(consumeRateLimitWith(marketingDb(), rule, "198.51.100.7")).rejects.toThrow();
  });
});
