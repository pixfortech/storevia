import { createHmac, timingSafeEqual } from "node:crypto";
import { maskIdentifier } from "@storevia/security";
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
  type ProviderPaymentStatus,
  type RefundInput,
  type RefundResult,
} from "./types";

// Razorpay, the first real provider (ADR-0031 §4). Each store connects its
// own Razorpay account; funds settle to the merchant. Shoppers pay on a
// Razorpay-hosted Payment Link and come back with signed parameters; the
// authority is the webhook (HMAC-SHA256 of the raw body with the account's
// webhook secret) or a server-side fetch of the link. INR only in M6.
//
//   Return signature: HMAC-SHA256(key secret,
//     link_id|reference_id|status|payment_id)
//   Webhook: X-Razorpay-Signature = hex HMAC-SHA256(webhook secret, raw body);
//   X-Razorpay-Event-Id identifies an event for de-duplication.

const DEFAULT_API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 10_000;

export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
export const RAZORPAY_EVENT_ID_HEADER = "x-razorpay-event-id";
export const RAZORPAY_REFUND_IDEMPOTENCY_HEADER = "x-refund-idempotency";

const credentialsSchema = z.strictObject({
  keyId: z
    .string()
    .trim()
    .regex(
      /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/,
      "Enter the key id from Razorpay (rzp_test_… or rzp_live_…).",
    ),
  keySecret: z.string().trim().min(16, "Enter the key secret.").max(128),
  webhookSecret: z
    .string()
    .trim()
    .min(12, "Enter the webhook secret you set in Razorpay.")
    .max(128),
  accountId: z
    .string()
    .trim()
    .regex(/^acc_[A-Za-z0-9]{8,32}$/, "Account ids look like acc_…")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type RazorpayMode = "TEST" | "LIVE";

export function razorpayMode(keyId: string): RazorpayMode {
  return keyId.startsWith("rzp_live_") ? "LIVE" : "TEST";
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

function hmacHex(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message).digest();
}

function equalHex(expected: Buffer, given: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const buffer = Buffer.from(given, "hex");
  return buffer.length === expected.length && timingSafeEqual(buffer, expected);
}

function required(credentials: ProviderCredentials, key: string): string {
  const value = credentials[key];
  if (!value) throw new PaymentProviderError(`razorpay connection is missing ${key}`, false);
  return value;
}

const linkSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.number().int().nonnegative(),
  amount_paid: z.number().int().nonnegative().optional(),
  currency: z.string(),
  short_url: z.string().optional(),
  payments: z
    .array(
      z.object({
        payment_id: z.string(),
        amount: z.number().int().nonnegative(),
        status: z.string(),
      }),
    )
    .nullable()
    .optional(),
});

const refundSchema = z.object({ id: z.string(), status: z.string() });

