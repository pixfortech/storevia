// Subscription Service, manual staff operations, the webhook pipeline and
// mock billing (ADR-0022), against PostgreSQL with the real roles.
import { withTenant } from "@storevia/database";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { getFeatureLimit, loadEntitlements } from "@storevia/entitlements";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  type Principal,
} from "@storevia/tenancy";
import { requirePlatformStaff, type PlatformContext } from "@storevia/tenancy/platform";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activateSubscription,
  assignPlan,
  cancelSubscription,
  changeSubscription,
  expireSubscription,
  getMockProvider,
  ingestBillingWebhook,
  isMockBillingEnabled,
  onEntitlementsChanged,
  reconcileOrganisationUsage,
  removeEntitlementOverride,
  setEntitlementOverride,
  simulateMockBillingEvent,
  sweepSubscriptionExpiry,
  toWire,
  type Simulation,
  getJobsOverview,
} from "../src";

process.env["MOCK_BILLING_WEBHOOK_SECRET"] = "test-only-mock-billing-secret-0123456789abcdef";
process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";
process.env["EMAIL_TRANSPORT"] = "file";
process.env["EMAIL_FILE_DIR"] = "/tmp/storevia-billing-test-mail";

const DAY = 24 * 3600 * 1000;
const orgPublic = (id: string) => toTypeId("organisation", id);
const subPublic = (id: string) => toTypeId("subscription", id);

