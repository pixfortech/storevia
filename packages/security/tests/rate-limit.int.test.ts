import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectTestClients, truncateAll } from "@storevia/database/testing";
import { consumeRateLimit } from "../src/rate-limit";

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
});
