// The worker refuses to start on a bad configuration (M8): every problem is
// named, no value is echoed, and staging/production need TLS and secrets.
import { describe, expect, it } from "vitest";
import { loadWorkerEnv } from "../src/env";

const SECRET = "worker-test-secret-that-is-long-enough-0000";
const base = {
  STOREVIA_ENV: "development",
  DATABASE_WORKER_URL: "postgresql://w:pw@localhost/storevia",
  DATABASE_BILLING_URL: "postgresql://b:pw@localhost/storevia",
  DASHBOARD_URL: "http://app.localhost:3001",
  STOREFRONT_INTERNAL_URL: "http://localhost:3002",
  STOREFRONT_REVALIDATE_SECRET: SECRET,
};

describe("worker configuration", () => {
  it("fills defaults for the scheduler and health server", () => {
    const env = loadWorkerEnv(base);
    expect(env.WORKER_POLL_INTERVAL_MS).toBe(5_000);
    expect(env.WORKER_HEALTH_HOST).toBe("127.0.0.1");
    expect(env.WORKER_HEALTH_PORT).toBe(3004);
  });

  it("names every missing or malformed setting and echoes no value", () => {
    let message = "";
    try {
      loadWorkerEnv({
        ...base,
        DATABASE_WORKER_URL: undefined,
        STOREFRONT_REVALIDATE_SECRET: "short-sekrit",
        WORKER_POLL_INTERVAL_MS: "10",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^Invalid worker configuration: /);
    expect(message).toContain("DATABASE_WORKER_URL");
    expect(message).toContain("STOREFRONT_REVALIDATE_SECRET: must be at least 32 characters");
    expect(message).toContain("WORKER_POLL_INTERVAL_MS");
    expect(message).not.toContain("short-sekrit");
  });

  it("production needs TLS to the database and the order-link secret", () => {
    expect(() => loadWorkerEnv({ ...base, STOREVIA_ENV: "production" })).toThrow(
      /ORDER_ACCESS_SECRET: required outside development and test; DATABASE_WORKER_URL: must require TLS.*DATABASE_BILLING_URL: must require TLS/,
    );
  });
});