async function expectCode(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

async function makeUser(label: string): Promise<Principal> {
  const email = `${label}-${uuidv7().slice(-6)}@example.test`;
  const user = await migratorDb().user.create({
    data: { id: uuidv7(), email, name: `User ${label}`, emailVerified: true },
  });
  return {
    userId: user.id,
    email,
    name: user.name,
    emailVerified: true,
    recentlyAuthenticated: false,
  };
}

async function staff(
  role: "SUPER_ADMIN" | "BILLING" | "OPERATIONS" | "SUPPORT" | "READ_ONLY",
  opts: { stepUp?: boolean; active?: boolean } = {},
): Promise<PlatformContext> {
  const user = await makeUser(role.toLowerCase());
  await migratorDb().platformStaff.create({
    data: { userId: user.userId, role, active: opts.active ?? true },
  });
  return requirePlatformStaff(
    { ...user, recentlyAuthenticated: opts.stepUp ?? true },
    { requestId: `req-${role}`, ipAddress: "203.0.113.7", userAgent: "vitest" },
  );
}

let owner: Principal;
let orgId: string;
let admin: PlatformContext;

const limit = (key: "store_count" | "staff_accounts" = "store_count") =>
  withTenant({ organisationId: orgId, storeId: null, userId: null }, (tx) =>
    getFeatureLimit(tx, orgId, key),
  );

const live = () =>
  migratorDb().subscription.findFirst({
    where: { organisationId: orgId, status: { not: "EXPIRED" } },
  });

const assign = (overrides: Record<string, unknown> = {}, ctx: PlatformContext = admin) =>
  assignPlan(ctx, {
    organisationId: orgPublic(orgId),
    planKey: "business",
    status: "ACTIVE",
    billingInterval: "MONTH",
    reason: "Pilot contract signed",
    ...overrides,
  });

const simulate = (
  kind: Simulation,
  extra: Record<string, unknown> = {},
  ctx: PlatformContext = admin,
) =>
  simulateMockBillingEvent(ctx, {
    organisationId: orgPublic(orgId),
    kind,
    reason: "Simulation test",
    ...extra,
  });

function storeInput(slug: string) {
  return {
    name: slug,
    slug,
    currency: "INR",
    country: "IN",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  };
}

beforeEach(async () => {
  process.env["STOREVIA_ENV"] = "test";
  await truncateAll();
  owner = await makeUser("owner");
  ({ organisationId: orgId } = await createOrganisation(owner, { name: "Acme" }));
  admin = await staff("BILLING");
});

afterAll(disconnectTestClients);

describe("manual assignment (platform staff only)", () => {
  it("assigns a plan through the Subscription Service with event, audit and entitlements", async () => {
    expect(await limit()).toBe(1n); // system default
    const result = await assign({ note: "Signed by the CFO" });
    const sub = await live();
    expect(sub).toMatchObject({
      status: "ACTIVE",
      source: "MANUAL",
      provider: null,
      billingInterval: "MONTH",
    });
    expect(result.subscriptionId).toBe(sub?.id);
    expect(await limit()).toBe(3n);

    const events = await migratorDb().subscriptionEvent.findMany({
      where: { organisationId: orgId },
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "assigned",
        source: "MANUAL",
        fromStatus: null,
        toStatus: "ACTIVE",
        actorType: "PLATFORM_STAFF",
        actorId: admin.userId,
        reason: "Pilot contract signed",
        note: "Signed by the CFO",
        requestId: "req-BILLING",
      }),
    ]);
    const audit = await migratorDb().auditLog.findMany({
      where: { organisationId: orgId, action: "billing.subscription.assigned" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: "PLATFORM_STAFF",
      actorId: admin.userId,
      entityType: "Subscription",
      entityId: sub?.id,
      requestId: "req-BILLING",
      ipAddress: "203.0.113.7",
    });
    expect(audit[0]?.metadata).toMatchObject({
      plan: "business",
      previousPlan: null,
      status: "ACTIVE",
      reason: "Pilot contract signed",
    });
    // Internal notes stay out of the audit metadata.
    expect(JSON.stringify(audit[0]?.metadata)).not.toContain("CFO");
  });

  it("requires step-up authentication and writes nothing without it", async () => {
    const noStepUp = await staff("BILLING", { stepUp: false });
    await expectCode(assign({}, noStepUp), "REAUTHENTICATION_REQUIRED");
    await expectCode(
      setEntitlementOverride(noStepUp, {
        organisationId: orgPublic(orgId),
        featureKey: "store_count",
        mode: "unlimited",
        reason: "Contract",
      }),
      "REAUTHENTICATION_REQUIRED",
    );
    expect(await live()).toBeNull();
    expect(
      await migratorDb().auditLog.count({ where: { action: { startsWith: "billing." } } }),
    ).toBe(0);
  });

  it("requires a reason", async () => {
    await expectCode(assign({ reason: "" }), "VALIDATION_FAILED");
    await expectCode(assign({ reason: "  x " }), "VALIDATION_FAILED");
  });

  it("enforces the platform permission matrix", async () => {
    for (const role of ["SUPPORT", "READ_ONLY", "OPERATIONS"] as const) {
      const ctx = await staff(role);
      await expectCode(assign({}, ctx), "FORBIDDEN");
      await expectCode(
        setEntitlementOverride(ctx, {
          organisationId: orgPublic(orgId),
          featureKey: "custom_domain",
          mode: "enabled",
          reason: "Try",
        }),
        "FORBIDDEN",
      );
    }
    const superAdmin = await staff("SUPER_ADMIN");
    await assign({}, superAdmin);
    expect(await live()).not.toBeNull();
  });

  it("merchants, even owners, are not platform staff; inactive staff and forged contexts are rejected", async () => {
    await expectCode(requirePlatformStaff({ ...owner, recentlyAuthenticated: true }), "FORBIDDEN");
    await expectCode(staff("SUPER_ADMIN", { active: false }), "FORBIDDEN");
    await expectCode(requirePlatformStaff(null), "UNAUTHENTICATED");
    const forged = {
      kind: "platform",
      principal: { ...owner, recentlyAuthenticated: true },
      userId: owner.userId,
      role: "SUPER_ADMIN",
      permissions: new Set(["platform.subscription.manage"]),
      request: {},
    } as unknown as PlatformContext;
    await expect(assign({}, forged)).rejects.toThrow(/not issued/);
    expect(await live()).toBeNull();
  });

  it("allows only one live subscription", async () => {
    await assign();
    await expectCode(assign(), "CONFLICT");
  });

  it("starts a trial that entitles until it ends, and rejects future starts", async () => {
    await expectCode(
      assign({ startedAt: new Date(Date.now() + 3 * DAY).toISOString() }),
      "VALIDATION_FAILED",
    );
    await assign({ status: "TRIAL", planKey: "starter" });
    const sub = await live();
    expect(sub?.status).toBe("TRIAL");
    const days = ((sub?.trialEndsAt?.getTime() ?? 0) - (sub?.trialStartsAt?.getTime() ?? 0)) / DAY;
    expect(days).toBe(14); // plan.trialDays
    expect(await limit("staff_accounts")).toBe(2n);
    const event = await migratorDb().subscriptionEvent.findFirst({
      where: { organisationId: orgId },
    });
    expect(event?.type).toBe("trial_started");
  });

  it("changes plans; a downgrade over the limit needs acknowledgement and keeps data", async () => {
    await assign();
    const orgCtx = await requireOrganisationAccess(owner, orgPublic(orgId));
    for (const slug of ["one-store", "two-store"]) await createStore(orgCtx, storeInput(slug));
    const sub = await live();
    const change = (extra: Record<string, unknown>) =>
      changeSubscription(admin, {
        organisationId: orgPublic(orgId),
        subscriptionId: subPublic(sub?.id ?? ""),
        planKey: "starter",
        billingInterval: "MONTH",
        reason: "Customer asked to downgrade",
        ...extra,
      });
    const refused = await change({}).catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: "CONFLICT" });
    expect((refused as DomainError).fieldErrors?.["acknowledgeOverLimit"]).toContain(
      "stores (2 of 1)",
    );
    expect(await limit()).toBe(3n);

    const result = await change({ acknowledgeOverLimit: "on" });
    expect(result.overLimit.map((l) => l.key)).toEqual(["store_count"]);
    expect(await limit()).toBe(1n);
    expect(await migratorDb().store.count({ where: { organisationId: orgId } })).toBe(2);
    await expectCode(createStore(orgCtx, storeInput("three-store")), "LIMIT_REACHED");
    const event = await migratorDb().subscriptionEvent.findFirst({
      where: { type: "plan_changed" },
    });
    expect(event).toMatchObject({ fromStatus: "ACTIVE", toStatus: "ACTIVE" });
  });

  it("activates, cancels (entitled until access ends), reactivates and expires", async () => {
    await assign({ status: "TRIAL" });
    const id = () => subPublic(sub?.id ?? "");
    let sub = await live();
    const base = { organisationId: orgPublic(orgId), reason: "Lifecycle test" };
    await activateSubscription(admin, { ...base, subscriptionId: id() });
    await expectCode(activateSubscription(admin, { ...base, subscriptionId: id() }), "CONFLICT");

    await expectCode(
      cancelSubscription(admin, {
        ...base,
        subscriptionId: id(),
        accessEndsAt: new Date(Date.now() - DAY).toISOString(),
      }),
      "VALIDATION_FAILED",
    );
    await cancelSubscription(admin, {
      ...base,
      subscriptionId: id(),
      accessEndsAt: new Date(Date.now() + 5 * DAY).toISOString(),
    });
    sub = await live();
    expect(sub).toMatchObject({ status: "CANCELLED" });
    expect(await limit()).toBe(3n); // still entitled until access ends

    await activateSubscription(admin, { ...base, subscriptionId: id() });
    sub = await live();
    expect(sub).toMatchObject({ status: "ACTIVE", cancelledAt: null, expiresAt: null });

    await expireSubscription(admin, { ...base, subscriptionId: id() });
    expect(await live()).toBeNull();
    expect(await limit()).toBe(1n); // back to the system default
    const types = (
      await migratorDb().subscriptionEvent.findMany({
        where: { organisationId: orgId },
        orderBy: { occurredAt: "asc" },
      })
    ).map((e) => e.type);
    expect(types).toEqual(["trial_started", "activated", "cancelled", "reactivated", "expired"]);
  });

  it("expiring over the limit needs acknowledgement", async () => {
    await assign();
    const orgCtx = await requireOrganisationAccess(owner, orgPublic(orgId));
    for (const slug of ["exp-one", "exp-two"]) await createStore(orgCtx, storeInput(slug));
    const sub = await live();
    const input = {
      organisationId: orgPublic(orgId),
      subscriptionId: subPublic(sub?.id ?? ""),
      reason: "Contract ended",
    };
    await expectCode(expireSubscription(admin, input), "CONFLICT");
    await expireSubscription(admin, { ...input, acknowledgeOverLimit: true });
    expect(await migratorDb().store.count({ where: { organisationId: orgId } })).toBe(2);
  });

  it("rejects stale forms and manual changes to provider-managed subscriptions", async () => {
    await assign();
    const base = { organisationId: orgPublic(orgId), reason: "Stale form" };
    await expectCode(
      activateSubscription(admin, { ...base, subscriptionId: subPublic(uuidv7()) }),
      "CONFLICT",
    );
    const sub = await live();
    await expireSubscription(admin, { ...base, subscriptionId: subPublic(sub?.id ?? "") });
    await simulate("created", { planKey: "business" });
    const mock = await live();
    expect(mock?.source).toBe("MOCK");
    await expectCode(
      expireSubscription(admin, { ...base, subscriptionId: subPublic(mock?.id ?? "") }),
      "CONFLICT",
    );
  });

  it("organisation IDs are opaque and validated", async () => {
    await expectCode(assign({ organisationId: orgId }), "NOT_FOUND"); // raw UUID
    await expectCode(assign({ organisationId: orgPublic(uuidv7()) }), "NOT_FOUND");
  });
});

