// Billing recovery and support tooling (M8): grace extension, stepped-up
// usage reconciliation, support diagnostics and the high-risk repairs
// (suspend/restore, retry emails) with their permission, step-up, typed
// confirmation, reason, audit and storefront invalidation.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  type Principal,
} from "@storevia/tenancy";
import { requirePlatformStaff, type PlatformContext } from "@storevia/tenancy/platform";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  extendGrace,
  getSupportDiagnostics,
  reconcileOrganisationUsage,
  retryFailedOrderEmails,
  setOrganisationSuspension,
  setStoreSuspension,
} from "../src";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";
process.env["STOREVIA_ENV"] = "test";

const DAY = 24 * 3600 * 1000;
const orgPublic = (id: string) => toTypeId("organisation", id);

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
  stepUp = true,
): Promise<PlatformContext> {
  const user = await makeUser(role.toLowerCase());
  await migratorDb().platformStaff.create({ data: { userId: user.userId, role } });
  return requirePlatformStaff(
    { ...user, recentlyAuthenticated: stepUp },
    { requestId: `req-${role}`, ipAddress: "203.0.113.7", userAgent: "vitest" },
  );
}

let owner: Principal;
let orgId: string;
let liveStoreId: string;
let draftStoreId: string;

beforeEach(async () => {
  await truncateAll();
  owner = await makeUser("owner");
  ({ organisationId: orgId } = await createOrganisation(owner, { name: "Acme Retail" }));
  const ctx = await requireOrganisationAccess(owner, orgPublic(orgId));
  const plan = await migratorDb().plan.findUniqueOrThrow({ where: { key: "business" } });
  const input = (slug: string) => ({
    name: slug,
    slug,
    currency: "INR",
    country: "IN",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  });
  await migratorDb().subscription.create({
    data: {
      organisationId: orgId,
      planId: plan.id,
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
    },
  });
  liveStoreId = (await createStore(ctx, input(`live-${uuidv7().slice(-8)}`))).storeId;
  draftStoreId = (await createStore(ctx, input(`draft-${uuidv7().slice(-8)}`))).storeId;
  await migratorDb().store.update({ where: { id: liveStoreId }, data: { status: "ACTIVE" } });
  await migratorDb().store.update({ where: { id: draftStoreId }, data: { status: "DRAFT" } });
});

afterAll(disconnectTestClients);

describe("grace extension (failed-payment recovery)", () => {
  async function pastDue() {
    const sub = await migratorDb().subscription.findFirstOrThrow({
      where: { organisationId: orgId },
    });
    await migratorDb().subscription.update({
      where: { id: sub.id },
      data: {
        status: "PAST_DUE",
        pastDueSince: new Date(Date.now() - 3 * DAY),
        graceEndsAt: new Date(Date.now() + 2 * DAY),
      },
    });
    return toTypeId("subscription", sub.id);
  }
  const input = (subscriptionId: string, days: number, extra: Record<string, unknown> = {}) => ({
    organisationId: orgPublic(orgId),
    subscriptionId,
    graceEndsAt: new Date(Date.now() + days * DAY).toISOString(),
    reason: "Customer paying by bank transfer",
    ...extra,
  });

  it("extends a past-due subscription's grace, recorded in history and audit", async () => {
    const subscriptionId = await pastDue();
    const billing = await staff("BILLING");
    await extendGrace(billing, input(subscriptionId, 14));
    const sub = await migratorDb().subscription.findFirstOrThrow({
      where: { organisationId: orgId },
    });
    expect(sub.status).toBe("PAST_DUE");
    expect(sub.graceEndsAt?.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);
    expect(
      await migratorDb().subscriptionEvent.count({
        where: { subscriptionId: sub.id, type: "grace_extended" },
      }),
    ).toBe(1);
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "billing.subscription.grace_extended" },
    });
    expect(audit).toMatchObject({ actorType: "PLATFORM_STAFF", organisationId: orgId });
  });

  it("is bounded, stepped up and for billing staff only", async () => {
    const subscriptionId = await pastDue();
    await expectCode(
      extendGrace(await staff("BILLING", false), input(subscriptionId, 10)),
      "REAUTHENTICATION_REQUIRED",
    );
    await expectCode(extendGrace(await staff("SUPPORT"), input(subscriptionId, 10)), "FORBIDDEN");
    await expectCode(
      extendGrace(await staff("OPERATIONS"), input(subscriptionId, 10)),
      "FORBIDDEN",
    );
    const billing = await staff("BILLING");
    await expectCode(extendGrace(billing, input(subscriptionId, 61)), "VALIDATION_FAILED");
    await expectCode(extendGrace(billing, input(subscriptionId, 1)), "VALIDATION_FAILED"); // before current end
    await expectCode(extendGrace(billing, input(subscriptionId, -1)), "VALIDATION_FAILED");
    await expectCode(
      extendGrace(billing, input(subscriptionId, 10, { reason: "" })),
      "VALIDATION_FAILED",
    );
  });

  it("only applies to past-due subscriptions", async () => {
    const sub = await migratorDb().subscription.findFirstOrThrow({
      where: { organisationId: orgId },
    });
    await expectCode(
      extendGrace(await staff("BILLING"), input(toTypeId("subscription", sub.id), 10)),
      "CONFLICT",
    );
  });

  it("usage reconciliation now needs a recent password", async () => {
    await expectCode(
      reconcileOrganisationUsage(await staff("BILLING", false), {
        organisationId: orgPublic(orgId),
        reason: "Counters drifted",
      }),
      "REAUTHENTICATION_REQUIRED",
    );
  });
});

