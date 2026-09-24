import "server-only";
import type { Prisma, TenantTx } from "@storevia/database";
import { systemDb } from "@storevia/database/system";
import { createLogger, errorFields, recordMetric } from "@storevia/observability";
import { isDomainError } from "@storevia/types";
import { notifyEntitlementsChanged } from "./events";
import {
  WebhookPayloadError,
  WebhookVerificationError,
  type BillingProvider,
  type NormalisedBillingEvent,
} from "./provider";
import { getBillingProvider } from "./registry";
import { canTransition } from "./state-machine";
import {
  applySubscriptionChange,
  assertStateInvariants,
  lockLiveSubscription,
  lockSubscription,
  stateOf,
  type BillingProviderKey,
  type SubscriptionState,
} from "./subscriptions";

// The billing webhook pipeline (docs 05 §4, ADR-0022 §6). Identical for every
// provider: verify → parse → ledger (idempotency) → apply through the
// Subscription Service under a per-subscription lock. Nothing else changes
// subscription state from provider input.

const log = createLogger({ component: "billing.webhooks" });

export type IngestOutcome =
  "processed" | "duplicate" | "ignored" | "rejected" | "failed" | "not_found";

export interface IngestResult {
  /** HTTP status for the provider (2xx = don't retry, 5xx = retry). */
  readonly status: number;
  readonly outcome: IngestOutcome;
  /** Machine-readable reason (never secrets or payload values). */
  readonly detail?: string;
  readonly eventId?: string;
  readonly organisationId?: string;
}

interface Processed {
  readonly outcome: "processed" | "ignored" | "duplicate";
  readonly detail?: string;
  readonly organisationId?: string;
}

const HTTP: Record<IngestOutcome, number> = {
  processed: 200,
  duplicate: 200,
  ignored: 200,
  rejected: 400,
  failed: 500,
  not_found: 404,
};

function result(
  outcome: IngestOutcome,
  extra: Omit<IngestResult, "status" | "outcome"> = {},
): IngestResult {
  recordMetric("billing.webhook", 1, {
    outcome,
    ...(extra.detail ? { detail: extra.detail } : {}),
  });
  return { status: HTTP[outcome], outcome, ...extra };
}

/** Maps a provider snapshot onto Storevia's subscription columns. */
function stateFromSnapshot(event: NormalisedBillingEvent, planId: string): SubscriptionState {
  const s = event.snapshot;
  return {
    planId,
    status: s.status,
    billingInterval: s.interval,
    startedAt: s.startedAt,
    trialStartsAt: s.trialStartsAt,
    trialEndsAt: s.trialEndsAt,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    expiresAt: s.status === "CANCELLED" ? s.accessEndsAt : null,
    cancelledAt: s.status === "CANCELLED" ? (s.cancelledAt ?? event.occurredAt) : null,
    pastDueSince: s.status === "PAST_DUE" ? (s.pastDueSince ?? event.occurredAt) : null,
    graceEndsAt: s.status === "PAST_DUE" ? s.graceEndsAt : null,
    endedAt: s.status === "EXPIRED" ? (s.endedAt ?? event.occurredAt) : null,
  };
}

const sourceOf = (provider: BillingProviderKey) =>
  provider === "MOCK" ? "MOCK" : "PAYMENT_PROVIDER";

async function finish(
  tx: TenantTx,
  event: NormalisedBillingEvent,
  status: "PROCESSED" | "IGNORED",
  outcome: string | null,
  organisationId: string | null,
): Promise<void> {
  await tx.billingWebhookEvent.update({
    where: {
      provider_providerEventId: { provider: event.provider, providerEventId: event.eventId },
    },
    data: {
      status,
      outcome,
      organisationId,
      attempts: { increment: 1 },
      processedAt: new Date(),
      lastError: null,
    },
    select: { id: true },
  });
}