describe("entitlement overrides", () => {
  const override = (extra: Record<string, unknown>) =>
    setEntitlementOverride(admin, {
      organisationId: orgPublic(orgId),
      reason: "Enterprise deal",
      ...extra,
    });

  it("create, update and remove are audited with before/after values and take precedence", async () => {
    await assign({ planKey: "starter" });
    await override({ featureKey: "store_count", mode: "limit", limit: "20" });
    expect(await limit()).toBe(20n);
    await override({ featureKey: "store_count", mode: "unlimited", reason: "Contract amended" });
    expect(await limit()).toBe("unlimited");
    await removeEntitlementOverride(admin, {
      organisationId: orgPublic(orgId),
      featureKey: "store_count",
      reason: "Deal ended",
    });
    expect(await limit()).toBe(1n); // Starter
    const audit = await migratorDb().auditLog.findMany({
      where: { organisationId: orgId, action: { startsWith: "billing.override." } },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => [a.action, a.metadata])).toEqual([
      [
        "billing.override.created",
        expect.objectContaining({ feature: "store_count", value: "limit:20", previousValue: null }),
      ],
      [
        "billing.override.updated",
        expect.objectContaining({
          value: "unlimited",
          previousValue: "limit:20",
          reason: "Contract amended",
        }),
      ],
      [
        "billing.override.removed",
        expect.objectContaining({ previousValue: "unlimited", reason: "Deal ended" }),
      ],
    ]);
    const row = await migratorDb().organisationFeatureOverride.findFirst();
    expect(row).toBeNull();
  });

  it("works without a plan, expires, and validates values against the feature type", async () => {
    await override({
      featureKey: "custom_domain",
      mode: "enabled",
      expiresAt: new Date(Date.now() + DAY).toISOString(),
    });
    const set = await withTenant({ organisationId: orgId, storeId: null, userId: null }, (tx) =>
      loadEntitlements(tx, orgId),
    );
    expect(set.get("custom_domain")).toMatchObject({
      origin: "OVERRIDE",
      value: { kind: "BOOLEAN", enabled: true },
    });
    await migratorDb().organisationFeatureOverride.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const after = await withTenant({ organisationId: orgId, storeId: null, userId: null }, (tx) =>
      loadEntitlements(tx, orgId),
    );
    expect(after.get("custom_domain").origin).toBe("DEFAULT");

    await expectCode(
      override({ featureKey: "custom_domain", mode: "limit", limit: "3" }),
      "VALIDATION_FAILED",
    );
    await expectCode(override({ featureKey: "store_count", mode: "limit" }), "VALIDATION_FAILED");
    await expectCode(
      override({ featureKey: "analytics", mode: "config", config: "[1]" }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      override({ featureKey: "not_a_feature", mode: "enabled" }),
      "VALIDATION_FAILED",
    );
    await override({ featureKey: "analytics", mode: "config", config: '{"retentionDays": 90}' });
  });

  it("recalculating usage fixes drift and is audited", async () => {
    await migratorDb().usageCounter.updateMany({
      where: { organisationId: orgId },
      data: { value: 7n },
    });
    await expectCode(
      reconcileOrganisationUsage(admin, { organisationId: orgPublic(orgId) }),
      "VALIDATION_FAILED",
    );
    expect(
      await reconcileOrganisationUsage(admin, {
        organisationId: orgPublic(orgId),
        reason: "Support ticket",
      }),
    ).toEqual({ corrected: 1 });
    const audit = await migratorDb().auditLog.findFirst({
      where: { action: "billing.usage.reconciled" },
    });
    expect(audit?.metadata).toMatchObject({
      drift: "staff_accounts:7->1",
      reason: "Support ticket",
    });
  });
});

describe("entitlement change notifications", () => {
  let stop: () => void = () => undefined;
  afterEach(() => {
    stop();
  });

  it("fires after every manual change and processed provider event", async () => {
    const seen: string[] = [];
    stop = onEntitlementsChanged((id) => {
      seen.push(id);
    });
    await assign();
    await setEntitlementOverride(admin, {
      organisationId: orgPublic(orgId),
      featureKey: "custom_code",
      mode: "enabled",
      reason: "Beta",
    });
    expect(seen).toEqual([orgId, orgId]);
  });
});

describe("mock billing through the webhook pipeline", () => {
  it("drives the full lifecycle; every change is a SYSTEM event and entitlements follow", async () => {
    const steps: [Simulation, Record<string, unknown>, string, bigint | "unlimited"][] = [
      ["created", { planKey: "starter", trialDays: 14 }, "TRIAL", 1n],
      ["activated", {}, "ACTIVE", 1n],
      ["renewed", {}, "ACTIVE", 1n],
      ["upgraded", { planKey: "business" }, "ACTIVE", 3n],
      ["past_due", {}, "PAST_DUE", 3n], // still entitled during grace
      ["payment_recovered", {}, "ACTIVE", 3n],
      ["cancelled", {}, "CANCELLED", 3n], // until the period ends
      ["reactivated", {}, "ACTIVE", 3n],
      ["downgraded", { planKey: "starter" }, "ACTIVE", 1n],
    ];
    for (const [kind, extra, status, expected] of steps) {
      const result = await simulate(kind, extra);
      expect(result, kind).toMatchObject({ outcome: "processed", status: 200 });
      expect((await live())?.status, kind).toBe(status);
      expect(await limit(), kind).toBe(expected);
    }
    expect(await simulate("expired")).toMatchObject({ outcome: "processed" });
    expect(await live()).toBeNull();
    expect(await limit()).toBe(1n);

    const events = await migratorDb().subscriptionEvent.findMany({
      where: { organisationId: orgId },
    });
    expect(events).toHaveLength(10);
    expect(
      events.every((e) => e.actorType === "SYSTEM" && e.source === "MOCK" && e.providerEventId),
    ).toBe(true);
    const ledger = await migratorDb().billingWebhookEvent.findMany({
      where: { organisationId: orgId },
    });
    expect(ledger.every((l) => l.status === "PROCESSED")).toBe(true);
    // Staff who triggered each simulation are on the audit trail.
    expect(
      await migratorDb().auditLog.count({
        where: { action: "billing.simulation.requested", actorId: admin.userId },
      }),
    ).toBe(10);
  });

  it("the same plan grants the same entitlements whatever the source", async () => {
    const other = (await createOrganisation(owner, { name: "Other" })).organisationId;
    await assignPlan(admin, {
      organisationId: orgPublic(other),
      planKey: "business",
      status: "ACTIVE",
      reason: "Manual",
    });
    await simulate("created", { planKey: "business" });
    const load = (id: string) =>
      withTenant({ organisationId: id, storeId: null, userId: null }, (tx) =>
        loadEntitlements(tx, id),
      );
    const [manual, mock] = [await load(other), await load(orgId)];
    expect(mock.subscription?.source).toBe("MOCK");
    expect(manual.subscription?.source).toBe("MANUAL");
    expect(mock.entitlements).toEqual(manual.entitlements);
  });

  it("a duplicate delivery is processed once", async () => {
    await simulate("created", { planKey: "business" });
    expect(await simulate("duplicate")).toMatchObject({ outcome: "duplicate", status: 200 });
    expect(await migratorDb().subscriptionEvent.count({ where: { organisationId: orgId } })).toBe(
      1,
    );
  });

  it("concurrent deliveries of one event apply it exactly once", async () => {
    const mock = getMockProvider();
    if (!mock) throw new Error("mock disabled");
    const customer = await mock.createCustomer({ organisationId: orgId, name: "Acme" });
    await migratorDb().billingCustomer.create({
      data: { organisationId: orgId, provider: "MOCK", providerCustomerId: customer.customerRef },
    });
    const snapshot = await mock.createSubscription({
      ...customer,
      planKey: "business",
      interval: "MONTH",
      trialDays: 0,
    });
    const { rawBody, headers } = mock.deliver(
      toWire(mock.newEventId(), "created", new Date(), snapshot),
    );
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ingestBillingWebhook("MOCK", rawBody, headers)),
    );
    expect(results.filter((r) => r.outcome === "processed")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(4);
    expect(await migratorDb().subscription.count({ where: { organisationId: orgId } })).toBe(1);
  });

  it("a replayed delivery (stale signature) is rejected without being recorded", async () => {
    await simulate("created", { planKey: "business" });
    const before = await migratorDb().billingWebhookEvent.count();
    expect(await simulate("replayed")).toMatchObject({
      outcome: "rejected",
      status: 400,
      detail: "stale_signature",
    });
    expect(await migratorDb().billingWebhookEvent.count()).toBe(before);
  });

  it("an invalid signature changes nothing", async () => {
    await simulate("created", { planKey: "business" });
    const before = await migratorDb().billingWebhookEvent.count();
    expect(await simulate("invalid_signature")).toMatchObject({
      outcome: "rejected",
      detail: "invalid_signature",
    });
    expect((await live())?.status).toBe("ACTIVE");
    expect(await migratorDb().billingWebhookEvent.count()).toBe(before);
    const mock = getMockProvider();
    const { rawBody } = mock?.deliver({ any: "thing" }) ?? { rawBody: "" };
    expect(await ingestBillingWebhook("MOCK", rawBody, new Headers())).toMatchObject({
      detail: "missing_signature",
    });
  });

  it("an invalid payload is rejected", async () => {
    expect(await simulate("invalid_schema")).toMatchObject({
      outcome: "rejected",
      detail: "invalid_payload",
    });
  });

  it("an event for an unknown subscription is ignored", async () => {
    expect(await simulate("unknown_subscription", { planKey: "business" })).toMatchObject({
      outcome: "ignored",
      detail: "unknown_subscription",
    });
    expect(await live()).toBeNull();
    const ledger = await migratorDb().billingWebhookEvent.findFirst();
    expect(ledger).toMatchObject({ status: "IGNORED", outcome: "unknown_subscription" });
  });

  it("an out-of-order (older) event is ignored and state converges to the newest", async () => {
    await simulate("created", { planKey: "business" });
    expect(await simulate("out_of_order")).toMatchObject({ outcome: "ignored", detail: "stale" });
    expect((await live())?.status).toBe("ACTIVE");
    expect(await limit()).toBe(3n);
  });

  it("events delivered in reverse order converge to the newest snapshot", async () => {
    const mock = getMockProvider();
    if (!mock) throw new Error("mock disabled");
    const customer = await mock.createCustomer({ organisationId: orgId, name: "Acme" });
    await migratorDb().billingCustomer.create({
      data: { organisationId: orgId, provider: "MOCK", providerCustomerId: customer.customerRef },
    });
    const t0 = Date.now() - 60_000;
    const created = await mock.createSubscription({
      ...customer,
      planKey: "starter",
      interval: "MONTH",
      trialDays: 14,
    });
    const activated = {
      ...created,
      status: "ACTIVE" as const,
      currentPeriodStart: new Date(t0 + 1000),
      currentPeriodEnd: new Date(t0 + 31 * DAY),
    };
    const upgraded = { ...activated, planKey: "business" };
    const deliveries = [
      toWire(mock.newEventId(), "upgraded", new Date(t0 + 2000), upgraded),
      toWire(mock.newEventId(), "activated", new Date(t0 + 1000), activated),
      toWire(mock.newEventId(), "created", new Date(t0), created),
    ];
    const outcomes = [];
    for (const payload of deliveries) {
      const { rawBody, headers } = mock.deliver(payload);
      outcomes.push((await ingestBillingWebhook("MOCK", rawBody, headers)).outcome);
    }
    expect(outcomes).toEqual(["processed", "ignored", "ignored"]);
    expect(await live()).toMatchObject({ status: "ACTIVE", source: "MOCK" });
    expect(await limit()).toBe(3n);
  });

  it("an illegal transition from a provider is ignored", async () => {
    await simulate("created", { planKey: "business" });
    const sub = await live();
    const mock = getMockProvider();
    const snapshot = await mock?.getSubscription(sub?.providerSubscriptionId ?? "");
    if (!mock || !snapshot) throw new Error("setup");
    await simulate("expired");
    const { rawBody, headers } = mock.deliver(
      toWire(mock.newEventId(), "reactivated", new Date(), { ...snapshot, status: "ACTIVE" }),
    );
    expect(await ingestBillingWebhook("MOCK", rawBody, headers)).toMatchObject({
      outcome: "ignored",
      detail: "illegal_transition",
    });
    expect(await live()).toBeNull();
  });

  it("a failed delivery is retried and applied once", async () => {
    const mock = getMockProvider();
    if (!mock) throw new Error("mock disabled");
    const customer = await mock.createCustomer({ organisationId: orgId, name: "Acme" });
    await migratorDb().billingCustomer.create({
      data: { organisationId: orgId, provider: "MOCK", providerCustomerId: customer.customerRef },
    });
    const snapshot = await mock.createSubscription({
      ...customer,
      planKey: "business",
      interval: "MONTH",
      trialDays: 0,
    });
    const payload = toWire(mock.newEventId(), "created", new Date(), snapshot);
    // An earlier attempt failed mid-way (recorded, not applied).
    await migratorDb().billingWebhookEvent.create({
      data: {
        provider: "MOCK",
        providerEventId: payload.id,
        type: "created",
        status: "FAILED",
        attempts: 1,
        payload,
      },
    });
    const { rawBody, headers } = mock.deliver(payload);
    expect(await ingestBillingWebhook("MOCK", rawBody, headers)).toMatchObject({
      outcome: "processed",
    });
    const ledger = await migratorDb().billingWebhookEvent.findFirst({
      where: { providerEventId: payload.id },
    });
    expect(ledger).toMatchObject({ status: "PROCESSED", attempts: 2, lastError: null });
    expect(await ingestBillingWebhook("MOCK", rawBody, headers)).toMatchObject({
      outcome: "duplicate",
    });
  });

  it("a provider subscription supersedes a manual trial (conversion)", async () => {
    await assign({ status: "TRIAL", planKey: "starter" });
    await simulate("created", { planKey: "business" });
    const subs = await migratorDb().subscription.findMany({
      where: { organisationId: orgId },
      orderBy: { createdAt: "asc" },
    });
    expect(subs.map((s) => [s.source, s.status])).toEqual([
      ["MANUAL", "EXPIRED"],
      ["MOCK", "ACTIVE"],
    ]);
    expect(await migratorDb().subscriptionEvent.count({ where: { type: "superseded" } })).toBe(1);
  });

  it("only platform staff with the simulate permission can simulate", async () => {
    await expectCode(
      simulate("created", { planKey: "business" }, await staff("SUPPORT")),
      "FORBIDDEN",
    );
    expect(
      await simulate("created", { planKey: "business" }, await staff("OPERATIONS")),
    ).toMatchObject({
      outcome: "processed",
    });
  });
});

