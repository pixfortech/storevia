// Subscription state machine (docs/architecture/05 §2.2, ADR-0022 §3).
// Source-independent: manual assignment, the mock provider and real providers
// are all held to the same transitions. Client-safe (no server imports).

export const SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Legal next statuses. Same-status entries allow updates (renewal, plan change). */
export const TRANSITIONS: Readonly<
  Record<SubscriptionStatus | "NONE", readonly SubscriptionStatus[]>
> = {
  NONE: ["TRIAL", "ACTIVE"],
  TRIAL: ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"],
  ACTIVE: ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"],
  PAST_DUE: ["PAST_DUE", "ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: ["CANCELLED", "ACTIVE", "EXPIRED"],
  EXPIRED: [],
};

export function canTransition(from: SubscriptionStatus | null, to: SubscriptionStatus): boolean {
  return TRANSITIONS[from ?? "NONE"].includes(to);
}

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};
