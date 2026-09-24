import "server-only";
import { randomUUID } from "node:crypto";
import { platformDb } from "@storevia/database/platform";
import { parsePublicId, recordActorAudit } from "@storevia/tenancy";
import {
  hasPlatformPermission,
  requirePlatformPermission,
  requirePlatformStepUp,
  type PlatformContext,
} from "@storevia/tenancy/platform";
import { fieldErrors } from "@storevia/validation";
import { DomainError, notFound } from "@storevia/types";
import { z } from "zod";
import { MOCK_GRACE_DAYS, periodLength, toWire, type MockBillingProvider } from "./mock-provider";
import type { BillingEventType, ProviderSubscriptionSnapshot } from "./provider";
import { getMockProvider } from "./registry";
import { ingestBillingWebhook, type IngestResult } from "./webhooks";

// Mock billing simulation (docs 05 §6). Staff pick an event; the mock
// provider builds and signs it; it is delivered to the same webhook pipeline
// a real provider uses. The simulator never writes subscription or
// entitlement state itself. Unavailable (404) wherever the mock is disabled.

export const LIFECYCLE_SIMULATIONS = [
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
] as const satisfies readonly BillingEventType[];

export const FAULT_SIMULATIONS = [
  "duplicate",
  "replayed",
  "out_of_order",
  "invalid_signature",
  "invalid_schema",
  "unknown_subscription",
] as const;

export type Simulation =
  (typeof LIFECYCLE_SIMULATIONS)[number] | (typeof FAULT_SIMULATIONS)[number];

export const simulationSchema = z.object({
  organisationId: z.string(),
  kind: z.enum([...LIFECYCLE_SIMULATIONS, ...FAULT_SIMULATIONS]),
  planKey: z.string().max(40).optional(),
  billingInterval: z.enum(["MONTH", "YEAR"]).default("MONTH"),
  trialDays: z.coerce.number().int().min(0).max(90).default(0),
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason (at least 3 characters).")
    .max(500, "Keep the reason under 500 characters."),
});

export interface SimulationResult extends IngestResult {
  readonly kind: Simulation;
}

const DAY = 24 * 3600 * 1000;

/** The next provider-side snapshot for a lifecycle event. */
export function nextSnapshot(
  current: ProviderSubscriptionSnapshot,
  kind: Exclude<(typeof LIFECYCLE_SIMULATIONS)[number], "created">,
  now: Date,
  planKey?: string,
): ProviderSubscriptionSnapshot {
  const period = periodLength(current.interval);
  switch (kind) {
    case "activated":
      return {
        ...current,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + period),
      };
    case "renewed": {
      const start = current.currentPeriodEnd ?? now;
      return {
        ...current,
        status: "ACTIVE",
        currentPeriodStart: start,
        currentPeriodEnd: new Date(start.getTime() + period),
      };
    }
    case "upgraded":
    case "downgraded":
      if (!planKey)
        throw new DomainError("VALIDATION_FAILED", "Choose a plan.", { planKey: "Choose a plan." });
      return { ...current, planKey };
    case "past_due":
      return {
        ...current,
        status: "PAST_DUE",
        pastDueSince: now,
        graceEndsAt: new Date(now.getTime() + MOCK_GRACE_DAYS * DAY),
      };
    case "payment_recovered":
      return {
        ...current,
        status: "ACTIVE",
        pastDueSince: null,
        graceEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + period),
      };
    case "cancelled":
      return {
        ...current,
        status: "CANCELLED",
        cancelledAt: now,
        accessEndsAt:
          current.status === "TRIAL"
            ? current.trialEndsAt
            : (current.currentPeriodEnd ?? new Date(now.getTime() + period)),
      };
    case "reactivated":
      return { ...current, status: "ACTIVE", cancelledAt: null, accessEndsAt: null };
    case "expired":
      return { ...current, status: "EXPIRED", endedAt: now };
  }
}