describe("environment safety", () => {
  it.each([
    ["development", undefined, true],
    ["test", undefined, true],
    ["staging", undefined, false],
    ["staging", "true", true],
    ["preview", "true", false],
    ["production", "true", false],
    [undefined, "true", false],
  ])("STOREVIA_ENV=%s BILLING_MOCK_ENABLED=%s → %s", (stage, flag, enabled) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
    if (stage) env["STOREVIA_ENV"] = stage;
    if (flag) env["BILLING_MOCK_ENABLED"] = flag;
    expect(isMockBillingEnabled(env)).toBe(enabled);
  });

  it.each([
    ["development", undefined, false],
    ["test", undefined, false],
    ["development", "true", true],
    ["production", "true", false],
  ])(
    "a production build with STOREVIA_ENV=%s BILLING_MOCK_ENABLED=%s → %s",
    (stage, flag, enabled) => {
      const env: NodeJS.ProcessEnv = { NODE_ENV: "production", STOREVIA_ENV: stage };
      if (flag) env["BILLING_MOCK_ENABLED"] = flag;
      expect(isMockBillingEnabled(env)).toBe(enabled);
    },
  );

  it("in production the mock provider, its webhook route and the simulator do not exist", async () => {
    const mock = getMockProvider();
    if (!mock) throw new Error("mock disabled");
    const { rawBody, headers } = mock.deliver({ id: "x" });
    process.env["STOREVIA_ENV"] = "production";
    process.env["BILLING_MOCK_ENABLED"] = "true";
    try {
      expect(getMockProvider()).toBeNull();
      expect(await ingestBillingWebhook("MOCK", rawBody, headers)).toMatchObject({
        status: 404,
        outcome: "not_found",
      });
      await expectCode(simulate("created", { planKey: "business" }), "NOT_FOUND");
      // Manual assignment is a legitimate production feature.
      await assign();
      expect((await live())?.source).toBe("MANUAL");
    } finally {
      process.env["STOREVIA_ENV"] = "test";
      delete process.env["BILLING_MOCK_ENABLED"];
    }
  });
});

