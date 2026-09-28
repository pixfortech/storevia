import "server-only";
import { sweepSubscriptionExpiry } from "@storevia/billing";
import {
  purgeExpiredCheckouts,
  sweepExpiredCheckouts,
  sweepExpiredPayments,
} from "@storevia/commerce/checkout";
import { sendOrderNotifications } from "@storevia/commerce/notifications";
import { notifyStaffOfCustomerMessages } from "@storevia/commerce/order-messages";
import { getEmailSender } from "@storevia/email";
import { workerDb } from "@storevia/database/worker";
import { reconcileUsage } from "@storevia/entitlements";
import type { JobDefinition } from "@storevia/jobs";
import { recordMetric } from "@storevia/observability";
import { MEMBER_ROLES, recordActorAudit } from "@storevia/tenancy";
import { domainVerifyJob } from "./domains";
import { mediaSweepJob } from "./media";
import { operationsMetricsJob } from "./ops";
import { outboxDispatchJob } from "./outbox";

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

/**
 * Payment attempts past their window (the provider is asked first: a late
 * capture still becomes an order), then open checkouts past their expiry
 * (ADR-0031 §1, §4).
 */
export const checkoutExpiryJob: JobDefinition = {
  name: "checkout.expiry",
  schedule: { everySeconds: 60 },
  maxAttempts: 2,
  timeoutMs: 4 * 60_000,
  async run() {
    const payments = await sweepExpiredPayments();
    const checkouts = await sweepExpiredCheckouts();
    return { ...payments, expiredCheckouts: checkouts };
  },
};

/** Expired checkouts lose contact details after the retention window (ADR-0031 §6). */
export const checkoutPurgeJob: JobDefinition = {
  name: "checkout.purge",
  schedule: { everySeconds: 3600 },
  maxAttempts: 3,
  timeoutMs: 10 * 60_000,
  async run() {
    return { purged: await purgeExpiredCheckouts() };
  },
};

/** Order emails from the notification queue; failures retry with backoff (ADR-0031 §12). */
export const orderNotificationsJob: JobDefinition = {
  name: "orders.notifications",
  schedule: { everySeconds: 30 },
  maxAttempts: 2,
  timeoutMs: 4 * 60_000,
  async run() {
    // The transport is resolved only when there is an email to send, so an
    // environment without one (e.g. integration tests) still runs the job.
    return { ...(await sendOrderNotifications({ send: (m) => getEmailSender().send(m) })) };
  },
};

/**
 * Tells the staff allowed to answer (order.message, with access to the
 * store) that a shopper wrote about an order: in-app notifications, never
 * on the shopper's request path.
 */
export const orderMessageNotificationsJob: JobDefinition = {
  name: "orders.message-notifications",
  schedule: { everySeconds: 15 },
  maxAttempts: 3,
  timeoutMs: 60_000,
  async run() {
    return { ...(await notifyStaffOfCustomerMessages(MEMBER_ROLES)) };
  },
};

export const JOBS: readonly JobDefinition[] = [
  checkoutExpiryJob,
  checkoutPurgeJob,
  orderNotificationsJob,
  orderMessageNotificationsJob,
  subscriptionExpiryJob,
  usageReconciliationJob,
  outboxDispatchJob,
  domainVerifyJob,
  mediaSweepJob,
  operationsMetricsJob,
];