async function deliver(
  mock: MockBillingProvider,
  payload: unknown,
  requestId: string | undefined,
  options: { timestamp?: number; tamper?: boolean } = {},
): Promise<IngestResult> {
  const { rawBody, headers } = mock.deliver(payload, options.timestamp);
  if (options.tamper) headers.set("storevia-mock-signature", mock.sign(`${rawBody} `));
  return ingestBillingWebhook("MOCK", rawBody, headers, requestId ? { requestId } : {});
}

async function liveMockSubscription(organisationId: string) {
  const sub = await platformDb().subscription.findFirst({
    where: { organisationId, status: { not: "EXPIRED" }, source: "MOCK" },
    select: { providerSubscriptionId: true, providerSyncedAt: true },
  });
  if (!sub?.providerSubscriptionId) {
    throw new DomainError(
      "CONFLICT",
      "This organisation has no live mock subscription. Simulate “created” first.",
    );
  }
  return { ref: sub.providerSubscriptionId, syncedAt: sub.providerSyncedAt };
}

async function lastDelivery(organisationId: string) {
  const row = await platformDb().billingWebhookEvent.findFirst({
    where: { organisationId, provider: "MOCK" },
    orderBy: { receivedAt: "desc" },
    select: { payload: true },
  });
  if (!row)
    throw new DomainError(
      "CONFLICT",
      "No mock event has been delivered for this organisation yet.",
    );
  return row.payload;
}

