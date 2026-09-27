import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  decodeBody,
  PaymentProviderError,
  WebhookPayloadError,
  WebhookVerificationError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type CredentialsInput,
  type NormalisedPaymentEvent,
  type PaymentProvider,
  type ProviderCredentials,
  type ProviderPaymentState,
  type RefundInput,
  type RefundResult,
} from "./types";

// The Test Payment Provider (`storevia-test`, ADR-0031 §4). Its "hosted
// page" is a storefront route that shows the amount and lets the shopper
// choose an outcome; the outcome arrives as an event signed with the
// connection's own secret and goes through the same webhook pipeline as a
// real provider's. It never moves money. Registry gating keeps it out of
// staging, preview and production.
//
// Deterministic refunds: an amount whose minor units end in 13 fails, any
// other succeeds.

export const TEST_SIGNATURE_HEADER = "x-storevia-test-signature";
export const TEST_EVENT_ID_HEADER = "x-storevia-test-event-id";
/** Signed events older than this are refused (replay window). */
const TOLERANCE_SECONDS = 300;

export type TestOutcome = "captured" | "failed" | "cancelled";

const eventSchema = z.strictObject({
  type: z.enum(["payment.captured", "payment.failed", "payment.cancelled"]),
  providerPaymentId: z.string().regex(/^tp_[A-Za-z0-9_-]{16,64}$/),
  amount: z.string().regex(/^\d{1,18}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  chargeId: z
    .string()
    .regex(/^tc_[A-Za-z0-9_-]{16,64}$/)
    .nullable(),
});

type TestEvent = z.infer<typeof eventSchema>;

function sign(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret)
    .update(`${String(timestamp)}.${body}`)
    .digest("hex");
}

function secretOf(credentials: ProviderCredentials): string {
  const secret = credentials["webhookSecret"];
  if (!secret || secret.length < 32)
    throw new PaymentProviderError("test connection has no secret", false);
  return secret;
}

export class TestPaymentProvider implements PaymentProvider {
  readonly key = "storevia-test" as const;
  readonly label = "Test payments";
  readonly currencies = "any" as const;

  prepareCredentials(): CredentialsInput {
    return {
      credentials: { webhookSecret: randomBytes(32).toString("base64url") },
      hint: "Test mode",
      externalAccountId: null,
    };
  }

  // The hosted page lives on the storefront that asked for the payment.
  createPayment(
    _credentials: ProviderCredentials,
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    const providerPaymentId = `tp_${randomBytes(18).toString("base64url")}`;
    const page = new URL("/checkout/test-payment", input.returnUrl);
    page.searchParams.set("ref", providerPaymentId);
    return Promise.resolve({ providerPaymentId, redirectUrl: page.toString() });
  }

  /** The test provider keeps no state of its own: an attempt is pending until an event says otherwise. */
  getPayment(
    _credentials: ProviderCredentials,
    providerPaymentId: string,
  ): Promise<ProviderPaymentState> {
    return Promise.resolve({
      providerPaymentId,
      status: "pending",
      amount: null,
      currency: null,
      chargeId: null,
    });
  }

  /** The test page never adds proof to the return URL; confirmation comes from signed events. */
  verifyReturn(): string | null {
    return null;
  }

  /** Builds a signed event, as the provider's servers would send it. */
  signedEvent(
    credentials: ProviderCredentials,
    input: {
      readonly outcome: TestOutcome;
      readonly providerPaymentId: string;
      readonly amount: bigint;
      readonly currency: string;
    },
    now = new Date(),
  ): { readonly body: string; readonly headers: Headers } {
    const event: TestEvent = {
      type: `payment.${input.outcome}`,
      providerPaymentId: input.providerPaymentId,
      amount: input.amount.toString(),
      currency: input.currency,
      chargeId: input.outcome === "captured" ? `tc_${randomBytes(18).toString("base64url")}` : null,
    };
    const body = JSON.stringify(event);
    const timestamp = Math.floor(now.getTime() / 1000);
    return {
      body,
      headers: new Headers({
        [TEST_SIGNATURE_HEADER]: `t=${String(timestamp)},v1=${sign(secretOf(credentials), timestamp, body)}`,
        [TEST_EVENT_ID_HEADER]: `tev_${randomBytes(18).toString("base64url")}`,
        "content-type": "application/json",
      }),
    };
  }

  verifyWebhook(
    credentials: ProviderCredentials,
    rawBody: Uint8Array,
    headers: Headers,
    now = new Date(),
  ): void {
    const header = headers.get(TEST_SIGNATURE_HEADER);
    if (!header) throw new WebhookVerificationError("missing_signature");
    const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header);
    if (!match?.[1] || !match[2]) throw new WebhookVerificationError("invalid_signature");
    const timestamp = Number(match[1]);
    if (Math.abs(now.getTime() / 1000 - timestamp) > TOLERANCE_SECONDS) {
      throw new WebhookVerificationError("stale_signature");
    }
    const expected = Buffer.from(
      sign(secretOf(credentials), timestamp, decodeBody(rawBody)),
      "hex",
    );
    const given = Buffer.from(match[2], "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new WebhookVerificationError("invalid_signature");
    }
  }

  parseWebhook(
    _credentials: ProviderCredentials,
    rawBody: Uint8Array,
    headers: Headers,
  ): NormalisedPaymentEvent {
    const eventId = headers.get(TEST_EVENT_ID_HEADER);
    if (!eventId || !/^tev_[A-Za-z0-9_-]{16,64}$/.test(eventId)) throw new WebhookPayloadError();
    let json: unknown;
    try {
      json = JSON.parse(decodeBody(rawBody));
    } catch {
      throw new WebhookPayloadError();
    }
    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) throw new WebhookPayloadError();
    const e = parsed.data;
    return {
      eventId,
      type: e.type,
      payment: {
        providerPaymentId: e.providerPaymentId,
        status:
          e.type === "payment.captured"
            ? "captured"
            : e.type === "payment.failed"
              ? "failed"
              : "cancelled",
        amount: BigInt(e.amount),
        currency: e.currency,
        chargeId: e.chargeId,
      },
    };
  }

  cancelPayment(): Promise<void> {
    return Promise.resolve();
  }

  refundPayment(_credentials: ProviderCredentials, input: RefundInput): Promise<RefundResult> {
    if (input.amount % 100n === 13n) {
      return Promise.resolve({
        providerRefundId: null,
        status: "failed",
        failureMessage: "The test provider declined this refund (amounts ending in 13 fail).",
      });
    }
    return Promise.resolve({
      providerRefundId: `tr_${randomBytes(18).toString("base64url")}`,
      status: "succeeded",
    });
  }
}
