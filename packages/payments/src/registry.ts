import { parseKeyring, SecretCipher } from "@storevia/security";
import { RazorpayProvider } from "./razorpay";
import { TestPaymentProvider } from "./test-provider";
import type { PaymentProvider, PaymentProviderKey, ProviderCredentials } from "./types";

/**
 * Whether the Test Payment Provider may be used here (ADR-0031 §4). Never in
 * staging, preview or production, or when STOREVIA_ENV is unset (fail
 * closed). In development and test it is on, except that a production build
 * (NODE_ENV=production: `next start`, a deployed image) must also opt in
 * with TEST_PAYMENTS_ENABLED=true, so a mis-set stage alone can't expose it.
 */
export function isTestPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const stage = env["STOREVIA_ENV"];
  if (stage !== "development" && stage !== "test") return false;
  return env["NODE_ENV"] === "production" ? env["TEST_PAYMENTS_ENABLED"] === "true" : true;
}

let test: TestPaymentProvider | undefined;
let razorpay: RazorpayProvider | undefined;

/** The provider for a connection, or null when it isn't available here. */
export function getPaymentProvider(key: string): PaymentProvider | null {
  if (key === "storevia-test") {
    if (!isTestPaymentsEnabled()) return null;
    test ??= new TestPaymentProvider();
    return test;
  }
  if (key === "razorpay") {
    razorpay ??= new RazorpayProvider(
      process.env["RAZORPAY_API_URL"] ? { apiUrl: process.env["RAZORPAY_API_URL"] } : {},
    );
    return razorpay;
  }
  return null;
}

/** The test provider (for its hosted page), or null when disabled. */
export function getTestPaymentProvider(): TestPaymentProvider | null {
  const provider = getPaymentProvider("storevia-test");
  return provider instanceof TestPaymentProvider ? provider : null;
}

/** Providers a merchant may connect in this environment. */
export function availableProviderKeys(): PaymentProviderKey[] {
  return isTestPaymentsEnabled() ? ["storevia-test", "razorpay"] : ["razorpay"];
}

// ---------------------------------------------------------------------------
// Credentials at rest (ADR-0031 §4): AES-256-GCM, bound to the connection.
// ---------------------------------------------------------------------------

let cipher: SecretCipher | undefined;

function credentialsCipher(): SecretCipher {
  if (cipher) return cipher;
  const ring = process.env["PAYMENT_CREDENTIALS_KEYS"];
  if (!ring) throw new Error("PAYMENT_CREDENTIALS_KEYS is not set");
  cipher = new SecretCipher(parseKeyring(ring));
  return cipher;
}

/** The associated data: a ciphertext opens only for its own connection. */
export function credentialsBinding(connection: {
  readonly storeId: string;
  readonly id: string;
  readonly provider: string;
}): string {
  return `payment-connection:${connection.storeId}:${connection.id}:${connection.provider}`;
}

export function sealCredentials(
  binding: string,
  credentials: ProviderCredentials,
): { readonly ciphertext: Uint8Array; readonly keyVersion: number } {
  return credentialsCipher().seal(JSON.stringify(credentials), binding);
}

export function openCredentials(
  binding: string,
  sealed: { readonly ciphertext: Uint8Array; readonly keyVersion: number },
): ProviderCredentials {
  const value = JSON.parse(credentialsCipher().open(sealed, binding)) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("stored credentials are malformed");
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}
