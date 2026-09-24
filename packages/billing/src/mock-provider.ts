import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { systemDb } from "@storevia/database/system";
import { z } from "zod";
import {
  WebhookPayloadError,
  WebhookVerificationError,
  type BillingEventType,
  type BillingProvider,
  type CheckoutResult,
  type NormalisedBillingEvent,
  type ProviderSubscriptionSnapshot,
} from "./provider";
import type { SubscriptionStatus } from "./state-machine";
import type { BillingInterval } from "./subscriptions";

// MockBillingProvider (ADR-0022 §7): behaves like a payment provider with its
// own wire format, signed webhooks and snake_case payloads, so the webhook
// pipeline is exercised exactly as a real adapter would exercise it. It is
// enabled only outside production (registry.ts). Its "provider-side" state is
// the subscription as Storevia last applied it: the mock has no remote
// system, and events are the only way its changes reach Storevia.

export const MOCK_SIGNATURE_HEADER = "storevia-mock-signature";
const TOLERANCE_SECONDS = 5 * 60;
const DAY = 24 * 3600 * 1000;
export const MOCK_GRACE_DAYS = 14;

const WIRE_STATUS = {
  TRIAL: "trialing",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELLED: "canceled",
  EXPIRED: "expired",
} as const satisfies Record<SubscriptionStatus, string>;

const FROM_WIRE_STATUS: Record<string, SubscriptionStatus> = Object.fromEntries(
  Object.entries(WIRE_STATUS).map(([k, v]) => [v, k as SubscriptionStatus]),
);

const isoOrNull = z.union([z.iso.datetime(), z.null()]);

const wireSchema = z.object({
  id: z.string().regex(/^mock_evt_[A-Za-z0-9-]{8,64}$/),
  type: z.string().regex(/^subscription\.[a-z_]+$/),
  created: z.iso.datetime(),
  data: z.object({
    subscription: z.object({
      id: z.string().regex(/^mock_sub_[A-Za-z0-9-]{8,64}$/),
      customer: z.string().regex(/^mock_cus_[A-Za-z0-9-]{8,64}$/),
      plan: z.string().min(1).max(40),
      interval: z.union([z.literal("month"), z.literal("year"), z.null()]),
      status: z.enum(["trialing", "active", "past_due", "canceled", "expired"]),
      started_at: z.iso.datetime(),
      trial_start: isoOrNull,
      trial_end: isoOrNull,
      current_period_start: isoOrNull,
      current_period_end: isoOrNull,
      cancel_at: isoOrNull,
      canceled_at: isoOrNull,
      past_due_since: isoOrNull,
      grace_until: isoOrNull,
      ended_at: isoOrNull,
    }),
  }),
});

export type MockWirePayload = z.infer<typeof wireSchema>;

const EVENT_TYPES = new Set<string>([
  "created",
  "activated",
  "renewed",
  "upgraded",
  "downgraded",
  "past_due",
  "payment_recovered",
  "cancelled",
  "reactivated",
  "expired",
]);

const toIso = (d: Date | null) => (d ? d.toISOString() : null);
const toDate = (s: string | null) => (s ? new Date(s) : null);

export function periodLength(interval: BillingInterval | null): number {
  return interval === "YEAR" ? 365 * DAY : 30 * DAY;
}

export function toWire(
  id: string,
  type: string,
  occurredAt: Date,
  s: ProviderSubscriptionSnapshot,
): MockWirePayload {
  return {
    id,
    type: `subscription.${type}`,
    created: occurredAt.toISOString(),
    data: {
      subscription: {
        id: s.subscriptionRef,
        customer: s.customerRef,
        plan: s.planKey,
        interval: s.interval === null ? null : s.interval === "YEAR" ? "year" : "month",
        status: WIRE_STATUS[s.status],
        started_at: s.startedAt.toISOString(),
        trial_start: toIso(s.trialStartsAt),
        trial_end: toIso(s.trialEndsAt),
        current_period_start: toIso(s.currentPeriodStart),
        current_period_end: toIso(s.currentPeriodEnd),
        cancel_at: toIso(s.accessEndsAt),
        canceled_at: toIso(s.cancelledAt),
        past_due_since: toIso(s.pastDueSince),
        grace_until: toIso(s.graceEndsAt),
        ended_at: toIso(s.endedAt),
      },
    },
  };
}

