import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RazorpayProvider } from "./razorpay";
import {
  availableProviderKeys,
  credentialsBinding,
  getPaymentProvider,
  isTestPaymentsEnabled,
  openCredentials,
  sealCredentials,
} from "./registry";
import { TestPaymentProvider, TEST_EVENT_ID_HEADER, TEST_SIGNATURE_HEADER } from "./test-provider";
import { PaymentProviderError, WebhookPayloadError, WebhookVerificationError } from "./types";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("test payment provider", () => {
  const provider = new TestPaymentProvider();
  const { credentials } = provider.prepareCredentials();
  const other = provider.prepareCredentials().credentials;

  it("creates a hosted page on the storefront that asked", async () => {
    const result = await provider.createPayment(credentials, {
      reference: "pay_x",
      amount: 123000n,
      currency: "INR",
      description: "Order",
      customerEmail: null,
      returnUrl: "https://shop.example/checkout/return?attempt=1",
      expiresAt: new Date(),
    });
    expect(result.providerPaymentId).toMatch(/^tp_/);
    const url = new URL(result.redirectUrl);
    expect(url.origin).toBe("https://shop.example");
    expect(url.pathname).toBe("/checkout/test-payment");
    expect(url.searchParams.get("ref")).toBe(result.providerPaymentId);
  });

  it("signs events that verify and parse, and refuses tampering, other secrets and stale ones", () => {
    const now = new Date("2026-09-27T10:00:00Z");
    const event = provider.signedEvent(
      credentials,
      {
        outcome: "captured",
        providerPaymentId: "tp_abcdefghijklmnopqrst",
        amount: 123000n,
        currency: "INR",
      },
      now,
    );
    provider.verifyWebhook(credentials, bytes(event.body), event.headers, now);
    const parsed = provider.parseWebhook(credentials, bytes(event.body), event.headers);
    expect(parsed.payment).toMatchObject({ status: "captured", amount: 123000n, currency: "INR" });
    expect(parsed.payment?.chargeId).toMatch(/^tc_/);

    const tampered = event.body.replace("123000", "1");
    expect(() => {
      provider.verifyWebhook(credentials, bytes(tampered), event.headers, now);
    }).toThrow(WebhookVerificationError);
    expect(() => {
      provider.verifyWebhook(other, bytes(event.body), event.headers, now);
    }).toThrow(WebhookVerificationError);
    const later = new Date(now.getTime() + 301_000);
    expect(() => {
      provider.verifyWebhook(credentials, bytes(event.body), event.headers, later);
    }).toThrow(expect.objectContaining({ reason: "stale_signature" }));
    const missing = new Headers(event.headers);
    missing.delete(TEST_SIGNATURE_HEADER);
    expect(() => {
      provider.verifyWebhook(credentials, bytes(event.body), missing, now);
    }).toThrow(expect.objectContaining({ reason: "missing_signature" }));
    const noId = new Headers(event.headers);
    noId.delete(TEST_EVENT_ID_HEADER);
    expect(() => provider.parseWebhook(credentials, bytes(event.body), noId)).toThrow(
      WebhookPayloadError,
    );
  });

  it("fails refunds whose amount ends in 13, and returns pending payments", async () => {
    expect(
      (
        await provider.refundPayment(credentials, {
          chargeId: "tc_x",
          amount: 1013n,
          currency: "INR",
          reference: "r",
        })
      ).status,
    ).toBe("failed");
    expect(
      (
        await provider.refundPayment(credentials, {
          chargeId: "tc_x",
          amount: 1000n,
          currency: "INR",
          reference: "r",
        })
      ).status,
    ).toBe("succeeded");
    expect((await provider.getPayment(credentials, "tp_x")).status).toBe("pending");
    expect(provider.verifyReturn()).toBeNull();
  });
});

