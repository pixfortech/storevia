// Scheduler guarantees against PostgreSQL with the worker role (ADR-0023).
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Scheduler, type JobDefinition } from "../src";

const T0 = new Date("2026-09-24T10:00:00Z");
const everyFiveMinutes = { everySeconds: 300 };

function clock(start: Date) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    set: (d: Date) => {
      t = d.getTime();
    },
  };
}

function job(overrides: Partial<JobDefinition> & { run: JobDefinition["run"] }): JobDefinition {
  return { name: "test.job", schedule: everyFiveMinutes, maxAttempts: 3, ...overrides };
}

const row = () => migratorDb().scheduledJob.findUniqueOrThrow({ where: { name: "test.job" } });
const runs = () => migratorDb().jobRun.findMany({ orderBy: [{ slot: "asc" }, { attempt: "asc" }] });

beforeEach(truncateAll);
afterAll(disconnectTestClients);

describe("scheduling", () => {
  it("registers at the next aligned slot and keeps the slot on re-registration", async () => {
    const c = clock(new Date("2026-09-24T10:01:00Z"));
    const s = new Scheduler({ workerId: "w1", now: c.now });
    await s.register([job({ run: () => Promise.resolve(undefined) })]);
    expect((await row()).slot).toEqual(new Date("2026-09-24T10:05:00Z"));
    c.set(new Date("2026-09-24T10:03:00Z"));
    await new Scheduler({ workerId: "w2", now: c.now }).register([
      job({ run: () => Promise.resolve(undefined) }),
    ]);
    expect((await row()).slot).toEqual(new Date("2026-09-24T10:05:00Z"));
  });

  it("runs a due slot once, records it and advances to the next slot", async () => {
    const c = clock(T0);
    let calls = 0;
    const s = new Scheduler({ workerId: "w1", now: c.now });
    await s.register([
      job({
        run: () => {
          calls += 1;
          return Promise.resolve({ expired: 2 });
        },
      }),
    ]);
    expect(await s.runDue()).toBe(1); // T0 is itself a slot
    expect(await s.runDue()).toBe(0); // not due again
    expect(calls).toBe(1);
    expect(await row()).toMatchObject({
      slot: new Date("2026-09-24T10:05:00Z"),
      attempt: 0,
      lockedBy: null,
      lastStatus: "SUCCEEDED",
    });
    expect(await runs()).toEqual([
      expect.objectContaining({
        slot: T0,
        attempt: 1,
        status: "SUCCEEDED",
        result: { expired: 2 },
      }),
    ]);
  });

  it("skips missed slots after downtime instead of replaying each one", async () => {
    const c = clock(T0);
    let calls = 0;
    const s = new Scheduler({ workerId: "w1", now: c.now });
    await s.register([
      job({
        run: () => {
          calls += 1;
          return Promise.resolve(undefined);
        },
      }),
    ]);
    c.set(new Date("2026-09-24T12:02:00Z")); // two hours later
    expect(await s.runDue()).toBe(1);
    expect(await s.runDue()).toBe(0);
    expect(calls).toBe(1);
    expect((await row()).slot).toEqual(new Date("2026-09-24T12:05:00Z"));
  });
});

describe("concurrency and leases", () => {
  it("concurrent workers run a due slot exactly once", async () => {
    const c = clock(T0);
    let calls = 0;
    const definition = job({
      run: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 200));
        return undefined;
      },
    });
    const workers = ["w1", "w2", "w3", "w4"].map(
      (id) => new Scheduler({ workerId: id, now: c.now }),
    );
    for (const w of workers) await w.register([definition]);
    await Promise.all(workers.map((w) => w.runDue()));
    expect(calls).toBe(1);
    expect(await runs()).toHaveLength(1);
  });

  it("a crashed worker's slot is taken over after its lease expires", async () => {
    const c = clock(T0);
    const slots: string[] = [];
    const definition = job({
      run: ({ slot, attempt }) => {
        slots.push(`${slot.toISOString()}#${String(attempt)}`);
        return Promise.resolve(undefined);
      },
    });
    const s = new Scheduler({ workerId: "survivor", now: c.now, leaseMs: 60_000 });
    await s.register([definition]);
    // Another worker claimed the slot and died holding the lease.
    await migratorDb().scheduledJob.update({
      where: { name: "test.job" },
      data: { lockedBy: "crashed", lockedUntil: new Date(T0.getTime() + 60_000), attempt: 1 },
    });
    expect(await s.runDue()).toBe(0); // lease still held
    c.set(new Date(T0.getTime() + 61_000));
    expect(await s.runDue()).toBe(1);
    expect(slots).toEqual([`${T0.toISOString()}#2`]); // same slot, next attempt
  });

  it("a running job keeps its lease with heartbeats", async () => {
    const definition = job({
      run: async () => {
        await new Promise((r) => setTimeout(r, 2_500));
        return undefined;
      },
    });
    const a = new Scheduler({ workerId: "a", leaseMs: 1_500 });
    const b = new Scheduler({ workerId: "b", leaseMs: 1_500 });
    await a.register([definition]);
    await b.register([definition]);
    await migratorDb().scheduledJob.update({
      where: { name: "test.job" },
      data: { nextRunAt: new Date(Date.now() - 1000), slot: new Date(Date.now() - 1000) },
    });
    const running = a.runDue();
    await new Promise((r) => setTimeout(r, 2_000)); // past the original lease
    expect(await b.runDue()).toBe(0);
    await running;
    expect(await runs()).toHaveLength(1);
  });
});

describe("failures", () => {
  it("retries with backoff, then moves on to the next slot; errors carry no messages", async () => {
    const c = clock(T0);
    const s = new Scheduler({ workerId: "w1", now: c.now });
    await s.register([
      job({
        maxAttempts: 3,
        run: () => Promise.reject(new TypeError("secret value from input")),
      }),
    ]);
    await s.runDue();
    expect(await row()).toMatchObject({
      slot: T0,
      attempt: 1,
      nextRunAt: new Date(T0.getTime() + 30_000),
      consecutiveFailures: 1,
      lastStatus: "FAILED",
    });
    c.set(new Date(T0.getTime() + 30_000));
    await s.runDue();
    c.set(new Date(T0.getTime() + 30_000 + 60_000));
    await s.runDue();
    expect(await row()).toMatchObject({
      slot: new Date("2026-09-24T10:05:00Z"),
      attempt: 0,
      consecutiveFailures: 3,
    });
    const history = await runs();
    expect(history.map((r) => [r.attempt, r.status])).toEqual([
      [1, "FAILED"],
      [2, "FAILED"],
      [3, "FAILED"],
    ]);
    expect(history.every((r) => r.error === "TypeError")).toBe(true);
  });

  it("a success after failures resets the failure count", async () => {
    const c = clock(T0);
    let fail = true;
    const s = new Scheduler({ workerId: "w1", now: c.now });
    await s.register([
      job({
        run: () => (fail ? Promise.reject(new Error("x")) : Promise.resolve(undefined)),
      }),
    ]);
    await s.runDue();
    fail = false;
    c.set(new Date(T0.getTime() + 30_000));
    await s.runDue();
    expect(await row()).toMatchObject({
      consecutiveFailures: 0,
      lastStatus: "SUCCEEDED",
      attempt: 0,
    });
  });
});
