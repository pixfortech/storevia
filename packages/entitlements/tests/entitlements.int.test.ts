// Entitlement engine against PostgreSQL: FeatureKey parity, resolution with
// real rows, atomic usage consumption under concurrency and RLS scoping.
// Subscriptions are arranged as rows (fixtures); the engine under test is the
// production code path.
import { withTenant, type TenantScope } from "@storevia/database";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { isDomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  consumeUsage,
  FEATURE_KEYS,
  getFeatureLimit,
  getUsage,
  getUsageSummary,
  hasFeature,
  assertFeature,
  canConsume,
  loadEntitlements,
  reconcileUsage,
  releaseUsage,
} from "../src/index";

const ORG_A = "0190f2a4-0000-7000-8000-0000000020a1";
const ORG_B = "0190f2a4-0000-7000-8000-0000000020b1";
const scope = (organisationId: string): TenantScope => ({
  organisationId,
  storeId: null,
  userId: null,
});
const DAY = 24 * 3600 * 1000;

async function planId(key: string): Promise<string> {
  return (await migratorDb().plan.findUniqueOrThrow({ where: { key } })).id;
}
async function featureId(key: string): Promise<string> {
  return (await migratorDb().feature.findUniqueOrThrow({ where: { key } })).id;
}

async function subscribe(
  organisationId: string,
  plan: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const row = await migratorDb().subscription.create({
    data: {
      organisationId,
      planId: await planId(plan),
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
      ...fields,
    },
  });
  return row.id;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(isDomainError(error) ? error.code : error).toBe(code);
}

beforeEach(async () => {
  await truncateAll();
  await migratorDb().organisation.createMany({
    data: [
      { id: ORG_A, name: "A" },
      { id: ORG_B, name: "B" },
    ],
  });
});

afterAll(disconnectTestClients);