/** Builds, signs and delivers one simulated provider event. */
export async function simulateMockBillingEvent(
  ctx: PlatformContext,
  input: unknown,
): Promise<SimulationResult> {
  requirePlatformPermission(ctx, "platform.billing.simulate");
  const mock = getMockProvider();
  if (!mock) throw notFound(); // never available in production
  // Simulated events change real subscription state: same bar as manual changes.
  requirePlatformStepUp(ctx);
  const parsed = simulationSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }
  const data = parsed.data;
  if (["created", "upgraded", "downgraded"].includes(data.kind)) {
    const plan = data.planKey
      ? await platformDb().plan.findUnique({
          where: { key: data.planKey },
          select: { status: true },
        })
      : null;
    if (plan?.status !== "ACTIVE")
      throw new DomainError("VALIDATION_FAILED", "Choose an available plan.", {
        planKey: "Choose an available plan.",
      });
  }
  const organisationId = parsePublicId("organisation", data.organisationId);
  const org = await platformDb().organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, status: true },
  });
  if (!org || org.status === "DELETED") throw notFound();
  const now = new Date();
  const requestId = ctx.request.requestId;
  let outcome: IngestResult;

  // Who triggered the simulation is recorded before anything is delivered,
  // so a state change can never exist without its staff attribution.
  await platformDb().$transaction(async (tx) => {
    await recordActorAudit(tx, {
      organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: "billing.simulation.requested",
      entity: { type: "Organisation", id: organisationId },
      metadata: { eventType: data.kind, plan: data.planKey ?? null, reason: data.reason },
      request: ctx.request,
    });
  });

  switch (data.kind) {
    case "created": {
      const plan = data.planKey
        ? await platformDb().plan.findUnique({
            where: { key: data.planKey },
            select: { key: true, status: true },
          })
        : null;
      if (!plan)
        throw new DomainError("VALIDATION_FAILED", "Choose a plan.", { planKey: "Choose a plan." });
      const live = await platformDb().subscription.findFirst({
        where: { organisationId, status: { not: "EXPIRED" }, source: "MOCK" },
        select: { id: true },
      });
      if (live)
        throw new DomainError(
          "CONFLICT",
          "This organisation already has a live mock subscription.",
        );
      // A new provider subscription supersedes a live manual contract; only
      // staff who may manage subscriptions can cause that.
      const manual = await platformDb().subscription.findFirst({
        where: { organisationId, status: { not: "EXPIRED" }, source: { not: "MOCK" } },
        select: { id: true },
      });
      if (manual && !hasPlatformPermission(ctx, "platform.subscription.manage"))
        throw new DomainError(
          "FORBIDDEN",
          "This organisation has a live manual subscription. Ask billing staff to expire it first.",
        );
      // The provider-side customer, recorded on our side (as a checkout would).
      let customer = await platformDb().billingCustomer.findUnique({
        where: { organisationId_provider: { organisationId, provider: "MOCK" } },
        select: { providerCustomerId: true },
      });
      if (!customer) {
        const { customerRef } = await mock.createCustomer({ organisationId, name: org.name });
        customer = await platformDb().billingCustomer.create({
          data: { organisationId, provider: "MOCK", providerCustomerId: customerRef },
          select: { providerCustomerId: true },
        });
      }
      const snapshot = await mock.createSubscription({
        customerRef: customer.providerCustomerId,
        planKey: plan.key,
        interval: data.billingInterval,
        trialDays: data.trialDays,
      });
      outcome = await deliver(mock, toWire(mock.newEventId(), "created", now, snapshot), requestId);
      break;
    }
    case "duplicate":
      outcome = await deliver(mock, await lastDelivery(organisationId), requestId);
      break;
    case "replayed":
      // A captured delivery re-sent later: its signature timestamp is stale.
      outcome = await deliver(mock, await lastDelivery(organisationId), requestId, {
        timestamp: Math.floor(now.getTime() / 1000) - 10 * 60,
      });
      break;
    case "out_of_order": {
      const { ref, syncedAt } = await liveMockSubscription(organisationId);
      const current = await mock.getSubscription(ref);
      if (!current) throw notFound();
      // An older event (e.g. a past_due that was delayed) arriving late.
      const older = new Date((syncedAt ?? now).getTime() - 60_000);
      outcome = await deliver(
        mock,
        toWire(mock.newEventId(), "past_due", older, nextSnapshot(current, "past_due", older)),
        requestId,
      );
      break;
    }
    case "invalid_signature": {
      const { ref } = await liveMockSubscription(organisationId);
      const current = await mock.getSubscription(ref);
      if (!current) throw notFound();
      outcome = await deliver(
        mock,
        toWire(mock.newEventId(), "expired", now, nextSnapshot(current, "expired", now)),
        requestId,
        { tamper: true },
      );
      break;
    }
    case "invalid_schema":
      outcome = await deliver(
        mock,
        {
          id: mock.newEventId(),
          type: "subscription.activated",
          created: now.toISOString(),
          data: {},
        },
        requestId,
      );
      break;
    case "unknown_subscription": {
      const snapshot = await mock.createSubscription({
        customerRef: `mock_cus_${randomUUID()}`,
        planKey: data.planKey ?? "unknown",
        interval: data.billingInterval,
        trialDays: 0,
      });
      outcome = await deliver(
        mock,
        toWire(mock.newEventId(), "activated", now, snapshot),
        requestId,
      );
      break;
    }
    default: {
      const { ref } = await liveMockSubscription(organisationId);
      const current = await mock.getSubscription(ref);
      if (!current) throw notFound();
      const snapshot = nextSnapshot(current, data.kind, now, data.planKey);
      outcome = await deliver(mock, toWire(mock.newEventId(), data.kind, now, snapshot), requestId);
    }
  }

  // What the pipeline did with it.
  await platformDb().$transaction(async (tx) => {
    await recordActorAudit(tx, {
      organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: "billing.simulation.delivered",
      entity: { type: "Organisation", id: organisationId },
      metadata: {
        eventType: data.kind,
        status: outcome.outcome,
        value: outcome.detail ?? null,
        ...(outcome.eventId ? { providerEventId: outcome.eventId } : {}),
      },
      request: ctx.request,
    });
  });
  return { ...outcome, kind: data.kind };
}