describe("expiry sweep", () => {
  it("expires due MANUAL subscriptions through the Subscription Service", async () => {
    await assign({ status: "TRIAL" });
    await migratorDb().subscription.updateMany({
      where: { organisationId: orgId },
      data: {
        trialStartsAt: new Date(Date.now() - 20 * DAY),
        trialEndsAt: new Date(Date.now() - DAY),
      },
    });
    expect(await limit()).toBe(1n); // the time-aware rule already stopped entitlements
    expect(await sweepSubscriptionExpiry()).toEqual({ expired: 1 });
    expect(await live()).toBeNull();
    const event = await migratorDb().subscriptionEvent.findFirst({ where: { type: "expired" } });
    expect(event).toMatchObject({
      actorType: "SYSTEM",
      fromStatus: "TRIAL",
      toStatus: "EXPIRED",
      reason: "Scheduled expiry",
    });
    expect(await sweepSubscriptionExpiry()).toEqual({ expired: 0 });
  });

  it("leaves entitling and provider-managed subscriptions alone", async () => {
    await simulate("created", { planKey: "business" });
    await migratorDb().subscription.updateMany({
      where: { organisationId: orgId },
      data: {
        status: "PAST_DUE",
        pastDueSince: new Date(Date.now() - 20 * DAY),
        graceEndsAt: new Date(Date.now() - DAY),
      },
    });
    expect(await sweepSubscriptionExpiry()).toEqual({ expired: 0 });
  });
});