export class MockBillingProvider implements BillingProvider {
  readonly key = "MOCK" as const;

  constructor(private readonly secret: string) {}

  // --- signing (the mock's "server side") ---------------------------------------

  sign(rawBody: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
    const mac = createHmac("sha256", this.secret)
      .update(`${String(timestamp)}.${rawBody}`)
      .digest("hex");
    return `t=${String(timestamp)},v1=${mac}`;
  }

  /** A signed delivery, as the provider would POST it. */
  deliver(payload: unknown, timestamp?: number): { rawBody: string; headers: Headers } {
    const rawBody = JSON.stringify(payload);
    return {
      rawBody,
      headers: new Headers({ [MOCK_SIGNATURE_HEADER]: this.sign(rawBody, timestamp) }),
    };
  }

  newEventId(): string {
    return `mock_evt_${randomUUID()}`;
  }

  // --- BillingProvider ----------------------------------------------------------

  verifyWebhook(rawBody: string, headers: Headers, now: Date = new Date()): void {
    const header = headers.get(MOCK_SIGNATURE_HEADER);
    if (!header) throw new WebhookVerificationError("missing_signature");
    const parts = new Map(
      header.split(",").map((part) => {
        const [k, ...v] = part.trim().split("=");
        return [k ?? "", v.join("=")] as const;
      }),
    );
    const timestamp = Number(parts.get("t"));
    const given = parts.get("v1") ?? "";
    if (!Number.isInteger(timestamp) || !/^[0-9a-f]{64}$/.test(given)) {
      throw new WebhookVerificationError("invalid_signature");
    }
    const expected = createHmac("sha256", this.secret)
      .update(`${String(timestamp)}.${rawBody}`)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(given, "hex"))) {
      throw new WebhookVerificationError("invalid_signature");
    }
    // Checked after the MAC so an attacker can't learn anything from timing.
    if (Math.abs(now.getTime() / 1000 - timestamp) > TOLERANCE_SECONDS) {
      throw new WebhookVerificationError("stale_signature");
    }
  }

  parseWebhookEvent(rawBody: string): NormalisedBillingEvent {
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new WebhookPayloadError();
    }
    const parsed = wireSchema.safeParse(json);
    if (!parsed.success) throw new WebhookPayloadError();
    const { id, type, created, data } = parsed.data;
    const eventType = type.slice("subscription.".length);
    if (!EVENT_TYPES.has(eventType)) throw new WebhookPayloadError();
    const sub = data.subscription;
    const status = FROM_WIRE_STATUS[sub.status];
    if (!status) throw new WebhookPayloadError();
    const occurredAt = new Date(created);
    return {
      provider: "MOCK",
      eventId: id,
      type: eventType as BillingEventType,
      occurredAt,
      snapshotVersion: occurredAt, // the mock pushes full snapshots
      snapshot: {
        subscriptionRef: sub.id,
        customerRef: sub.customer,
        planKey: sub.plan,
        interval: sub.interval === null ? null : sub.interval === "year" ? "YEAR" : "MONTH",
        status,
        startedAt: new Date(sub.started_at),
        trialStartsAt: toDate(sub.trial_start),
        trialEndsAt: toDate(sub.trial_end),
        currentPeriodStart: toDate(sub.current_period_start),
        currentPeriodEnd: toDate(sub.current_period_end),
        accessEndsAt: toDate(sub.cancel_at),
        cancelledAt: toDate(sub.canceled_at),
        pastDueSince: toDate(sub.past_due_since),
        graceEndsAt: toDate(sub.grace_until),
        endedAt: toDate(sub.ended_at),
      },
    };
  }

  createCustomer(_input: {
    organisationId: string;
    name: string;
  }): Promise<{ customerRef: string }> {
    return Promise.resolve({ customerRef: `mock_cus_${randomUUID()}` });
  }

  /** The mock has no hosted checkout; merchants never see a fake one. */
  createCheckout(): Promise<CheckoutResult> {
    return Promise.resolve({ kind: "unavailable" });
  }

  createSubscription(input: {
    customerRef: string;
    planKey: string;
    interval: BillingInterval | null;
    trialDays: number;
  }): Promise<ProviderSubscriptionSnapshot> {
    const now = new Date();
    const trial = input.trialDays > 0;
    const trialEndsAt = trial ? new Date(now.getTime() + input.trialDays * DAY) : null;
    return Promise.resolve({
      subscriptionRef: `mock_sub_${randomUUID()}`,
      customerRef: input.customerRef,
      planKey: input.planKey,
      interval: input.interval,
      status: trial ? "TRIAL" : "ACTIVE",
      startedAt: now,
      trialStartsAt: trial ? now : null,
      trialEndsAt,
      currentPeriodStart: trial ? null : now,
      currentPeriodEnd: trial ? null : new Date(now.getTime() + periodLength(input.interval)),
      accessEndsAt: null,
      cancelledAt: null,
      pastDueSince: null,
      graceEndsAt: null,
      endedAt: null,
    });
  }

  async getSubscription(subscriptionRef: string): Promise<ProviderSubscriptionSnapshot | null> {
    const db = systemDb();
    const sub = await db.subscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: "MOCK",
          providerSubscriptionId: subscriptionRef,
        },
      },
      include: { plan: { select: { key: true } } },
    });
    if (!sub) return null;
    const customer = await db.billingCustomer.findUnique({
      where: { organisationId_provider: { organisationId: sub.organisationId, provider: "MOCK" } },
      select: { providerCustomerId: true },
    });
    if (!customer) return null;
    return {
      subscriptionRef,
      customerRef: customer.providerCustomerId,
      planKey: sub.plan.key,
      interval: sub.billingInterval,
      status: sub.status,
      startedAt: sub.startedAt,
      trialStartsAt: sub.trialStartsAt,
      trialEndsAt: sub.trialEndsAt,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      accessEndsAt: sub.status === "CANCELLED" ? sub.expiresAt : null,
      cancelledAt: sub.cancelledAt,
      pastDueSince: sub.pastDueSince,
      graceEndsAt: sub.graceEndsAt,
      endedAt: sub.endedAt,
    };
  }

  private async current(subscriptionRef: string): Promise<ProviderSubscriptionSnapshot> {
    const snapshot = await this.getSubscription(subscriptionRef);
    if (!snapshot) throw new Error("unknown mock subscription");
    return snapshot;
  }

  async changeSubscription(input: {
    subscriptionRef: string;
    planKey: string;
    interval?: BillingInterval | null;
  }): Promise<ProviderSubscriptionSnapshot> {
    const current = await this.current(input.subscriptionRef);
    return { ...current, planKey: input.planKey, interval: input.interval ?? current.interval };
  }

  async cancelSubscription(input: {
    subscriptionRef: string;
    atPeriodEnd: boolean;
  }): Promise<ProviderSubscriptionSnapshot> {
    const current = await this.current(input.subscriptionRef);
    const now = new Date();
    if (!input.atPeriodEnd) return { ...current, status: "EXPIRED", endedAt: now };
    const accessEndsAt =
      current.status === "TRIAL"
        ? current.trialEndsAt
        : (current.currentPeriodEnd ?? new Date(now.getTime() + periodLength(current.interval)));
    return { ...current, status: "CANCELLED", cancelledAt: now, accessEndsAt };
  }

  async reactivateSubscription(input: {
    subscriptionRef: string;
  }): Promise<ProviderSubscriptionSnapshot> {
    const current = await this.current(input.subscriptionRef);
    return { ...current, status: "ACTIVE", cancelledAt: null, accessEndsAt: null };
  }
}