async function apply(
  tx: TenantTx,
  event: NormalisedBillingEvent,
  requestId: string | undefined,
): Promise<Processed> {
  // Exactly-once: the ledger row is locked; a concurrent delivery of the same
  // event waits here and then sees it processed.
  const ledger = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM "BillingWebhookEvent"
    WHERE provider = ${event.provider}::"BillingProviderKey" AND "providerEventId" = ${event.eventId}
    FOR UPDATE`;
  const ledgerStatus = ledger[0]?.status;
  if (ledgerStatus === "PROCESSED" || ledgerStatus === "IGNORED") return { outcome: "duplicate" };

  // Serialise everything that touches this provider subscription.
  const lockKey = `billing:${event.provider}:${event.snapshot.subscriptionRef}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

  const ignore = async (
    detail: string,
    organisationId: string | null = null,
  ): Promise<Processed> => {
    await finish(tx, event, "IGNORED", detail, organisationId);
    log.warn("billing webhook ignored", {
      provider: event.provider,
      eventId: event.eventId,
      eventType: event.type,
      detail,
      organisationId,
    });
    return { outcome: "ignored", detail, ...(organisationId ? { organisationId } : {}) };
  };

  const customer = await tx.billingCustomer.findUnique({
    where: {
      provider_providerCustomerId: {
        provider: event.provider,
        providerCustomerId: event.snapshot.customerRef,
      },
    },
    select: { organisationId: true },
  });
  if (!customer) return ignore("unknown_subscription");
  const organisationId = customer.organisationId;

  const existing = await lockSubscription(tx, {
    provider: event.provider,
    providerSubscriptionId: event.snapshot.subscriptionRef,
  });
  if (existing && existing.organisationId !== organisationId)
    return ignore("customer_mismatch", organisationId);
  if (existing?.providerSyncedAt && event.snapshotVersion < existing.providerSyncedAt)
    return ignore("stale", organisationId);

  const plan = await tx.plan.findUnique({
    where: { key: event.snapshot.planKey },
    select: { id: true, key: true },
  });
  if (!plan) return ignore("unknown_plan", organisationId);
  const next = stateFromSnapshot(event, plan.id);
  // Validate before any write, so an invalid snapshot never half-applies
  // (e.g. superseding the live subscription and then failing).
  try {
    assertStateInvariants(next);
  } catch (error) {
    if (isDomainError(error)) return ignore("invalid_state", organisationId);
    throw error;
  }
  const actor = { type: "SYSTEM" as const, request: requestId ? { requestId } : {} };
  const common = {
    organisationId,
    next,
    providerSyncedAt: event.snapshotVersion,
    eventType: event.type,
    auditAction: "billing.subscription.synced",
    actor,
    reason: `${event.provider.toLowerCase()} event ${event.type}`,
    providerEventId: event.eventId,
    occurredAt: event.occurredAt,
  };

  if (!existing) {
    if (next.status === "EXPIRED") return ignore("unknown_subscription", organisationId);
    if (!canTransition(null, next.status)) return ignore("illegal_transition", organisationId);
    // A new provider subscription supersedes whatever is live (e.g. a
    // manual trial converting to a paid subscription). ADR-0022 §1.
    const live = await lockLiveSubscription(tx, organisationId);
    if (live) {
      const livePlan = await tx.plan.findUniqueOrThrow({
        where: { id: live.planId },
        select: { key: true },
      });
      await applySubscriptionChange(tx, {
        organisationId,
        current: live,
        next: { ...stateOf(live), status: "EXPIRED", endedAt: event.occurredAt },
        eventType: "superseded",
        auditAction: "billing.subscription.superseded",
        actor,
        reason: `Replaced by a ${event.provider.toLowerCase()} subscription`,
        providerEventId: event.eventId,
        occurredAt: event.occurredAt,
        planKeys: { before: livePlan.key, after: livePlan.key },
      });
    }
    await applySubscriptionChange(tx, {
      ...common,
      current: null,
      origin: {
        source: sourceOf(event.provider),
        provider: event.provider,
        providerSubscriptionId: event.snapshot.subscriptionRef,
      },
      planKeys: { before: null, after: plan.key },
    });
  } else {
    if (!canTransition(existing.status, next.status))
      return ignore("illegal_transition", organisationId);
    const before = await tx.plan.findUniqueOrThrow({
      where: { id: existing.planId },
      select: { key: true },
    });
    await applySubscriptionChange(tx, {
      ...common,
      current: existing,
      planKeys: { before: before.key, after: plan.key },
    });
  }

  await finish(tx, event, "PROCESSED", null, organisationId);
  return { outcome: "processed", organisationId };
}

/**
 * Entry point for every billing webhook delivery (HTTP route handler, and
 * the mock simulator in-process). `rawBody` must be the exact bytes received.
 */
export async function ingestBillingWebhook(
  providerKey: string,
  rawBody: string,
  headers: Headers,
  options: { readonly now?: Date; readonly requestId?: string } = {},
): Promise<IngestResult> {
  const provider: BillingProvider | null = getBillingProvider(providerKey);
  if (!provider) return result("not_found");

  try {
    provider.verifyWebhook(rawBody, headers, options.now);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      log.warn("billing webhook rejected", {
        provider: provider.key,
        detail: error.reason,
        requestId: options.requestId,
      });
      return result("rejected", { detail: error.reason });
    }
    throw error;
  }

  let event: NormalisedBillingEvent;
  try {
    event = provider.parseWebhookEvent(rawBody);
  } catch (error) {
    if (error instanceof WebhookPayloadError) {
      log.warn("billing webhook rejected", {
        provider: provider.key,
        detail: "invalid_payload",
        requestId: options.requestId,
      });
      return result("rejected", { detail: "invalid_payload" });
    }
    throw error;
  }

  const db = systemDb();
  await db.billingWebhookEvent.createMany({
    data: [
      {
        provider: event.provider,
        providerEventId: event.eventId,
        type: event.type,
        payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });

  try {
    const processed = await db.$transaction((tx) => apply(tx, event, options.requestId), {
      timeout: 15_000,
    });
    if (processed.outcome === "processed" && processed.organisationId) {
      await notifyEntitlementsChanged(processed.organisationId);
      log.info("billing webhook processed", {
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.type,
        organisationId: processed.organisationId,
        requestId: options.requestId,
      });
    }
    return result(processed.outcome, {
      eventId: event.eventId,
      ...(processed.detail ? { detail: processed.detail } : {}),
      ...(processed.organisationId ? { organisationId: processed.organisationId } : {}),
    });
  } catch (error) {
    const fields = errorFields(error);
    await db.billingWebhookEvent.update({
      where: {
        provider_providerEventId: { provider: event.provider, providerEventId: event.eventId },
      },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError: [fields["errorName"], fields["errorCode"]]
          .filter(Boolean)
          .join(":")
          .slice(0, 200),
      },
      select: { id: true },
    });
    log.error("billing webhook failed", {
      provider: event.provider,
      eventId: event.eventId,
      requestId: options.requestId,
      error,
    });
    return result("failed", { eventId: event.eventId, detail: "processing_error" });
  }
}