// Regressions for the Milestone 2 independent security review.
describe("security review regressions", () => {
  async function mockCustomer() {
    const mock = getMockProvider();
    if (!mock) throw new Error("mock disabled");
    const customer = await mock.createCustomer({ organisationId: orgId, name: "Acme" });
    await migratorDb().billingCustomer.create({
      data: { organisationId: orgId, provider: "MOCK", providerCustomerId: customer.customerRef },
    });
    return { mock, customer };
  }

  async function deliverAll(
    mock: NonNullable<ReturnType<typeof getMockProvider>>,
    payloads: unknown[],
  ): Promise<string[]> {
    const outcomes: string[] = [];
    for (const payload of payloads) {
      const { rawBody, headers } = mock.deliver(payload);
      const r = await ingestBillingWebhook("MOCK", rawBody, headers);
      outcomes.push(`${r.outcome}${r.detail ? `:${r.detail}` : ""}`);
    }
    return outcomes;
  }

  it("expired delivered before created converges to EXPIRED (finding 1A)", async () => {
    const { mock, customer } = await mockCustomer();
    const t0 = Date.now() - 60_000;
    const created = await mock.createSubscription({
      ...customer,
      planKey: "business",
      interval: "MONTH",
      trialDays: 0,
    });
    const expired = { ...created, status: "EXPIRED" as const, endedAt: new Date(t0 + 5000) };
    const outcomes = await deliverAll(mock, [
      toWire(mock.newEventId(), "expired", new Date(t0 + 5000), expired),
      toWire(mock.newEventId(), "created", new Date(t0), created),
    ]);
    expect(outcomes).toEqual(["processed", "ignored:stale"]);
    expect(await live()).toBeNull();
    expect(await limit()).toBe(1n);
  });

  it("cancelled delivered before created keeps the cancellation (finding 1A)", async () => {
    const { mock, customer } = await mockCustomer();
    const t0 = Date.now() - 60_000;
    const created = await mock.createSubscription({
      ...customer,
      planKey: "business",
      interval: "MONTH",
      trialDays: 0,
    });
    const cancelled = {
      ...created,
      status: "CANCELLED" as const,
      cancelledAt: new Date(t0 + 5000),
      accessEndsAt: new Date(Date.now() + 5 * DAY),
    };
    const outcomes = await deliverAll(mock, [
      toWire(mock.newEventId(), "cancelled", new Date(t0 + 5000), cancelled),
      toWire(mock.newEventId(), "created", new Date(t0), created),
    ]);
    expect(outcomes).toEqual(["processed", "ignored:stale"]);
    expect((await live())?.status).toBe("CANCELLED");
  });

  it("a delayed event for an older provider subscription can't replace a newer one (finding 1B)", async () => {
    const { mock, customer } = await mockCustomer();
    const t0 = Date.now() - 60_000;
    const older = await mock.createSubscription({
      ...customer,
      planKey: "starter",
      interval: "MONTH",
      trialDays: 0,
    });
    const newer = await mock.createSubscription({
      ...customer,
      planKey: "business",
      interval: "MONTH",
      trialDays: 0,
    });
    const outcomes = await deliverAll(mock, [
      toWire(mock.newEventId(), "created", new Date(t0 + 5000), newer),
      toWire(mock.newEventId(), "created", new Date(t0), older),
    ]);
    expect(outcomes).toEqual(["processed", "ignored:stale"]);
    expect((await live())?.providerSubscriptionId).toBe(newer.subscriptionRef);
    expect(await limit()).toBe(3n);
  });

  it("simulations need step-up and a reason (finding 2)", async () => {
    await expectCode(
      simulate("created", { planKey: "business" }, await staff("BILLING", { stepUp: false })),
      "REAUTHENTICATION_REQUIRED",
    );
    await expectCode(simulate("created", { planKey: "business", reason: "" }), "VALIDATION_FAILED");
    expect(await live()).toBeNull();
    expect(
      await migratorDb().auditLog.count({
        where: { action: { startsWith: "billing.simulation" } },
      }),
    ).toBe(0);
  });

  it("OPERATIONS can't replace a manual subscription through the simulator (finding 2)", async () => {
    await assign({ planKey: "enterprise" });
    await expectCode(
      simulate("created", { planKey: "starter" }, await staff("OPERATIONS")),
      "FORBIDDEN",
    );
    expect(await live()).toMatchObject({ source: "MANUAL", status: "ACTIVE" });
  });

  it("simulated plan changes must use available plans; the pipeline refuses archived plans (finding 2)", async () => {
    await simulate("created", { planKey: "business" });
    await migratorDb().plan.update({ where: { key: "enterprise" }, data: { status: "ARCHIVED" } });
    try {
      await expectCode(simulate("upgraded", { planKey: "enterprise" }), "VALIDATION_FAILED");
      const sub = await live();
      const mock = getMockProvider();
      const snapshot = await mock?.getSubscription(sub?.providerSubscriptionId ?? "");
      if (!mock || !snapshot) throw new Error("setup");
      const { rawBody, headers } = mock.deliver(
        toWire(mock.newEventId(), "upgraded", new Date(), { ...snapshot, planKey: "enterprise" }),
      );
      expect(await ingestBillingWebhook("MOCK", rawBody, headers)).toMatchObject({
        outcome: "ignored",
        detail: "archived_plan",
      });
      expect(await limit()).toBe(3n);
    } finally {
      await migratorDb().plan.update({ where: { key: "enterprise" }, data: { status: "ACTIVE" } });
    }
  });

  it("staff can expire a provider subscription that no longer grants anything (finding 4)", async () => {
    await simulate("created", { planKey: "business" });
    const sub = await live();
    const input = {
      organisationId: orgPublic(orgId),
      subscriptionId: subPublic(sub?.id ?? ""),
      reason: "Final event lost",
    };
    await expectCode(expireSubscription(admin, input), "CONFLICT"); // still entitling
    await migratorDb().subscription.update({
      where: { id: sub?.id ?? "" },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(Date.now() - 40 * DAY),
        expiresAt: new Date(Date.now() - 10 * DAY),
      },
    });
    await expireSubscription(admin, input);
    expect(await live()).toBeNull();
    await assign(); // the organisation is no longer stuck
  });

  it("a cancelled subscription can't be reactivated after access ended (finding 9)", async () => {
    await assign();
    let sub = await live();
    const base = {
      organisationId: orgPublic(orgId),
      subscriptionId: subPublic(sub?.id ?? ""),
      reason: "Test",
    };
    await cancelSubscription(admin, {
      ...base,
      accessEndsAt: new Date(Date.now() + DAY).toISOString(),
    });
    await migratorDb().subscription.update({
      where: { id: sub?.id ?? "" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expectCode(activateSubscription(admin, base), "CONFLICT");

    // The same rule applies to provider events.
    await expireSubscription(admin, { ...base, acknowledgeOverLimit: true });
    await simulate("created", { planKey: "business" });
    await simulate("cancelled");
    sub = await live();
    await migratorDb().subscription.update({
      where: { id: sub?.id ?? "" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await simulate("reactivated")).toMatchObject({
      outcome: "ignored",
      detail: "illegal_transition",
    });
  });

  it("an override that newly puts the organisation over a limit needs acknowledgement (finding 8)", async () => {
    await assign();
    const orgCtx = await requireOrganisationAccess(owner, orgPublic(orgId));
    for (const slug of ["ovr-one", "ovr-two"]) await createStore(orgCtx, storeInput(slug));
    const input = {
      organisationId: orgPublic(orgId),
      featureKey: "store_count",
      mode: "limit",
      limit: "1",
      reason: "Contract",
    };
    await expectCode(setEntitlementOverride(admin, input), "CONFLICT");
    expect(await limit()).toBe(3n); // rolled back
    const result = await setEntitlementOverride(admin, { ...input, acknowledgeOverLimit: "on" });
    expect(result.overLimit.map((l) => l.key)).toEqual(["store_count"]);
    expect(await limit()).toBe(1n);
    expect(await migratorDb().store.count({ where: { organisationId: orgId } })).toBe(2);
  });

  it("a simulation is attributed to its staff member before delivery (finding 8)", async () => {
    await simulate("created", { planKey: "business" });
    const actions = (
      await migratorDb().auditLog.findMany({
        where: { organisationId: orgId, action: { startsWith: "billing.simulation" } },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => [a.action, a.actorId]);
    expect(actions).toEqual([
      ["billing.simulation.requested", admin.userId],
      ["billing.simulation.delivered", admin.userId],
    ]);
  });
});

describe("job health (read-only, ADR-0023)", () => {
  it("shows stalled and failing jobs to staff with audit access only", async () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const db = migratorDb();
    await db.scheduledJob.createMany({
      data: [
        {
          name: "test.healthy",
          intervalSeconds: 300,
          slot: now,
          nextRunAt: new Date(now.getTime() + 60_000),
          lastStatus: "SUCCEEDED",
        },
        {
          name: "test.stalled",
          intervalSeconds: 300,
          slot: now,
          nextRunAt: new Date(now.getTime() - 3_600_000),
          lastStatus: "FAILED",
          consecutiveFailures: 4,
        },
      ],
    });
    await db.jobRun.create({
      data: {
        id: uuidv7(),
        jobName: "test.stalled",
        slot: now,
        attempt: 1,
        workerId: "w1",
        status: "FAILED",
        startedAt: now,
        error: "TypeError",
      },
    });
    const overview = await getJobsOverview(await staff("SUPPORT"), now);
    expect(overview.jobs.map((j) => [j.name, j.stalled, j.consecutiveFailures])).toEqual([
      ["test.healthy", false, 0],
      ["test.stalled", true, 4],
    ]);
    expect(overview.recentRuns[0]?.error).toBe("TypeError");
    await expectCode(getJobsOverview(await staff("READ_ONLY"), now), "FORBIDDEN");
  });
});
