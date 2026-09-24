// Database-layer guarantees of the billing migration (ADR-0022): merchants
// can't write subscriptions or overrides, RLS isolates billing rows, CHECKs
// tie source/provider and status/dates together, and entitlement values must
// fit the feature type.
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectTestClients, migratorDb, truncateAll } from "../src/testing";

const A = {
  user: "0190f2a4-0000-7000-8000-00000000100a",
  org: "0190f2a4-0000-7000-8000-0000000010a1",
};
const B = {
  user: "0190f2a4-0000-7000-8000-00000000100b",
  org: "0190f2a4-0000-7000-8000-0000000010b1",
};

const clients: Record<"app" | "platform" | "system" | "billing", pg.Client> = {} as never;
let starter: string;
let storeCount: string;
let customDomain: string;
let analytics: string;
let subA: string;

type Row = Record<string, unknown>;

async function inTx<T>(c: pg.Client, fn: (c: pg.Client) => Promise<T>, org?: string): Promise<T> {
  await c.query("BEGIN");
  try {
    await c.query("SELECT set_config('app.organisation_id', $1, true)", [org ?? ""]);
    return await fn(c);
  } finally {
    await c.query("ROLLBACK");
  }
}

async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toThrow(pattern);
}

const insertSubscription = (
  c: pg.Client,
  values: Partial<Record<string, unknown>> & { organisationId: string },
) => {
  const row: Record<string, unknown> = {
    id: crypto.randomUUID(),
    planId: starter,
    status: "ACTIVE",
    source: "MANUAL",
    startedAt: new Date(),
    updatedAt: new Date(),
    ...values,
  };
  const cols = Object.keys(row);
  return c.query(
    `INSERT INTO "Subscription" (${cols.map((k) => `"${k}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
    Object.values(row),
  );
};

beforeAll(async () => {
  for (const role of ["app", "platform", "system", "billing"] as const) {
    const url = {
      app: "DATABASE_URL",
      platform: "DATABASE_PLATFORM_URL",
      system: "DATABASE_SYSTEM_URL",
      billing: "DATABASE_BILLING_URL",
    }[role];
    clients[role] = new pg.Client({ connectionString: process.env[url] });
    await clients[role].connect();
  }
  const db = migratorDb();
  starter = (await db.plan.findUniqueOrThrow({ where: { key: "starter" } })).id;
  const features = await db.feature.findMany({ select: { id: true, key: true } });
  const byKey = new Map(features.map((f) => [f.key, f.id]));
  storeCount = byKey.get("store_count") ?? "";
  customDomain = byKey.get("custom_domain") ?? "";
  analytics = byKey.get("analytics") ?? "";
});

beforeEach(async () => {
  await truncateAll();
  const db = migratorDb();
  for (const t of [A, B]) {
    await db.user.create({ data: { id: t.user, email: `${t.user}@example.test`, name: "U" } });
    await db.organisation.create({ data: { id: t.org, name: "Org" } });
    await db.membership.create({ data: { organisationId: t.org, userId: t.user, role: "OWNER" } });
  }
  subA = (
    await db.subscription.create({
      data: {
        organisationId: A.org,
        planId: starter,
        status: "ACTIVE",
        source: "MANUAL",
        startedAt: new Date(),
      },
    })
  ).id;
  await db.subscription.create({
    data: {
      organisationId: B.org,
      planId: starter,
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
    },
  });
  await db.subscriptionEvent.create({
    data: {
      subscriptionId: subA,
      organisationId: A.org,
      type: "assigned",
      source: "MANUAL",
      actorType: "PLATFORM_STAFF",
      occurredAt: new Date(),
      reason: "Pilot contract",
    },
  });
  await db.organisationFeatureOverride.create({
    data: {
      organisationId: A.org,
      featureId: customDomain,
      enabled: true,
      reason: "Pilot needs its domain",
    },
  });
});

afterAll(async () => {
  await Promise.all(Object.values(clients).map((c) => c.end()));
  await disconnectTestClients();
});