describe("support diagnostics", () => {
  it("reads counts per store for any staff role that sees organisations", async () => {
    const diag = await getSupportDiagnostics(await staff("READ_ONLY"), orgPublic(orgId));
    expect(diag.organisationStatus).toBe("ACTIVE");
    expect(diag.stores).toHaveLength(2);
    const live = diag.stores.find((s) => s.id === liveStoreId);
    expect(live).toMatchObject({ status: "ACTIVE", storefront: "live", lastOrderAt: null });
    expect(live?.metrics).toMatchObject({ orders_30d: 0, notifications_failed: 0 });
    expect(diag.stores.find((s) => s.id === draftStoreId)?.storefront).toBe("coming-soon");
    await expectCode(getSupportDiagnostics(await staff("READ_ONLY"), "org_nope"), "NOT_FOUND");
  });
});

describe("support repairs", () => {
  const slugOf = async (id: string) =>
    (await migratorDb().store.findUniqueOrThrow({ where: { id } })).slug;

  it("suspends a store everywhere and restores it to what it was", async () => {
    const ops = await staff("OPERATIONS");
    const slug = await slugOf(liveStoreId);
    const outboxBefore = await migratorDb().outboxEvent.count({ where: { storeId: liveStoreId } });
    const base = {
      storeId: toTypeId("store", liveStoreId),
      reason: "Phishing report #4411 confirmed",
    };
    await expectCode(
      setStoreSuspension(ops, { ...base, confirm: "wrong", suspend: true }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      setStoreSuspension(ops, { ...base, confirm: slug, reason: "short", suspend: true }),
      "VALIDATION_FAILED",
    );
    expect(await setStoreSuspension(ops, { ...base, confirm: slug, suspend: true })).toEqual({
      status: "SUSPENDED",
    });
    const suspended = await migratorDb().store.findUniqueOrThrow({ where: { id: liveStoreId } });
    expect(suspended).toMatchObject({ status: "SUSPENDED", suspendedFromStatus: "ACTIVE" });
    expect(suspended.suspensionReason).toContain("Phishing");
    // Every storefront instance hears about it through the outbox.
    expect(
      await migratorDb().outboxEvent.count({ where: { storeId: liveStoreId } }),
    ).toBeGreaterThan(outboxBefore);
    await expectCode(
      setStoreSuspension(ops, { ...base, confirm: slug, suspend: true }),
      "CONFLICT",
    );
    expect(await setStoreSuspension(ops, { ...base, confirm: slug, suspend: false })).toEqual({
      status: "ACTIVE",
    });
    const audit = await migratorDb().auditLog.findMany({
      where: { entityId: liveStoreId, action: { in: ["store.suspended", "store.restored"] } },
    });
    expect(audit.map((a) => a.action).sort()).toEqual(["store.restored", "store.suspended"]);
    expect(audit.every((a) => a.actorType === "PLATFORM_STAFF")).toBe(true);
  });

  it("a draft store stays a draft after restore", async () => {
    const ops = await staff("SUPER_ADMIN");
    const slug = await slugOf(draftStoreId);
    const base = {
      storeId: toTypeId("store", draftStoreId),
      confirm: slug,
      reason: "Checking a trademark claim",
    };
    await setStoreSuspension(ops, { ...base, suspend: true });
    expect(await setStoreSuspension(ops, { ...base, suspend: false })).toEqual({ status: "DRAFT" });
  });

  it("suspends and restores an organisation; members lose access meanwhile", async () => {
    const ops = await staff("OPERATIONS");
    const base = {
      organisationId: orgPublic(orgId),
      confirm: "Acme Retail",
      reason: "Chargeback fraud under review",
    };
    await setOrganisationSuspension(ops, { ...base, suspend: true });
    await expect(requireOrganisationAccess(owner, orgPublic(orgId))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const diag = await getSupportDiagnostics(ops, orgPublic(orgId));
    expect(diag.stores.every((s) => s.storefront === "unavailable")).toBe(true);
    await setOrganisationSuspension(ops, { ...base, suspend: false });
    await requireOrganisationAccess(owner, orgPublic(orgId));
    expect(
      await migratorDb().auditLog.count({
        where: {
          organisationId: orgId,
          action: { in: ["organisation.suspended", "organisation.restored"] },
        },
      }),
    ).toBe(2);
  });

  it("retrying emails is audited even when nothing failed", async () => {
    const ops = await staff("OPERATIONS");
    expect(
      await retryFailedOrderEmails(ops, {
        organisationId: orgPublic(orgId),
        confirm: "Acme Retail",
        reason: "Mail provider outage resolved",
      }),
    ).toEqual({ queued: 0 });
    expect(
      await migratorDb().auditLog.count({ where: { action: "order.notifications_retried" } }),
    ).toBe(1);
  });

  it("needs platform.support.manage and a recent password", async () => {
    const slug = await slugOf(liveStoreId);
    const input = {
      storeId: toTypeId("store", liveStoreId),
      confirm: slug,
      reason: "Abuse report received",
      suspend: true,
    };
    for (const role of ["BILLING", "SUPPORT", "READ_ONLY"] as const)
      await expectCode(setStoreSuspension(await staff(role), input), "FORBIDDEN");
    await expectCode(
      setStoreSuspension(await staff("OPERATIONS", false), input),
      "REAUTHENTICATION_REQUIRED",
    );
    expect(
      (await migratorDb().store.findUniqueOrThrow({ where: { id: liveStoreId } })).status,
    ).toBe("ACTIVE");
  });

  it("the platform role can't change tenant rows directly", async () => {
    const { platformDb } = await import("@storevia/database/platform");
    await expect(
      platformDb()
        .$executeRaw`UPDATE "Store" SET status = 'SUSPENDED' WHERE id = ${liveStoreId}::uuid`,
    ).rejects.toThrow(/permission denied/);
  });
});