describe("reference data", () => {
  it("FeatureKey matches the Feature rows exactly", async () => {
    const rows = await migratorDb().feature.findMany({ select: { key: true } });
    expect(rows.map((r) => r.key).sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("every seeded plan defines every feature", async () => {
    const plans = await migratorDb().plan.findMany({ include: { features: true } });
    expect(plans.length).toBeGreaterThanOrEqual(3);
    for (const plan of plans) expect(plan.features).toHaveLength(FEATURE_KEYS.length);
  });
});

describe("resolution", () => {
  it("an organisation without a subscription gets the system defaults", async () => {
    const set = await withTenant(scope(ORG_A), (tx) => loadEntitlements(tx, ORG_A));
    expect(set.subscription).toBeNull();
    expect(set.get("store_count")).toMatchObject({
      origin: "DEFAULT",
      value: { kind: "LIMIT", limit: 1n },
    });
    expect(set.get("staff_accounts").value).toEqual({ kind: "LIMIT", limit: 1n });
    expect(set.get("custom_domain").value).toEqual({ kind: "BOOLEAN", enabled: false });
  });

  it("an entitling subscription grants its plan", async () => {
    await subscribe(ORG_A, "business");
    const set = await withTenant(scope(ORG_A), (tx) => loadEntitlements(tx, ORG_A));
    expect(set.subscription).toMatchObject({
      status: "ACTIVE",
      source: "MANUAL",
      entitling: true,
      planName: "Business",
    });
    expect(set.get("store_count")).toMatchObject({
      origin: "PLAN",
      value: { kind: "LIMIT", limit: 3n },
    });
    expect(set.get("product_limit").value).toEqual({ kind: "UNLIMITED" });
    expect(set.get("analytics").value).toEqual({
      kind: "CONFIGURATION",
      enabled: true,
      config: { retentionDays: 365 },
    });
  });

  it("the source does not change what a status means", async () => {
    await subscribe(ORG_A, "business", {
      source: "MOCK",
      provider: "MOCK",
      providerSubscriptionId: "mock_sub_1",
    });
    await subscribe(ORG_B, "business");
    for (const org of [ORG_A, ORG_B]) {
      expect(await withTenant(scope(org), (tx) => getFeatureLimit(tx, org, "store_count"))).toBe(
        3n,
      );
    }
  });

  it("an ended trial, lapsed grace or past access end falls back to defaults", async () => {
    const past = new Date(Date.now() - DAY);
    const cases = [
      { status: "TRIAL", trialEndsAt: past },
      { status: "PAST_DUE", pastDueSince: new Date(Date.now() - 20 * DAY), graceEndsAt: past },
      { status: "CANCELLED", cancelledAt: past, expiresAt: past },
      { status: "ACTIVE", expiresAt: past },
    ];
    for (const fields of cases) {
      await truncateAll();
      await migratorDb().organisation.create({ data: { id: ORG_A, name: "A" } });
      await subscribe(ORG_A, "business", fields);
      const set = await withTenant(scope(ORG_A), (tx) => loadEntitlements(tx, ORG_A));
      expect(set.subscription?.entitling, fields.status).toBe(false);
      expect(set.get("store_count").origin, fields.status).toBe("DEFAULT");
    }
  });

  it("override > plan > default, overrides expire and can be removed", async () => {
    await subscribe(ORG_A, "starter");
    const db = migratorDb();
    const override = await db.organisationFeatureOverride.create({
      data: {
        organisationId: ORG_A,
        featureId: await featureId("store_count"),
        enabled: true,
        limit: 25n,
        reason: "Enterprise pilot",
      },
    });
    const limit = () => withTenant(scope(ORG_A), (tx) => getFeatureLimit(tx, ORG_A, "store_count"));
    expect(await limit()).toBe(25n);

    await db.organisationFeatureOverride.update({
      where: { id: override.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await limit()).toBe(1n); // Starter again

    await db.organisationFeatureOverride.update({
      where: { id: override.id },
      data: { expiresAt: null, limit: null, unlimited: true },
    });
    expect(await limit()).toBe("unlimited");

    await db.organisationFeatureOverride.delete({ where: { id: override.id } });
    expect(await limit()).toBe(1n);
  });

  it("an override applies even without a subscription, and can disable features", async () => {
    await subscribe(ORG_B, "business");
    const db = migratorDb();
    await db.organisationFeatureOverride.create({
      data: {
        organisationId: ORG_A,
        featureId: await featureId("custom_domain"),
        enabled: true,
        reason: "Pilot",
      },
    });
    await db.organisationFeatureOverride.create({
      data: {
        organisationId: ORG_B,
        featureId: await featureId("api_access"),
        enabled: false,
        reason: "Abuse hold",
      },
    });
    expect(await withTenant(scope(ORG_A), (tx) => hasFeature(tx, ORG_A, "custom_domain"))).toBe(
      true,
    );
    await expectCode(
      withTenant(scope(ORG_B), (tx) => assertFeature(tx, ORG_B, "api_access")),
      "ENTITLEMENT_REQUIRED",
    );
    await withTenant(scope(ORG_B), (tx) => assertFeature(tx, ORG_B, "webhooks"));
  });

  it("an organisation's scope cannot resolve another organisation's plan", async () => {
    await subscribe(ORG_B, "enterprise");
    // A forged organisationId inside Org A's RLS scope sees no subscription or
    // overrides of Org B, so it resolves to defaults, never to B's plan.
    const limit = await withTenant(scope(ORG_A), (tx) => getFeatureLimit(tx, ORG_B, "store_count"));
    expect(limit).toBe(1n);
  });
});

describe("usage consumption", () => {
  it("consumes up to the limit and then throws LIMIT_REACHED", async () => {
    await subscribe(ORG_A, "starter"); // staff_accounts = 2
    await withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "staff_accounts"));
    await withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "staff_accounts"));
    expect(await withTenant(scope(ORG_A), (tx) => canConsume(tx, ORG_A, "staff_accounts"))).toBe(
      false,
    );
    await expectCode(
      withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "staff_accounts")),
      "LIMIT_REACHED",
    );
    expect(await withTenant(scope(ORG_A), (tx) => getUsage(tx, ORG_A, "staff_accounts"))).toBe(2n);
  });

  it("a failed transaction does not keep its consumption", async () => {
    await expect(
      withTenant(scope(ORG_A), async (tx) => {
        await consumeUsage(tx, ORG_A, "store_count");
        throw new Error("resource creation failed");
      }),
    ).rejects.toThrow("resource creation failed");
    expect(await withTenant(scope(ORG_A), (tx) => getUsage(tx, ORG_A, "store_count"))).toBe(0n);
  });

  it("N concurrent consumers against a limit L succeed exactly L times", async () => {
    await subscribe(ORG_A, "business"); // store_count = 3
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "store_count")),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect(isDomainError(r.reason) && r.reason.code).toBe("LIMIT_REACHED");
    }
    expect(await withTenant(scope(ORG_A), (tx) => getUsage(tx, ORG_A, "store_count"))).toBe(3n);
  });

  it("cannot consume or read another organisation's counters (RLS)", async () => {
    await expect(
      withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_B, "store_count")),
    ).rejects.toThrow(/row-level security/);
    await withTenant(scope(ORG_B), (tx) => consumeUsage(tx, ORG_B, "store_count"));
    expect(await withTenant(scope(ORG_A), (tx) => getUsage(tx, ORG_B, "store_count"))).toBe(0n);
  });

  it("release frees capacity and never goes below zero", async () => {
    await withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "store_count"));
    await withTenant(scope(ORG_A), (tx) => releaseUsage(tx, ORG_A, "store_count", { amount: 5n }));
    expect(await withTenant(scope(ORG_A), (tx) => getUsage(tx, ORG_A, "store_count"))).toBe(0n);
    await withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "store_count"));
  });

  it("a downgrade marks over-limit, keeps usage and blocks new consumption", async () => {
    const sub = await subscribe(ORG_A, "business");
    for (let i = 0; i < 3; i++)
      await withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "store_count"));
    await migratorDb().subscription.update({
      where: { id: sub },
      data: { planId: await planId("starter") },
    });
    const summary = await withTenant(scope(ORG_A), (tx) => getUsageSummary(tx, ORG_A));
    expect(summary.find((l) => l.key === "store_count")).toMatchObject({
      usage: 3n,
      limit: 1n,
      overLimit: true,
    });
    await expectCode(
      withTenant(scope(ORG_A), (tx) => consumeUsage(tx, ORG_A, "store_count")),
      "LIMIT_REACHED",
    );
  });

  it("reconcileUsage corrects drift from the source tables", async () => {
    const db = migratorDb();
    const user = await db.user.create({ data: { email: "owner@example.test", name: "Owner" } });
    await db.membership.create({ data: { organisationId: ORG_A, userId: user.id, role: "OWNER" } });
    const drift = await withTenant(scope(ORG_A), (tx) => reconcileUsage(tx, ORG_A));
    expect(drift).toEqual([{ key: "staff_accounts", recorded: 0n, actual: 1n }]);
    expect(await withTenant(scope(ORG_A), (tx) => reconcileUsage(tx, ORG_A))).toEqual([]);
  });
});
