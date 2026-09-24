import "server-only";
import { billingDb } from "@storevia/database/billing";
import { isEntitling } from "@storevia/entitlements";
import { createLogger } from "@storevia/observability";
import { notifyEntitlementsChanged } from "./events";
import { applySubscriptionChange, lockSubscription, stateOf } from "./subscriptions";

const log = createLogger({ component: "billing.sweep" });

/**
 * Moves MANUAL subscriptions whose entitlement has ended (trial over, grace
 * over, access end or fixed expiry reached) to EXPIRED through the
 * Subscription Service, so history and audit are complete. Entitlements
 * already stopped at that moment (the rule is time-aware); this only records
 * it. Provider-managed subscriptions expire through provider events.
 * Run by `pnpm billing:sweep` (cron) until the worker exists (M3).
 */
export async function sweepSubscriptionExpiry(
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const db = billingDb();
  const due = await db.subscription.findMany({
    where: {
      source: "MANUAL",
      OR: [
        { status: "TRIAL", trialEndsAt: { lte: now } },
        { status: "ACTIVE", expiresAt: { lte: now } },
        { status: "PAST_DUE", graceEndsAt: { lte: now } },
        { status: "CANCELLED", expiresAt: { lte: now } },
      ],
    },
    select: { id: true, organisationId: true },
    take: 500,
  });
  let expired = 0;
  for (const { id, organisationId } of due) {
    const changed = await db.$transaction(async (tx) => {
      const current = await lockSubscription(tx, { id });
      if (!current || current.status === "EXPIRED" || isEntitling(current, now)) return false;
      const plan = await tx.plan.findUniqueOrThrow({
        where: { id: current.planId },
        select: { key: true },
      });
      await applySubscriptionChange(tx, {
        organisationId,
        current,
        next: { ...stateOf(current), status: "EXPIRED", endedAt: now },
        eventType: "expired",
        auditAction: "billing.subscription.expired",
        actor: { type: "SYSTEM" },
        reason: "Scheduled expiry",
        occurredAt: now,
        planKeys: { before: plan.key, after: plan.key },
      });
      return true;
    });
    if (changed) {
      expired += 1;
      await notifyEntitlementsChanged(organisationId);
    }
  }
  log.info("subscription expiry sweep", { expired, due: due.length });
  return { expired };
}
