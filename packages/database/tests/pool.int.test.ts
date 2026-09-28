// Pool settings (M8): each role's connections are labelled in
// pg_stat_activity, fail fast when none can be had, and bad overrides fall
// back to safe defaults.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createPrismaClient, disconnectAll, getClient, poolConfig } from "../src/client";

afterEach(() => {
  delete process.env["DATABASE_CONNECT_TIMEOUT_MS"];
  delete process.env["DATABASE_POOL_MAX"];
});
afterAll(disconnectAll);

describe("database pools", () => {
  it("labels each role's connections", async () => {
    const [row] = await getClient("worker").$queryRaw<{ name: string }[]>`
      SELECT current_setting('application_name') AS name`;
    expect(row?.name).toBe("storevia-worker");
  });

  it("uses bounded defaults and ignores malformed overrides", () => {
    process.env["DATABASE_POOL_MAX"] = "lots";
    expect(poolConfig("postgresql://x", "app")).toMatchObject({
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      application_name: "storevia-app",
    });
    process.env["DATABASE_POOL_MAX"] = "3";
    expect(poolConfig("postgresql://x").max).toBe(3);
  });

  it("gives up on an unreachable database instead of waiting forever", async () => {
    process.env["DATABASE_CONNECT_TIMEOUT_MS"] = "500";
    // A routable-but-silent address (TEST-NET-1): the connection never answers.
    const client = createPrismaClient("postgresql://u:p@192.0.2.1:5432/none");
    const started = Date.now();
    await expect(client.$queryRaw`SELECT 1`).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    await client.$disconnect();
  });
});