describe("razorpay", () => {
  const credentials = {
    keyId: "rzp_test_ABCDEFGH1234",
    keySecret: "key-secret-0123456789",
    webhookSecret: "webhook-secret-0123",
    accountId: "acc_ABCDEFGH12",
  };
  const hex = (secret: string, message: string | Uint8Array) =>
    createHmac("sha256", secret).update(message).digest("hex");

  it("validates what a merchant enters and masks the key id", () => {
    const provider = new RazorpayProvider();
    const prepared = provider.prepareCredentials({ ...credentials, accountId: "" });
    expect(prepared.hint).toBe("rzp_test_…1234");
    expect(prepared.credentials).not.toHaveProperty("accountId");
    expect(() => provider.prepareCredentials({ ...credentials, keyId: "sk_live_x" })).toThrow(
      PaymentProviderError,
    );
  });

  it("creates a payment link with the exact amount, reference and return URL", async () => {
    const fetch = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        Response.json({
          id: "plink_ABCDEF123",
          status: "created",
          amount: 123000,
          currency: "INR",
          short_url: "https://rzp.io/i/abc",
        }),
      ),
    );
    const provider = new RazorpayProvider({ apiUrl: "https://api.test/v1", fetch });
    const result = await provider.createPayment(credentials, {
      reference: "pay_01abc",
      amount: 123000n,
      currency: "INR",
      description: "Order at Shop",
      customerEmail: "shopper@example.com",
      returnUrl: "https://shop.example/checkout/return",
      expiresAt: new Date("2026-09-27T10:30:00Z"),
    });
    expect(result).toEqual({
      providerPaymentId: "plink_ABCDEF123",
      redirectUrl: "https://rzp.io/i/abc",
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.test/v1/payment_links");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      amount: 123000,
      currency: "INR",
      accept_partial: false,
      reference_id: "pay_01abc",
      expire_by: 1790505000,
      callback_url: "https://shop.example/checkout/return",
      callback_method: "get",
    });
    await expect(
      provider.createPayment(credentials, {
        reference: "x",
        amount: 1n,
        currency: "USD",
        description: "",
        customerEmail: null,
        returnUrl: "https://x",
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(PaymentProviderError);
  });

  it("reads a paid link as captured with its charge, and never leaks provider responses in errors", async () => {
    const provider = new RazorpayProvider({
      fetch: () =>
        Promise.resolve(
          Response.json({
            id: "plink_ABCDEF123",
            status: "paid",
            amount: 123000,
            amount_paid: 123000,
            currency: "INR",
            payments: [{ payment_id: "pay_XYZ123456", amount: 123000, status: "captured" }],
          }),
        ),
    });
    expect(await provider.getPayment(credentials, "plink_ABCDEF123")).toEqual({
      providerPaymentId: "plink_ABCDEF123",
      status: "captured",
      amount: 123000n,
      currency: "INR",
      chargeId: "pay_XYZ123456",
    });
    const failing = new RazorpayProvider({
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { description: "customer shopper@example.com" } }), {
            status: 400,
          }),
        ),
    });
    const error = await failing.getPayment(credentials, "plink_ABCDEF123").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentProviderError);
    expect((error as Error).message).not.toContain("shopper@example.com");
    expect((error as PaymentProviderError).retryable).toBe(false);
  });

  it("verifies the signed return and refuses a forged one", () => {
    const provider = new RazorpayProvider();
    const params = new URLSearchParams({
      razorpay_payment_id: "pay_XYZ123456",
      razorpay_payment_link_id: "plink_ABCDEF123",
      razorpay_payment_link_reference_id: "pay_01abc",
      razorpay_payment_link_status: "paid",
    });
    params.set(
      "razorpay_signature",
      hex(credentials.keySecret, "plink_ABCDEF123|pay_01abc|paid|pay_XYZ123456"),
    );
    expect(provider.verifyReturn(credentials, params)).toBe("plink_ABCDEF123");
    params.set("razorpay_payment_link_status", "cancelled");
    expect(provider.verifyReturn(credentials, params)).toBeNull();
    params.delete("razorpay_signature");
    expect(provider.verifyReturn(credentials, params)).toBeNull();
  });

  it("verifies webhooks over the raw body, for this account only, and parses paid links", () => {
    const provider = new RazorpayProvider();
    const body = JSON.stringify({
      entity: "event",
      account_id: credentials.accountId,
      event: "payment_link.paid",
      payload: {
        payment_link: {
          entity: { id: "plink_ABCDEF123", status: "paid", amount: 123000, currency: "INR" },
        },
        payment: {
          entity: { id: "pay_XYZ123456", amount: 123000, currency: "INR", status: "captured" },
        },
      },
    });
    const headers = new Headers({
      "x-razorpay-signature": hex(credentials.webhookSecret, body),
      "x-razorpay-event-id": "evt_ABC123",
    });
    provider.verifyWebhook(credentials, bytes(body), headers);
    expect(provider.parseWebhook(credentials, bytes(body), headers)).toEqual({
      eventId: "evt_ABC123",
      type: "payment_link.paid",
      payment: {
        providerPaymentId: "plink_ABCDEF123",
        status: "captured",
        amount: 123000n,
        currency: "INR",
        chargeId: "pay_XYZ123456",
      },
    });
    // Re-serialised JSON (different bytes) doesn't verify.
    const reserialised = JSON.stringify(JSON.parse(body), null, 1);
    expect(() => {
      provider.verifyWebhook(credentials, bytes(reserialised), headers);
    }).toThrow(WebhookVerificationError);
    expect(() => {
      provider.verifyWebhook(credentials, bytes(body), new Headers());
    }).toThrow(expect.objectContaining({ reason: "missing_signature" }));
    // Signed, but for another Razorpay account.
    const foreign = body.replace(credentials.accountId, "acc_OTHERACCT1");
    const foreignHeaders = new Headers({
      "x-razorpay-signature": hex(credentials.webhookSecret, foreign),
    });
    expect(() => {
      provider.verifyWebhook(credentials, bytes(foreign), foreignHeaders);
    }).toThrow(expect.objectContaining({ reason: "wrong_account" }));
    // Events Storevia doesn't act on are acknowledged, not applied.
    const other = JSON.stringify({ event: "payment.authorized", payload: {} });
    expect(provider.parseWebhook(credentials, bytes(other), headers).payment).toBeNull();
    expect(() => provider.parseWebhook(credentials, bytes("{not json"), headers)).toThrow(
      WebhookPayloadError,
    );
  });

  it("maps refunds and makes each one idempotent with Storevia's refund id", async () => {
    const seen: Headers[] = [];
    const provider = new RazorpayProvider({
      fetch: (_url, init) => {
        seen.push(new Headers(init.headers));
        return Promise.resolve(Response.json({ id: "rfnd_ABC12345", status: "processed" }));
      },
    });
    expect(
      await provider.refundPayment(credentials, {
        chargeId: "pay_XYZ123456",
        amount: 5000n,
        currency: "INR",
        reference: "refund_01",
      }),
    ).toEqual({ providerRefundId: "rfnd_ABC12345", status: "succeeded" });
    expect(seen[0]?.get("x-refund-idempotency")).toBe("refund_01");
    expect(seen[0]?.get("authorization")).toMatch(/^Basic /);
  });
});

