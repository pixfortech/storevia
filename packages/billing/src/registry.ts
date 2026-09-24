import "server-only";
import { createLogger } from "@storevia/observability";
import { MockBillingProvider } from "./mock-provider";
import type { BillingProvider } from "./provider";
import type { BillingProviderKey } from "./subscriptions";

/**
 * Which billing providers are enabled in this environment (ADR-0022 §7).
 * Milestone 2 has no real provider. The mock is enabled:
 * - never in preview or production, or when STOREVIA_ENV is unset (fail closed);
 * - in staging only with BILLING_MOCK_ENABLED=true;
 * - in development and test, except that a production build (NODE_ENV=
 *   production, e.g. `next start` or a deployed image) must also opt in with
 *   BILLING_MOCK_ENABLED=true, so a mis-set stage alone can't expose it.
 */
export function isMockBillingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const stage = env["STOREVIA_ENV"];
  const flag = env["BILLING_MOCK_ENABLED"] === "true";
  if (stage === "staging") return flag;
  if (stage === "development" || stage === "test")
    return env["NODE_ENV"] === "production" ? flag : true;
  return false;
}

const log = createLogger({ component: "billing.registry" });

let mock: MockBillingProvider | undefined;

export function getBillingProvider(key: string): BillingProvider | null {
  if (key.toUpperCase() === "MOCK" && isMockBillingEnabled()) {
    const secret = process.env["MOCK_BILLING_WEBHOOK_SECRET"];
    if (!secret || secret.length < 32) {
      throw new Error(
        "MOCK_BILLING_WEBHOOK_SECRET must be set (32+ characters) to enable mock billing",
      );
    }
    if (!mock) {
      mock = new MockBillingProvider(secret);
      log.warn("mock billing provider enabled", { stage: process.env["STOREVIA_ENV"] });
    }
    return mock;
  }
  return null;
}

/** The mock provider, or null when disabled. */
export function getMockProvider(): MockBillingProvider | null {
  const provider = getBillingProvider("MOCK");
  return provider instanceof MockBillingProvider ? provider : null;
}

export function enabledProviderKeys(): BillingProviderKey[] {
  return isMockBillingEnabled() ? ["MOCK"] : [];
}
