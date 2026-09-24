// The worker's jobs against PostgreSQL with the real worker and billing roles.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { Scheduler, Worker } from "@storevia/jobs";
import { createLogger } from "@storevia/observability";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { JOBS, subscriptionExpiryJob, usageReconciliationJob } from "../src/jobs";

const DAY = 24 * 3600 * 1000;
const ctx = {
  slot: new Date(),
  attempt: 1,
  signal: new AbortController().signal,
  log: createLogger({ test: "worker-jobs" }),
};

async function org(name: string): Promise<string> {
  return (await migratorDb().organisation.create({ data: { name } })).id;
}

async function user(): Promise<string> {
  return (
    await migratorDb().user.create({
      data: { email: `${crypto.randomUUID()}@example.test`, name: "U" },
    })
  ).id;
}

beforeEach(truncateAll);
afterAll(disconnectTestClients);

describe("usage reconciliation job", () => {
  it("corrects drift for every organisation, audits it as SYSTEM, and is idempotent", async () => {
    const db = migratorDb();
    const orgs = [await org("A"), await org("B"), await org("C")];
    const staff = await db.feature.findUniqueOrThrow({ where: { key: "staff_accounts" } });
    for (const id of orgs) {
      await db.membership.create({
        data: { organisationId: id, userId: await user(), role: "OWNER" },
      });
    }
    // Org A's counter drifted; B's is right; C has none yet.
    await db.usageCounter.create({
      data: { organisationId: orgs[0] ?? "", featureId: staff.id, value: 9n },
    });
    await db.usageCounter.create({
      data: { organisationId: orgs[1] ?? "", featureId: staff.id, value: 1n },
    });

    expect(await usageReconciliationJob.run(ctx)).toEqual({ organisations: 3, corrected: 1 });
    const counters = await db.usageCounter.findMany({ where: { featureId: staff.id } });
    expect(counters.map((c) => c.value)).toEqual([1n, 1n, 1n]);
    const audit = await db.auditLog.findMany({ where: { action: "billing.usage.reconciled" } });
    expect(audit).toEqual([
      expect.objectContaining({ organisationId: orgs[0], actorType: "SYSTEM", actorId: null }),
    ]);
    expect(await usageReconciliationJob.run(ctx)).toEqual({ organisations: 3, corrected: 0 });
  });

  it("walks organisations in batches", async () => {
    for (let i = 0; i < 205; i++) await org(`Org ${String(i)}`);
    expect(await usageReconciliationJob.run(ctx)).toMatchObject({ organisations: 205 });
  });
});

describe("subscription expiry job", () => {
  it("expires a due manual subscription once, whatever the number of runs", async () => {
    const db = migratorDb();
    const id = await org("Trial Co");
    const plan = await db.plan.findUniqueOrThrow({ where: { key: "starter" } });
    await db.subscription.create({
      data: {
        organisationId: id,
        planId: plan.id,
        status: "TRIAL",
        source: "MANUAL",
        startedAt: new Date(Date.now() - 20 * DAY),
        trialStartsAt: new Date(Date.now() - 20 * DAY),
        trialEndsAt: new Date(Date.now() - DAY),
      },
    });
    expect(await subscriptionExpiryJob.run(ctx)).toEqual({ expired: 1 });
    expect(await subscriptionExpiryJob.run(ctx)).toEqual({ expired: 0 });
    expect(
      await db.subscriptionEvent.count({ where: { type: "expired", actorType: "SYSTEM" } }),
    ).toBe(1);
  });
});

describe("scheduled through the worker", () => {
  it("registers the jobs, runs what is due, and stops gracefully", async () => {
    const scheduler = new Scheduler({ workerId: "test-worker" });
    await scheduler.register(JOBS);
    const rows = await migratorDb().scheduledJob.findMany({ orderBy: { name: "asc" } });
    expect(rows.map((r) => [r.name, r.intervalSeconds])).toEqual([
      ["billing.subscription-expiry", 300],
      ["entitlements.usage-reconciliation", 86_400],
    ]);
    // Nightly slots are aligned to 03:00 UTC.
    expect(rows[1]?.slot.toISOString()).toMatch(/T03:00:00\.000Z$/);

    await migratorDb().scheduledJob.updateMany({
      data: { nextRunAt: new Date(Date.now() - 1000) },
    });
    const worker = new Worker(scheduler, 50);
    expect(worker.health().status).toBe("starting");
    worker.start();
    await expect
      .poll(async () => migratorDb().jobRun.count({ where: { status: "SUCCEEDED" } }), {
        timeout: 10_000,
      })
      .toBe(2);
    expect(worker.health().status).toBe("ok");
    await worker.stop();
    expect(worker.health().status).toBe("stopping");
  });
});