describe("registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables test payments only in development and test (production builds must opt in)", () => {
    expect(isTestPaymentsEnabled({ STOREVIA_ENV: "development", NODE_ENV: "development" })).toBe(
      true,
    );
    expect(isTestPaymentsEnabled({ STOREVIA_ENV: "test", NODE_ENV: "production" })).toBe(false);
    expect(
      isTestPaymentsEnabled({
        STOREVIA_ENV: "test",
        NODE_ENV: "production",
        TEST_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(true);
    for (const stage of ["production", "staging", "preview", undefined]) {
      expect(
        isTestPaymentsEnabled({
          STOREVIA_ENV: stage,
          NODE_ENV: "production",
          TEST_PAYMENTS_ENABLED: "true",
        }),
        String(stage),
      ).toBe(false);
    }
    vi.stubEnv("STOREVIA_ENV", "production");
    expect(getPaymentProvider("storevia-test")).toBeNull();
    expect(availableProviderKeys()).toEqual(["razorpay"]);
    expect(getPaymentProvider("stripe")).toBeNull();
  });

  it("seals credentials so they open only for their own connection", () => {
    vi.stubEnv("PAYMENT_CREDENTIALS_KEYS", `1:${Buffer.alloc(32, 7).toString("base64")}`);
    const binding = credentialsBinding({ storeId: "s1", id: "c1", provider: "razorpay" });
    const sealed = sealCredentials(binding, { keySecret: "top-secret" });
    expect(Buffer.from(sealed.ciphertext).toString("utf8")).not.toContain("top-secret");
    expect(openCredentials(binding, sealed)).toEqual({ keySecret: "top-secret" });
    expect(() =>
      openCredentials(
        credentialsBinding({ storeId: "s2", id: "c1", provider: "razorpay" }),
        sealed,
      ),
    ).toThrow();
  });
});
