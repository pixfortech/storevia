// The merchant payment abstraction (09-commerce §7, ADR-0031 §4). Checkout
// and orders depend only on this interface; adapters translate provider
// formats into Storevia terms. Hosted pages only: card data never reaches
// Storevia. Amounts are integer minor units.

export const PAYMENT_PROVIDER_KEYS = ["storevia-test", "razorpay"] as const;
export type PaymentProviderKey = (typeof PAYMENT_PROVIDER_KEYS)[number];

export function isPaymentProviderKey(value: unknown): value is PaymentProviderKey {
  return typeof value === "string" && (PAYMENT_PROVIDER_KEYS as readonly string[]).includes(value);
}

/** Decrypted connection credentials, as each adapter defines them. */
export type ProviderCredentials = Readonly<Record<string, string>>;

export interface CreatePaymentInput {
  /** Storevia's payment id (a TypeId), sent as the provider-side reference. */
  readonly reference: string;
  readonly amount: bigint;
  readonly currency: string;
  readonly description: string;
  readonly customerEmail: string | null;
  /** Where the provider sends the shopper back. A prompt to check, never proof. */
  readonly returnUrl: string;
  readonly expiresAt: Date;
}

export interface CreatePaymentResult {
  readonly providerPaymentId: string;
  readonly redirectUrl: string;
}

export type ProviderPaymentStatus = "pending" | "captured" | "failed" | "cancelled" | "expired";

/** The provider's authoritative view of one payment attempt. */
export interface ProviderPaymentState {
  readonly providerPaymentId: string;
  readonly status: ProviderPaymentStatus;
  /** Captured amount and currency, as the provider reports them. */
  readonly amount: bigint | null;
  readonly currency: string | null;
  /** The captured charge (used for refunds). */
  readonly chargeId: string | null;
}

export interface NormalisedPaymentEvent {
  readonly eventId: string;
  readonly type: string;
  /** Null for events Storevia doesn't act on. */
  readonly payment: ProviderPaymentState | null;
}

export interface RefundInput {
  readonly chargeId: string;
  readonly amount: bigint;
  readonly currency: string;
  /** Storevia's refund id; providers that support idempotency use it. */
  readonly reference: string;
}

export interface RefundResult {
  readonly providerRefundId: string | null;
  readonly status: "succeeded" | "pending" | "failed";
  readonly failureMessage?: string;
}

export class WebhookVerificationError extends Error {
  constructor(
    readonly reason:
      "missing_signature" | "invalid_signature" | "stale_signature" | "wrong_account",
  ) {
    super(reason);
    this.name = "WebhookVerificationError";
  }
}

export class WebhookPayloadError extends Error {
  constructor(readonly reason = "invalid_payload") {
    super(reason);
    this.name = "WebhookPayloadError";
  }
}

/** A provider call failed. `message` is safe to log (no secrets, no payload values). */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export interface CredentialsInput {
  readonly credentials: ProviderCredentials;
  /** Safe to display, e.g. "rzp_test_…1234". */
  readonly hint: string;
  readonly externalAccountId: string | null;
}

export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  readonly label: string;
  /** Currencies the adapter can take in M6. */
  readonly currencies: readonly string[] | "any";
  /** Validates what a merchant entered (or generates it, for the test provider). */
  prepareCredentials(input: unknown): CredentialsInput;
  createPayment(
    credentials: ProviderCredentials,
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult>;
  getPayment(
    credentials: ProviderCredentials,
    providerPaymentId: string,
  ): Promise<ProviderPaymentState>;
  /**
   * Checks the return redirect's signed parameters and returns the payment
   * they name, or null. Even a valid return is only a prompt: the caller
   * asks getPayment (or waits for the webhook) before acting.
   */
  verifyReturn(credentials: ProviderCredentials, params: URLSearchParams): string | null;
  /** Throws WebhookVerificationError. Verifies the exact bytes received. */
  verifyWebhook(
    credentials: ProviderCredentials,
    rawBody: Uint8Array,
    headers: Headers,
    now?: Date,
  ): void;
  /** Throws WebhookPayloadError. Call only after verifyWebhook. */
  parseWebhook(
    credentials: ProviderCredentials,
    rawBody: Uint8Array,
    headers: Headers,
  ): NormalisedPaymentEvent;
  cancelPayment(credentials: ProviderCredentials, providerPaymentId: string): Promise<void>;
  refundPayment(credentials: ProviderCredentials, input: RefundInput): Promise<RefundResult>;
}

/** Strict UTF-8 decoding: a body that isn't valid UTF-8 is a malformed payload. */
export function decodeBody(rawBody: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new WebhookPayloadError();
  }
}
