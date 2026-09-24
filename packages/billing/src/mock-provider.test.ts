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

const b = (text: string) => Buffer.from(text, "utf8");

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
        provider.verifyWebhook(b(rawBody), headers, now);
      }),
    ).toBe("ok");
    expect(
      reason(() => {
        provider.verifyWebhook(b(rawBody), headers, new Date(now.getTime() + 299_000));
      }),
    ).toBe("ok");
  });

  it("rejects stale or future timestamps (replay window of 5 minutes)", () => {
    expect(
      reason(() => {
        provider.verifyWebhook(b(rawBody), headers, new Date(now.getTime() + 301_000));
      }),
    ).toBe("stale_signature");
    expect(
      reason(() => {
        provider.verifyWebhook(b(rawBody), headers, new Date(now.getTime() - 301_000));
      }),
    ).toBe("stale_signature");
  });

  it("rejects tampered bodies, wrong secrets and malformed headers", () => {
    expect(
      reason(() => {
        provider.verifyWebhook(b(`${rawBody} `), headers, now);
      }),
    ).toBe("invalid_signature");
    const other = new MockBillingProvider("another-secret-0123456789abcdef012345");
    expect(
      reason(() => {
        other.verifyWebhook(b(rawBody), headers, now);
      }),
    ).toBe("invalid_signature");
    expect(
      reason(() => {
        provider.verifyWebhook(b(rawBody), new Headers(), now);
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
          provider.verifyWebhook(b(rawBody), h, now);
        }),
      ).toBe("invalid_signature");
    }
  });
});

describe("MockBillingProvider payload parsing", () => {
  it("normalises the wire format", () => {
    const event = provider.parseWebhookEvent(
      b(
        JSON.stringify(
          toWire("mock_evt_0000-1111", "past_due", now, { ...snapshot, status: "PAST_DUE" }),
        ),
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
    expect(() => provider.parseWebhookEvent(b(body))).toThrow(WebhookPayloadError);
  });
});

describe("raw bytes", () => {
  it("verifies the exact bytes received, not decoded text", () => {
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}')]); // BOM
    const headers = new Headers({ [MOCK_SIGNATURE_HEADER]: provider.sign(body, nowSeconds) });
    expect(
      reason(() => {
        provider.verifyWebhook(body, headers, now);
      }),
    ).toBe("ok");
    // The decoded text (BOM stripped) is a different message.
    const decoded = Buffer.from(new TextDecoder().decode(body));
    expect(
      reason(() => {
        provider.verifyWebhook(decoded, headers, now);
      }),
    ).toBe("invalid_signature");
  });

  it("rejects bodies that are not valid UTF-8", () => {
    expect(() => provider.parseWebhookEvent(Buffer.from([0x7b, 0xff, 0x7d]))).toThrow(
      WebhookPayloadError,
    );
  });
});
