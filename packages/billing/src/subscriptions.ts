import "server-only";
import type { TenantTx } from "@storevia/database";
import { recordActorAudit, type AuditMetadata, type RequestInfo } from "@storevia/tenancy";
import { DomainError } from "@storevia/types";
import { canTransition, type SubscriptionStatus } from "./state-machine";

/**
 * The Subscription Service (ADR-0022 §0): the only code that writes
 * Subscription rows. Manual staff actions, mock provider events, real
 * provider events (later) and the expiry sweep all call
 * applySubscriptionChange, which enforces the state machine and the status
 * invariants, appends a SubscriptionEvent and an AuditLog row in the same
 * transaction, and never looks at where the change came from to decide what
 * a status means.
 */

export type SubscriptionSource = "MANUAL" | "MOCK" | "PAYMENT_PROVIDER";
export type BillingProviderKey = "MOCK" | "RAZORPAY" | "STRIPE";
export type BillingInterval = "MONTH" | "YEAR";

/** Every mutable column of a subscription. */
export interface SubscriptionState {
  readonly planId: string;
  readonly status: SubscriptionStatus;
  readonly billingInterval: BillingInterval | null;
  readonly startedAt: Date;
  readonly trialStartsAt: Date | null;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly expiresAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly pastDueSince: Date | null;
  readonly graceEndsAt: Date | null;
  readonly endedAt: Date | null;
}

export interface StoredSubscription extends SubscriptionState {
  readonly id: string;
  readonly organisationId: string;
  readonly source: SubscriptionSource;
  readonly provider: BillingProviderKey | null;
  readonly providerSubscriptionId: string | null;
  readonly providerSyncedAt: Date | null;
}

/** Who made a change. Recorded on the event and the audit row. */
export type ChangeActor =
  | { readonly type: "PLATFORM_STAFF"; readonly userId: string; readonly request: RequestInfo }
  | { readonly type: "SYSTEM"; readonly request?: RequestInfo };

export interface SubscriptionChange {
  readonly organisationId: string;
  /** null creates a new subscription (from "no live subscription"). */
  readonly current: StoredSubscription | null;
  /** Required when creating. Immutable afterwards (DB column grants). */
  readonly origin?: {
    readonly source: SubscriptionSource;
    readonly provider: BillingProviderKey | null;
    readonly providerSubscriptionId: string | null;
  };
  readonly next: SubscriptionState;
  /** Version of the provider snapshot applied (provider sources only). */
  readonly providerSyncedAt?: Date;
  readonly eventType: string;
  readonly auditAction: string;
  readonly actor: ChangeActor;
  readonly reason?: string | undefined;
  readonly note?: string | undefined;
  readonly providerEventId?: string | undefined;
  readonly occurredAt: Date;
  /** Human-readable plan keys for the audit trail (never used for decisions). */
  readonly planKeys: { readonly before: string | null; readonly after: string };
  readonly extraAudit?: AuditMetadata;
}

export class IllegalTransitionError extends DomainError {
  constructor(from: SubscriptionStatus | null, to: SubscriptionStatus) {
    super("CONFLICT", `A subscription can't move from ${from ?? "nothing"} to ${to}.`);
  }
}

const subscriptionColumns = {
  id: true,
  organisationId: true,
  source: true,
  provider: true,
  providerSubscriptionId: true,
  providerSyncedAt: true,
  planId: true,
  status: true,
  billingInterval: true,
  startedAt: true,
  trialStartsAt: true,
  trialEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  expiresAt: true,
  cancelledAt: true,
  pastDueSince: true,
  graceEndsAt: true,
  endedAt: true,
} as const;

