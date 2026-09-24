// Provider-neutral billing abstraction (docs 05 §3, ADR-0022 §6). Real
// providers (Razorpay, Stripe) are future adapters implementing this
// interface; nothing outside an adapter knows provider formats.
import type { SubscriptionStatus } from "./state-machine";
import type { BillingInterval, BillingProviderKey } from "./subscriptions";

/** A provider's view of a subscription, in Storevia's vocabulary. */
export interface ProviderSubscriptionSnapshot {
  readonly subscriptionRef: string;
  readonly customerRef: string;
  readonly planKey: string;
  readonly interval: BillingInterval | null;
  readonly status: SubscriptionStatus;
  readonly startedAt: Date;
  readonly trialStartsAt: Date | null;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  /** Access end of a cancelled subscription. */
  readonly accessEndsAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly pastDueSince: Date | null;
  readonly graceEndsAt: Date | null;
  readonly endedAt: Date | null;
}

export const BILLING_EVENT_TYPES = [
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
] as const;

export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

export interface NormalisedBillingEvent {
  readonly provider: BillingProviderKey;
  readonly eventId: string;
  readonly type: BillingEventType;
  readonly occurredAt: Date;
  readonly snapshot: ProviderSubscriptionSnapshot;
  /**
   * Monotonic version of the snapshot: the event time for providers that push
   * snapshots, the fetch time for adapters that re-fetch. Older versions than
   * the last applied one are ignored (out-of-order delivery converges).
   */
  readonly snapshotVersion: Date;
}

export type CheckoutResult =
  | { readonly kind: "redirect"; readonly url: string }
  /** No hosted checkout exists (mock provider): nothing to show a merchant. */
  | { readonly kind: "unavailable" };

export class WebhookVerificationError extends Error {
  constructor(readonly reason: "missing_signature" | "invalid_signature" | "stale_signature") {
    super(reason);
    this.name = "WebhookVerificationError";
  }
}

export class WebhookPayloadError extends Error {
  constructor() {
    super("invalid_payload");
    this.name = "WebhookPayloadError";
  }
}

export interface BillingProvider {
  readonly key: BillingProviderKey;
  createCustomer(input: {
    readonly organisationId: string;
    readonly name: string;
  }): Promise<{ readonly customerRef: string }>;
  createCheckout(input: {
    readonly customerRef: string;
    readonly planKey: string;
    readonly interval: BillingInterval;
    readonly returnUrl: string;
  }): Promise<CheckoutResult>;
  createSubscription(input: {
    readonly customerRef: string;
    readonly planKey: string;
    readonly interval: BillingInterval | null;
    readonly trialDays: number;
  }): Promise<ProviderSubscriptionSnapshot>;
  changeSubscription(input: {
    readonly subscriptionRef: string;
    readonly planKey: string;
    readonly interval?: BillingInterval | null;
  }): Promise<ProviderSubscriptionSnapshot>;
  cancelSubscription(input: {
    readonly subscriptionRef: string;
    readonly atPeriodEnd: boolean;
  }): Promise<ProviderSubscriptionSnapshot>;
  reactivateSubscription(input: {
    readonly subscriptionRef: string;
  }): Promise<ProviderSubscriptionSnapshot>;
  getSubscription(subscriptionRef: string): Promise<ProviderSubscriptionSnapshot | null>;
  /**
   * Throws WebhookVerificationError. Verifies the exact bytes received, never
   * decoded or re-serialised text.
   */
  verifyWebhook(rawBody: Uint8Array, headers: Headers, now?: Date): void;
  /** Throws WebhookPayloadError (including bodies that aren't valid UTF-8). */
  parseWebhookEvent(rawBody: Uint8Array): NormalisedBillingEvent;
}
