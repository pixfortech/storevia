import "server-only";
import { MockBillingProvider } from "./mock-provider";
import type { BillingProvider } from "./provider";
import type { BillingProviderKey } from "./subscriptions";

/**
 * Which billing providers are enabled in this environment (ADR-0022 §7).
 * Milestone 2 has no real provider. The mock is enabled only in development
 * and test, or in staging with BILLING_MOCK_ENABLED=true, and can never be
 * enabled in preview or production. An unset STOREVIA_ENV counts as
 * production (fail closed).
 */
export function isMockBillingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const stage = env["STOREVIA_ENV"];
  if (stage === "development" || stage === "test") return true;
  if (stage === "staging") return env["BILLING_MOCK_ENABLED"] === "true";
  return false;
}

let mock: MockBillingProvider | undefined;

export function getBillingProvider(key: string): BillingProvider | null {
  if (key.toUpperCase() === "MOCK" && isMockBillingEnabled()) {
    const secret = process.env["MOCK_BILLING_WEBHOOK_SECRET"];
    if (!secret || secret.length < 32) {
      throw new Error(
        "MOCK_BILLING_WEBHOOK_SECRET must be set (32+ characters) to enable mock billing",
      );
    }
    mock ??= new MockBillingProvider(secret);
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
