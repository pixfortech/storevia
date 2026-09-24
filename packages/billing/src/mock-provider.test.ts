import { describe, expect, it } from "vitest";
import { MOCK_SIGNATURE_HEADER, MockBillingProvider, toWire } from "./mock-provider";
import {
  WebhookPayloadError,
  WebhookVerificationError,
  type ProviderSubscriptionSnapshot,
} from "./provider";

const provider = new MockBillingProvider("unit-test-secret-0123456789abcdef0123");
const now = new Date("2026-09-25T12:00:00Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

const snapshot: ProviderSubscriptionSnapshot = {
  subscriptionRef: "mock_sub_0000-1111-2222",
  customerRef: "mock_cus_0000-1111-2222",
  planKey: "starter",
  interval: "MONTH",
  status: "ACTIVE",
  startedAt: now,
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: now,
  currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
  accessEndsAt: null,
  cancelledAt: null,
  pastDueSince: null,
  graceEndsAt: null,
  endedAt: null,
};

const reason = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e instanceof WebhookVerificationError ? e.reason : e;
  }
  return "ok";
};

describe("MockBillingProvider webhook verification", () => {
  const { rawBody, headers } = provider.deliver(
    toWire("mock_evt_0000-1111", "activated", now, snapshot),
    nowSeconds,
  );

  it("accepts a correctly signed, fresh delivery", () => {
    expect(
      reason(() => {
        provider.verifyWebhook(rawBody, headers, now);
      }),
    ).toBe("ok");
    expect(
      reason(() => {
        provider.verifyWebhook(rawBody, headers, new Date(now.getTime() + 299_000));
      }),
    ).toBe("ok");
  });

  it("rejects stale or future timestamps (replay window of 5 minutes)", () => {
    expect(
      reason(() => {
        provider.verifyWebhook(rawBody, headers, new Date(now.getTime() + 301_000));
      }),
    ).toBe("stale_signature");
    expect(
      reason(() => {
        provider.verifyWebhook(rawBody, headers, new Date(now.getTime() - 301_000));
      }),
    ).toBe("stale_signature");
  });

  it("rejects tampered bodies, wrong secrets and malformed headers", () => {
    expect(
      reason(() => {
        provider.verifyWebhook(`${rawBody} `, headers, now);
      }),
    ).toBe("invalid_signature");
    const other = new MockBillingProvider("another-secret-0123456789abcdef012345");
    expect(
      reason(() => {
        other.verifyWebhook(rawBody, headers, now);
      }),
    ).toBe("invalid_signature");
    expect(
      reason(() => {
        provider.verifyWebhook(rawBody, new Headers(), now);
      }),
    ).toBe("missing_signature");
    for (const value of [
      "garbage",
      "t=abc,v1=00",
      `t=${String(nowSeconds)},v1=zz`,
      `t=${String(nowSeconds)}`,
    ]) {
      const h = new Headers({ [MOCK_SIGNATURE_HEADER]: value });
      expect(
        reason(() => {
          provider.verifyWebhook(rawBody, h, now);
        }),
      ).toBe("invalid_signature");
    }
  });
});

describe("MockBillingProvider payload parsing", () => {
  it("normalises the wire format", () => {
    const event = provider.parseWebhookEvent(
      JSON.stringify(
        toWire("mock_evt_0000-1111", "past_due", now, { ...snapshot, status: "PAST_DUE" }),
      ),
    );
    expect(event).toMatchObject({
      provider: "MOCK",
      eventId: "mock_evt_0000-1111",
      type: "past_due",
      snapshotVersion: now,
      snapshot: { status: "PAST_DUE", planKey: "starter", interval: "MONTH" },
    });
  });

  it.each([
    ["not json", "{"],
    ["empty object", "{}"],
    [
      "unknown event type",
      JSON.stringify({
        ...toWire("mock_evt_0000-1111", "created", now, snapshot),
        type: "subscription.hacked",
      }),
    ],
    [
      "bad id",
      JSON.stringify({ ...toWire("mock_evt_0000-1111", "created", now, snapshot), id: "evt_1" }),
    ],
    [
      "bad status",
      JSON.stringify({
        ...toWire("mock_evt_0000-1111", "created", now, snapshot),
        data: { subscription: { status: "free" } },
      }),
    ],
  ])("rejects %s", (_, body) => {
    expect(() => provider.parseWebhookEvent(body)).toThrow(WebhookPayloadError);
  });
});