function linkStatus(status: string): ProviderPaymentStatus {
  switch (status) {
    case "paid":
      return "captured";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

export class RazorpayProvider implements PaymentProvider {
  readonly key = "razorpay" as const;
  readonly label = "Razorpay";
  readonly currencies = ["INR"] as const;

  constructor(
    private readonly options: { readonly apiUrl?: string; readonly fetch?: Fetch } = {},
  ) {}

  prepareCredentials(input: unknown): CredentialsInput {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "keyId");
        fields[key] ??= issue.message;
      }
      throw Object.assign(new PaymentProviderError("invalid razorpay credentials", false), {
        fieldErrors: fields,
      });
    }
    const { accountId, ...rest } = parsed.data;
    return {
      credentials: { ...rest, ...(accountId ? { accountId } : {}) },
      hint: maskIdentifier(parsed.data.keyId),
      externalAccountId: accountId ?? null,
    };
  }

  private async call(
    credentials: ProviderCredentials,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders: Readonly<Record<string, string>> = {},
  ): Promise<unknown> {
    const auth = Buffer.from(
      `${required(credentials, "keyId")}:${required(credentials, "keySecret")}`,
    ).toString("base64");
    const fetcher = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await fetcher(`${this.options.apiUrl ?? DEFAULT_API}${path}`, {
        method,
        headers: {
          authorization: `Basic ${auth}`,
          ...(body ? { "content-type": "application/json" } : {}),
          ...extraHeaders,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PaymentProviderError(
        `razorpay ${method} ${path.split("/")[1] ?? ""} unreachable`,
        true,
      );
    }
    if (!response.ok) {
      // Never echo the response: it can carry customer or account details.
      throw new PaymentProviderError(
        `razorpay ${method} ${path.split("/")[1] ?? ""} returned ${String(response.status)}`,
        response.status >= 500 || response.status === 429,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new PaymentProviderError("razorpay returned malformed JSON", true);
    }
  }

  async createPayment(
    credentials: ProviderCredentials,
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    if (input.currency !== "INR") {
      throw new PaymentProviderError("razorpay takes INR only in M6", false);
    }
    if (input.amount > BigInt(Number.MAX_SAFE_INTEGER) || input.amount <= 0n) {
      throw new PaymentProviderError("amount out of range", false);
    }
    const body = {
      amount: Number(input.amount),
      currency: input.currency,
      accept_partial: false,
      reference_id: input.reference,
      description: input.description.slice(0, 2000),
      expire_by: Math.floor(input.expiresAt.getTime() / 1000),
      ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: input.returnUrl,
      callback_method: "get",
    };
    const link = linkSchema.safeParse(await this.call(credentials, "POST", "/payment_links", body));
    if (!link.success || !link.data.short_url) {
      throw new PaymentProviderError("razorpay payment link response was malformed", true);
    }
    return { providerPaymentId: link.data.id, redirectUrl: link.data.short_url };
  }

  async getPayment(
    credentials: ProviderCredentials,
    providerPaymentId: string,
  ): Promise<ProviderPaymentState> {
    if (!/^plink_[A-Za-z0-9]{6,40}$/.test(providerPaymentId)) {
      throw new PaymentProviderError("not a razorpay payment link id", false);
    }
    const link = linkSchema.safeParse(
      await this.call(credentials, "GET", `/payment_links/${providerPaymentId}`),
    );
    if (!link.success)
      throw new PaymentProviderError("razorpay payment link response was malformed", true);
    const status = linkStatus(link.data.status);
    const captured = (link.data.payments ?? []).find((p) => p.status === "captured");
    return {
      providerPaymentId,
      status: status === "captured" && !captured ? "pending" : status,
      amount: captured ? BigInt(captured.amount) : null,
      currency: captured ? link.data.currency : null,
      chargeId: captured?.payment_id ?? null,
    };
  }

  verifyReturn(credentials: ProviderCredentials, params: URLSearchParams): string | null {
    const paymentId = params.get("razorpay_payment_id") ?? "";
    const linkId = params.get("razorpay_payment_link_id") ?? "";
    const reference = params.get("razorpay_payment_link_reference_id") ?? "";
    const status = params.get("razorpay_payment_link_status") ?? "";
    const signature = params.get("razorpay_signature") ?? "";
    if (!paymentId || !linkId || !status || !signature) return null;
    const expected = hmacHex(
      required(credentials, "keySecret"),
      `${linkId}|${reference}|${status}|${paymentId}`,
    );
    return equalHex(expected, signature) ? linkId : null;
  }

  verifyWebhook(credentials: ProviderCredentials, rawBody: Uint8Array, headers: Headers): void {
    const signature = headers.get(RAZORPAY_SIGNATURE_HEADER);
    if (!signature) throw new WebhookVerificationError("missing_signature");
    const expected = createHmac("sha256", required(credentials, "webhookSecret"))
      .update(rawBody)
      .digest();
    if (!equalHex(expected, signature)) throw new WebhookVerificationError("invalid_signature");
    // An event for another Razorpay account is refused even if signed.
    const accountId = credentials["accountId"];
    if (accountId) {
      let account: unknown;
      try {
        account = (JSON.parse(decodeBody(rawBody)) as { account_id?: unknown }).account_id;
      } catch {
        throw new WebhookPayloadError();
      }
      if (account !== accountId) throw new WebhookVerificationError("wrong_account");
    }
  }

  parseWebhook(
    _credentials: ProviderCredentials,
    rawBody: Uint8Array,
    headers: Headers,
  ): NormalisedPaymentEvent {
    const eventId = headers.get(RAZORPAY_EVENT_ID_HEADER);
    if (!eventId || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) throw new WebhookPayloadError();
    let json: {
      event?: unknown;
      payload?: {
        payment_link?: { entity?: unknown };
        payment?: { entity?: unknown };
      };
    };
    try {
      json = JSON.parse(decodeBody(rawBody)) as typeof json;
    } catch {
      throw new WebhookPayloadError();
    }
    const type = typeof json.event === "string" ? json.event.slice(0, 64) : "";
    if (!type) throw new WebhookPayloadError();
    if (!["payment_link.paid", "payment_link.cancelled", "payment_link.expired"].includes(type)) {
      return { eventId, type, payment: null };
    }
    const link = linkSchema.safeParse(json.payload?.payment_link?.entity);
    if (!link.success) throw new WebhookPayloadError();
    let amount: bigint | null = null;
    let currency: string | null = null;
    let chargeId: string | null = null;
    if (type === "payment_link.paid") {
      const payment = z
        .object({
          id: z.string(),
          amount: z.number().int().nonnegative(),
          currency: z.string(),
          status: z.string(),
        })
        .safeParse(json.payload?.payment?.entity);
      if (!payment.success || payment.data.status !== "captured") throw new WebhookPayloadError();
      amount = BigInt(payment.data.amount);
      currency = payment.data.currency;
      chargeId = payment.data.id;
    }
    return {
      eventId,
      type,
      payment: {
        providerPaymentId: link.data.id,
        status:
          type === "payment_link.paid"
            ? "captured"
            : type === "payment_link.cancelled"
              ? "cancelled"
              : "expired",
        amount,
        currency,
        chargeId,
      },
    };
  }

  async cancelPayment(credentials: ProviderCredentials, providerPaymentId: string): Promise<void> {
    if (!/^plink_[A-Za-z0-9]{6,40}$/.test(providerPaymentId)) return;
    try {
      await this.call(credentials, "POST", `/payment_links/${providerPaymentId}/cancel`);
    } catch (error) {
      // A link that was paid or already closed can't be cancelled; the caller
      // re-reads its state either way.
      if (error instanceof PaymentProviderError && !error.retryable) return;
      throw error;
    }
  }

  async refundPayment(credentials: ProviderCredentials, input: RefundInput): Promise<RefundResult> {
    if (!/^pay_[A-Za-z0-9]{6,40}$/.test(input.chargeId)) {
      throw new PaymentProviderError("not a razorpay payment id", false);
    }
    // Razorpay's refund idempotency key: a request retried after a timeout
    // with the same key returns the first refund instead of creating a
    // second (M8). The key is Storevia's refund id, one per refund row.
    const refund = refundSchema.safeParse(
      await this.call(
        credentials,
        "POST",
        `/payments/${input.chargeId}/refund`,
        {
          amount: Number(input.amount),
          speed: "normal",
          receipt: input.reference.slice(0, 40),
          notes: { storevia_refund: input.reference },
        },
        { [RAZORPAY_REFUND_IDEMPOTENCY_HEADER]: input.reference },
      ),
    );
    if (!refund.success)
      throw new PaymentProviderError("razorpay refund response was malformed", true);
    const status =
      refund.data.status === "processed"
        ? "succeeded"
        : refund.data.status === "failed"
          ? "failed"
          : "pending";
    return {
      providerRefundId: refund.data.id,
      status,
      ...(status === "failed" ? { failureMessage: "Razorpay declined the refund." } : {}),
    };
  }
}