describe("merchant (app role) access", () => {
  it("reads only its own organisation's subscription", async () => {
    const rows = await inTx(
      clients.app,
      async (c) => (await c.query<Row>(`SELECT "organisationId" FROM "Subscription"`)).rows,
      A.org,
    );
    expect(rows).toEqual([{ organisationId: A.org }]);
  });

  it("sees no subscriptions without an organisation context", async () => {
    const rows = await inTx(
      clients.app,
      async (c) => (await c.query<Row>(`SELECT id FROM "Subscription"`)).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("cannot create, change or delete a subscription, even its own", async () => {
    await expectDbError(
      inTx(
        clients.app,
        (c) =>
          insertSubscription(c, { organisationId: A.org, status: "EXPIRED", endedAt: new Date() }),
        A.org,
      ),
      /permission denied/,
    );
    await expectDbError(
      inTx(clients.app, (c) => c.query(`UPDATE "Subscription" SET "planId" = "planId"`), A.org),
      /permission denied/,
    );
    await expectDbError(
      inTx(clients.app, (c) => c.query(`DELETE FROM "Subscription"`), A.org),
      /permission denied/,
    );
  });

  it("cannot read or write subscription events", async () => {
    await expectDbError(
      inTx(clients.app, (c) => c.query(`SELECT id FROM "SubscriptionEvent"`), A.org),
      /permission denied/,
    );
  });

  it("cannot create or change entitlement overrides, nor read staff reasons", async () => {
    await expectDbError(
      inTx(
        clients.app,
        (c) =>
          c.query(
            `INSERT INTO "OrganisationFeatureOverride" (id, "organisationId", "featureId", enabled, reason, "updatedAt") VALUES (gen_random_uuid(), $1, $2, true, 'self-service', now())`,
            [A.org, storeCount],
          ),
        A.org,
      ),
      /permission denied/,
    );
    await expectDbError(
      inTx(
        clients.app,
        (c) => c.query(`UPDATE "OrganisationFeatureOverride" SET enabled = false`),
        A.org,
      ),
      /permission denied/,
    );
    await expectDbError(
      inTx(clients.app, (c) => c.query(`SELECT reason FROM "OrganisationFeatureOverride"`), A.org),
      /permission denied/,
    );
    const rows = await inTx(
      clients.app,
      async (c) => (await c.query<Row>(`SELECT enabled FROM "OrganisationFeatureOverride"`)).rows,
      A.org,
    );
    expect(rows).toEqual([{ enabled: true }]);
  });

  it("cannot change the plan catalogue", async () => {
    await expectDbError(
      inTx(clients.app, (c) => c.query(`UPDATE "PlanFeature" SET unlimited = true WHERE false`)),
      /permission denied/,
    );
    await expectDbError(
      inTx(clients.app, (c) => c.query(`UPDATE "Feature" SET "defaultLimit" = 100 WHERE false`)),
      /permission denied/,
    );
  });

  it("maintains only its own usage counters", async () => {
    await expectDbError(
      inTx(
        clients.app,
        (c) =>
          c.query(
            `INSERT INTO "UsageCounter" ("organisationId", "featureId", value, "updatedAt") VALUES ($1, $2, 0, now())`,
            [B.org, storeCount],
          ),
        A.org,
      ),
      /row-level security/,
    );
    await inTx(
      clients.app,
      async (c) => {
        await c.query(
          `INSERT INTO "UsageCounter" ("organisationId", "featureId", value, "updatedAt") VALUES ($1, $2, 1, now())`,
          [A.org, storeCount],
        );
        await expect(
          c.query(`UPDATE "UsageCounter" SET value = -1 WHERE "organisationId" = $1`, [A.org]),
        ).rejects.toThrow(/UsageCounter_value_non_negative/);
      },
      A.org,
    );
  });
});

describe("platform and system roles", () => {
  it("platform can write subscriptions but never their owner or source columns", async () => {
    await expectDbError(
      inTx(clients.platform, (c) =>
        c.query(`UPDATE "Subscription" SET source = 'MOCK' WHERE id = $1`, [subA]),
      ),
      /permission denied/,
    );
    await expectDbError(
      inTx(clients.platform, (c) =>
        c.query(`UPDATE "Subscription" SET "organisationId" = $1 WHERE id = $2`, [B.org, subA]),
      ),
      /permission denied/,
    );
    await inTx(clients.platform, (c) =>
      c.query(`UPDATE "Subscription" SET "billingInterval" = 'YEAR' WHERE id = $1`, [subA]),
    );
  });

  it("subscription events are append-only for every runtime role", async () => {
    for (const role of ["platform", "system"] as const) {
      await expectDbError(
        inTx(clients[role], (c) => c.query(`UPDATE "SubscriptionEvent" SET reason = 'x'`)),
        /permission denied/,
      );
      await expectDbError(
        inTx(clients[role], (c) => c.query(`DELETE FROM "SubscriptionEvent"`)),
        /permission denied/,
      );
    }
  });

  it("the system role (shared with the dashboard's auth path) can't read or write billing state", async () => {
    await expectDbError(
      inTx(clients.system, (c) => c.query(`SELECT id FROM "Subscription"`)),
      /permission denied/,
    );
    await expectDbError(
      inTx(clients.system, (c) =>
        c.query(`UPDATE "Subscription" SET status = 'ACTIVE' WHERE id = $1`, [subA]),
      ),
      /permission denied/,
    );
    await expectDbError(
      inTx(clients.system, (c) => c.query(`SELECT id FROM "BillingWebhookEvent"`)),
      /permission denied/,
    );
  });

  it("the billing role is limited to billing tables", async () => {
    await inTx(clients.billing, (c) =>
      c.query(`UPDATE "Subscription" SET "billingInterval" = 'YEAR' WHERE id = $1`, [subA]),
    );
    for (const sql of [
      `SELECT id FROM "User"`,
      `SELECT id FROM "Membership"`,
      `SELECT id FROM "Store"`,
      `SELECT id FROM "Session"`,
      `SELECT id FROM "OrganisationFeatureOverride"`,
      `UPDATE "Subscription" SET source = 'MOCK'`,
      `UPDATE "Subscription" SET "organisationId" = "organisationId"`,
      `UPDATE "SubscriptionEvent" SET reason = 'x'`,
      `UPDATE "UsageCounter" SET value = 0`,
    ]) {
      await expectDbError(
        inTx(clients.billing, (c) => c.query(sql)),
        /permission denied/,
      );
    }
  });

  it("the system role cannot touch overrides", async () => {
    await expectDbError(
      inTx(clients.system, (c) => c.query(`SELECT id FROM "OrganisationFeatureOverride"`)),
      /permission denied/,
    );
  });
});

describe("subscription constraints", () => {
  const db = () => clients.platform;

  it("allows at most one live subscription per organisation", async () => {
    await expectDbError(
      inTx(db(), (c) => insertSubscription(c, { organisationId: A.org })),
      /Subscription_one_live_per_organisation/,
    );
    // Expired history rows are unlimited.
    await inTx(db(), async (c) => {
      await insertSubscription(c, {
        organisationId: A.org,
        status: "EXPIRED",
        endedAt: new Date(),
      });
      await insertSubscription(c, {
        organisationId: A.org,
        status: "EXPIRED",
        endedAt: new Date(),
      });
    });
  });

  it("ties the source to the provider columns", async () => {
    const cases: Record<string, unknown>[] = [
      { source: "MANUAL", provider: "STRIPE", providerSubscriptionId: "sub_1" },
      { source: "MOCK" },
      { source: "MOCK", provider: "STRIPE", providerSubscriptionId: "x" },
      { source: "PAYMENT_PROVIDER", provider: "MOCK", providerSubscriptionId: "x" },
      { source: "PAYMENT_PROVIDER", provider: "RAZORPAY" },
    ];
    for (const values of cases) {
      await expectDbError(
        inTx(db(), (c) =>
          insertSubscription(c, {
            organisationId: A.org,
            status: "EXPIRED",
            endedAt: new Date(),
            ...values,
          }),
        ),
        /Subscription_source_provider/,
      );
    }
  });

  it("requires the dates each status depends on", async () => {
    const base = { organisationId: A.org };
    await expectDbError(
      inTx(db(), (c) => insertSubscription(c, { ...base, status: "EXPIRED" })),
      /Subscription_expired_dates/,
    );
    await inTx(db(), async (c) => {
      await c.query(
        `UPDATE "Subscription" SET status = 'EXPIRED', "endedAt" = now() WHERE id = $1`,
        [subA],
      );
      await expect(insertSubscription(c, { ...base, status: "TRIAL" })).rejects.toThrow(
        /Subscription_trial_dates/,
      );
    });
    await inTx(db(), async (c) => {
      await c.query(
        `UPDATE "Subscription" SET status = 'EXPIRED', "endedAt" = now() WHERE id = $1`,
        [subA],
      );
      await expect(
        insertSubscription(c, { ...base, status: "PAST_DUE", pastDueSince: new Date() }),
      ).rejects.toThrow(/Subscription_past_due_dates/);
    });
    await expectDbError(
      inTx(db(), (c) =>
        c.query(
          `UPDATE "Subscription" SET status = 'CANCELLED', "cancelledAt" = now() WHERE id = $1`,
          [subA],
        ),
      ),
      /Subscription_cancelled_dates/,
    );
  });
});

describe("entitlement values must fit the feature type", () => {
  const override = (featureId: string, cols: string, values: unknown[]) =>
    inTx(clients.platform, (c) =>
      c.query(
        `INSERT INTO "OrganisationFeatureOverride" (id, "organisationId", "featureId", reason, "updatedAt", ${cols})
         VALUES (gen_random_uuid(), $1, $2, 'test case', now(), ${values.map((_, i) => `$${String(i + 3)}`).join(", ")})`,
        [B.org, featureId, ...values],
      ),
    );

  it("rejects malformed values", async () => {
    await expectDbError(override(customDomain, 'enabled, "limit"', [true, 5]), /BOOLEAN/);
    await expectDbError(
      override(storeCount, "enabled", [true]),
      /exactly one of limit or unlimited/,
    );
    await expectDbError(
      override(storeCount, 'enabled, "limit", unlimited', [true, 5, true]),
      /exactly one/,
    );
    await expectDbError(override(storeCount, 'enabled, "limit"', [true, -1]), />= 0/);
    await expectDbError(override(storeCount, 'enabled, "limit"', [false, 3]), /disabled LIMIT/);
    await expectDbError(override(analytics, "enabled", [true]), /JSON object/);
    await expectDbError(override(analytics, "enabled, config", [true, "[1]"]), /JSON object/);
  });

  it("accepts well-formed values", async () => {
    await override(storeCount, "enabled, unlimited", [true, true]);
    await override(storeCount, 'enabled, "limit"', [true, 0]);
    await override(analytics, "enabled, config", [true, '{"retentionDays": 90}']);
    await override(customDomain, "enabled", [false]);
  });

  it("requires a reason", async () => {
    await expectDbError(
      inTx(clients.platform, (c) =>
        c.query(
          `INSERT INTO "OrganisationFeatureOverride" (id, "organisationId", "featureId", enabled, reason, "updatedAt") VALUES (gen_random_uuid(), $1, $2, true, ' ', now())`,
          [B.org, customDomain],
        ),
      ),
      /reason_length/,
    );
  });

  it("validates the seeded plans and system defaults", async () => {
    const db = migratorDb();
    await expect(
      db.feature.update({ where: { key: "store_count" }, data: { defaultLimit: null } }),
    ).rejects.toThrow(/exactly one of limit or unlimited/);
  });
});