/** Loads a subscription and locks its row for the rest of the transaction. */
export async function lockSubscription(
  tx: TenantTx,
  where: { id: string } | { provider: BillingProviderKey; providerSubscriptionId: string },
): Promise<StoredSubscription | null> {
  const row =
    "id" in where
      ? await tx.subscription.findUnique({ where: { id: where.id }, select: { id: true } })
      : await tx.subscription.findUnique({
          where: {
            provider_providerSubscriptionId: {
              provider: where.provider,
              providerSubscriptionId: where.providerSubscriptionId,
            },
          },
          select: { id: true },
        });
  if (!row) return null;
  await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${row.id}::uuid FOR UPDATE`;
  return tx.subscription.findUnique({ where: { id: row.id }, select: subscriptionColumns });
}

/** The organisation's live subscription, locked (at most one exists). */
export async function lockLiveSubscription(
  tx: TenantTx,
  organisationId: string,
): Promise<StoredSubscription | null> {
  const row = await tx.subscription.findFirst({
    where: { organisationId, status: { not: "EXPIRED" } },
    select: { id: true },
  });
  return row ? lockSubscription(tx, { id: row.id }) : null;
}

const invalid = (message: string): DomainError => new DomainError("VALIDATION_FAILED", message);

/** Status invariants, checked before the database CHECKs so errors are friendly. */
export function assertStateInvariants(state: SubscriptionState): void {
  const { status } = state;
  if (status === "TRIAL" && !state.trialEndsAt) throw invalid("A trial needs an end date.");
  if (state.trialStartsAt && state.trialEndsAt && state.trialStartsAt >= state.trialEndsAt)
    throw invalid("The trial must end after it starts.");
  if (status === "PAST_DUE" && (!state.pastDueSince || !state.graceEndsAt))
    throw invalid("A past-due subscription needs a grace period.");
  if (status === "CANCELLED" && (!state.cancelledAt || !state.expiresAt))
    throw invalid("A cancelled subscription needs an access end date.");
  if (status === "EXPIRED" && !state.endedAt)
    throw invalid("An expired subscription needs an end date.");
  if (
    state.currentPeriodStart &&
    state.currentPeriodEnd &&
    state.currentPeriodStart >= state.currentPeriodEnd
  )
    throw invalid("The billing period must end after it starts.");
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export interface AppliedChange {
  readonly subscriptionId: string;
  readonly before: StoredSubscription | null;
  readonly after: SubscriptionState;
}

/**
 * Applies one change in the caller's transaction (platform or system
 * connection). The caller must hold the row lock (lockSubscription) when
 * `current` is set, and runs onEntitlementsChanged after commit.
 */
export async function applySubscriptionChange(
  tx: TenantTx,
  change: SubscriptionChange,
): Promise<AppliedChange> {
  const { current, next } = change;
  if (current && current.organisationId !== change.organisationId) {
    throw new Error("subscription belongs to another organisation");
  }
  if (!canTransition(current?.status ?? null, next.status)) {
    throw new IllegalTransitionError(current?.status ?? null, next.status);
  }
  assertStateInvariants(next);

  let subscriptionId: string;
  let source: SubscriptionSource;
  if (current) {
    subscriptionId = current.id;
    source = current.source;
    await tx.subscription.update({
      where: { id: current.id },
      data: {
        ...next,
        ...(change.providerSyncedAt ? { providerSyncedAt: change.providerSyncedAt } : {}),
      },
      select: { id: true },
    });
  } else {
    if (!change.origin) throw new Error("origin is required to create a subscription");
    source = change.origin.source;
    const created = await tx.subscription.create({
      data: {
        organisationId: change.organisationId,
        ...change.origin,
        ...next,
        providerSyncedAt: change.providerSyncedAt ?? null,
      },
      select: { id: true },
    });
    subscriptionId = created.id;
  }

  const actorId = change.actor.type === "PLATFORM_STAFF" ? change.actor.userId : null;
  const request = change.actor.request;
  await tx.subscriptionEvent.createMany({
    data: [
      {
        subscriptionId,
        organisationId: change.organisationId,
        type: change.eventType,
        source,
        fromStatus: current?.status ?? null,
        toStatus: next.status,
        fromPlanId: current?.planId ?? null,
        toPlanId: next.planId,
        actorType: change.actor.type,
        actorId,
        reason: change.reason ?? null,
        note: change.note ?? null,
        providerEventId: change.providerEventId ?? null,
        requestId: request?.requestId ?? null,
        occurredAt: change.occurredAt,
      },
    ],
  });

  await recordActorAudit(tx, {
    organisationId: change.organisationId,
    actorType: change.actor.type,
    actorId,
    action: change.auditAction,
    entity: { type: "Subscription", id: subscriptionId },
    metadata: {
      source,
      eventType: change.eventType,
      plan: change.planKeys.after,
      previousPlan: change.planKeys.before,
      status: next.status,
      previousStatus: current?.status ?? null,
      interval: next.billingInterval,
      previousInterval: current?.billingInterval ?? null,
      expiresAt: iso(next.expiresAt),
      previousExpiresAt: iso(current?.expiresAt ?? null),
      trialEndsAt: iso(next.trialEndsAt),
      ...(change.reason ? { reason: change.reason } : {}),
      ...(change.providerEventId ? { providerEventId: change.providerEventId } : {}),
      ...change.extraAudit,
    },
    ...(request ? { request } : {}),
  });

  return { subscriptionId, before: current, after: next };
}

/** The state of an existing subscription, as a base for the next change. */
export function stateOf(sub: StoredSubscription): SubscriptionState {
  return {
    planId: sub.planId,
    status: sub.status,
    billingInterval: sub.billingInterval,
    startedAt: sub.startedAt,
    trialStartsAt: sub.trialStartsAt,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    expiresAt: sub.expiresAt,
    cancelledAt: sub.cancelledAt,
    pastDueSince: sub.pastDueSince,
    graceEndsAt: sub.graceEndsAt,
    endedAt: sub.endedAt,
  };
}
