import "server-only";
import { sweepSubscriptionExpiry } from "@storevia/billing";
import { workerDb } from "@storevia/database/worker";
import { reconcileUsage } from "@storevia/entitlements";
import type { JobDefinition } from "@storevia/jobs";
import { recordMetric } from "@storevia/observability";
import { recordActorAudit } from "@storevia/tenancy";

// Job definitions (ADR-0023). Every handler is idempotent: a slot can run
// more than once after a retry or a lease takeover.

/** Expires MANUAL subscriptions whose term ended (billing role). */
export const subscriptionExpiryJob: JobDefinition = {
  name: "billing.subscription-expiry",
  schedule: { everySeconds: 300 },
  maxAttempts: 3,
  timeoutMs: 4 * 60_000,
  async run() {
    const { expired } = await sweepSubscriptionExpiry();
    return { expired };
  },
};

const BATCH = 200;

/**
 * Recomputes gauge counters (stores, team members) for every organisation
 * and corrects drift. Drift is logged, counted in a metric and audited as a
 * SYSTEM action, since it means some code path missed a counter update.
 */
export const usageReconciliationJob: JobDefinition = {
  name: "entitlements.usage-reconciliation",
  schedule: { everySeconds: 86_400, anchor: new Date("1970-01-01T03:00:00Z") },
  maxAttempts: 3,
  timeoutMs: 30 * 60_000,
  async run({ signal, log }) {
    const db = workerDb();
    let cursor: string | undefined;
    let organisations = 0;
    let corrected = 0;
    for (;;) {
      if (signal.aborted) throw new Error("aborted");
      const batch = await db.organisation.findMany({
        where: { status: { not: "DELETED" } },
        select: { id: true },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      for (const { id } of batch) {
        const drift = await db.$transaction(async (tx) => {
          const found = await reconcileUsage(tx, id);
          if (found.length > 0) {
            await recordActorAudit(tx, {
              organisationId: id,
              actorType: "SYSTEM",
              actorId: null,
              action: "billing.usage.reconciled",
              entity: { type: "Organisation", id },
              metadata: {
                drift: found
                  .map((d) => `${d.key}:${d.recorded.toString()}->${d.actual.toString()}`)
                  .join(","),
                reason: "Scheduled reconciliation",
              },
            });
          }
          return found;
        });
        organisations += 1;
        if (drift.length > 0) {
          corrected += drift.length;
          for (const d of drift) recordMetric("entitlements.usage_drift", 1, { feature: d.key });
          log.warn("usage drift corrected", {
            organisationId: id,
            drift: drift.map((d) => ({ key: d.key, recorded: d.recorded, actual: d.actual })),
          });
        }
      }
      cursor = batch.at(-1)?.id;
    }
    return { organisations, corrected };
  },
};

export const JOBS: readonly JobDefinition[] = [subscriptionExpiryJob, usageReconciliationJob];
