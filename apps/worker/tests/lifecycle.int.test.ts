// Data lifecycle jobs (M8) with the real worker role: the retention sweep's
// fixed windows, and organisation deletion from the owner's request through
// the cooling-off period to the worker's deletion.
import { withTenant } from "@storevia/database";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import type { DomainProvisioner } from "@storevia/domains/provisioner";
import {
  cancelOrganisationDeletion,
  createOrganisation,
  createStore,
  listMyOrganisations,
  listPendingDeletions,
  requestOrganisationDeletion,
  requireOrganisationAccess,
  scopeOf,
  type Principal,
} from "@storevia/tenancy";
import { toTypeId, uuidv7 } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteDueOrganisations, sweepRetention } from "../src/lifecycle";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms);

beforeEach(async () => {
  await truncateAll();
});

afterAll(disconnectTestClients);

async function makeUser(label: string): Promise<Principal> {
  const email = `${label}-${uuidv7()}@example.test`;
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

describe("retention sweep", () => {
  it("removes only what is past its window", async () => {
    const db = migratorDb();
    const user = await makeUser("retention");
    const { organisationId } = await createOrganisation(user, { name: "Retention Org" });
    const session = (expiresAt: Date) =>
      db.session.create({
        data: { userId: user.userId, token: uuidv7(), expiresAt },
        select: { id: true },
      });
    const oldSession = await session(ago(8 * DAY));
    const recentlyExpired = await session(ago(2 * DAY));
    const verification = (expiresAt: Date) =>
      db.verification.create({
        data: { identifier: "x", value: "y", expiresAt },
        select: { id: true },
      });
    const oldVerification = await verification(ago(2 * DAY));
    const liveVerification = await verification(new Date(Date.now() + DAY));
    await db.rateLimit.createMany({
      data: [
        { key: "old", count: 1, lastRequest: BigInt(Date.now() - 3 * DAY) },
        { key: "fresh", count: 1, lastRequest: BigInt(Date.now()) },
      ],
    });
    await db.scheduledJob.create({
      data: { name: "test.job", intervalSeconds: 60, slot: new Date(), nextRunAt: new Date() },
    });
    const run = (status: "SUCCEEDED" | "FAILED", startedAt: Date) =>
      db.jobRun.create({
        data: {
          jobName: "test.job",
          slot: startedAt,
          attempt: 1,
          workerId: "w",
          status,
          startedAt,
        },
        select: { id: true },
      });
    const oldSuccess = await run("SUCCEEDED", ago(31 * DAY));
    const recentFailure = await run("FAILED", ago(31 * DAY));
    const oldFailure = await run("FAILED", ago(91 * DAY));
    const audit = (createdAt: Date) =>
      db.auditLog.create({
        data: { organisationId, actorType: "SYSTEM", action: "test.audit", createdAt },
        select: { id: true },
      });
    const oldAudit = await audit(ago(3 * 365 * DAY));
    const recentAudit = await audit(ago(365 * DAY));

    const removed = await sweepRetention();
    expect(removed).toMatchObject({ sessions: 1, verifications: 1, rate_limits: 1, audit_logs: 1 });
    expect(removed["job_runs"]).toBe(2);

    const exists = {
      session: async (id: string) => (await db.session.count({ where: { id } })) > 0,
      verification: async (id: string) => (await db.verification.count({ where: { id } })) > 0,
      jobRun: async (id: string) => (await db.jobRun.count({ where: { id } })) > 0,
    };
    expect(await exists.session(oldSession.id)).toBe(false);
    expect(await exists.session(recentlyExpired.id)).toBe(true);
    expect(await exists.verification(oldVerification.id)).toBe(false);
    expect(await exists.verification(liveVerification.id)).toBe(true);
    expect(await exists.jobRun(oldSuccess.id)).toBe(false);
    expect(await exists.jobRun(oldFailure.id)).toBe(false);
    expect(await exists.jobRun(recentFailure.id)).toBe(true);
    const keys = (await db.rateLimit.findMany()).map((r) => r.key);
    expect(keys).toContain("fresh");
    expect(keys).not.toContain("old");
    expect(await db.auditLog.count({ where: { id: oldAudit.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { id: recentAudit.id } })).toBe(1);

    // Idempotent, and bounded work when there's nothing to do.
    expect(Object.values(await sweepRetention()).every((n) => n === 0)).toBe(true);
  });

  it("is the worker's alone: the merchant role can't run it", async () => {
    const user = await makeUser("not-worker");
    const { organisationId } = await createOrganisation(user, { name: "Not Worker Org" });
    const ctx = await requireOrganisationAccess(user, toTypeId("organisation", organisationId));
    await expect(
      withTenant(scopeOf(ctx), (tx) => tx.$queryRaw`SELECT * FROM app_retention_sweep(10)`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("organisation deletion", () => {
  async function tenant() {
    const owner = await makeUser("owner");
    const { organisationId } = await createOrganisation(owner, { name: "Doomed Org" });
    const orgId = toTypeId("organisation", organisationId);
    const ctx = await requireOrganisationAccess(owner, orgId);
    const plan = await migratorDb().plan.findUniqueOrThrow({ where: { key: "business" } });
    await migratorDb().subscription.create({
      data: {
        organisationId,
        planId: plan.id,
        status: "ACTIVE",
        source: "MANUAL",
        startedAt: new Date(),
      },
    });
    const { storeId } = await createStore(ctx, {
      name: "Doomed Store",
      slug: `doomed-${uuidv7().slice(-10)}`,
      currency: "INR",
      country: "IN",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
    });
    const stepped = await requireOrganisationAccess(
      { ...owner, recentlyAuthenticated: true },
      orgId,
    );
    return { owner, organisationId, orgId, storeId, ctx, stepped };
  }

  it("owner requests with a recent password and the name; stores go offline; owner can cancel", async () => {
    const t = await tenant();
    await expect(
      requestOrganisationDeletion(t.ctx, { confirmName: "Doomed Org" }),
    ).rejects.toMatchObject({
      code: "REAUTHENTICATION_REQUIRED",
    });
    await expect(
      requestOrganisationDeletion(t.stepped, { confirmName: "doomed" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const admin = await makeUser("admin");
    await migratorDb().membership.create({
      data: {
        organisationId: t.organisationId,
        userId: admin.userId,
        role: "ADMIN",
        status: "ACTIVE",
        allStores: true,
      },
    });
    const adminCtx = await requireOrganisationAccess(
      { ...admin, recentlyAuthenticated: true },
      t.orgId,
    );
    await expect(
      requestOrganisationDeletion(adminCtx, { confirmName: "Doomed Org" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const { scheduledAt } = await requestOrganisationDeletion(t.stepped, {
      confirmName: "Doomed Org",
    });
    expect(scheduledAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    const org = await migratorDb().organisation.findUniqueOrThrow({
      where: { id: t.organisationId },
    });
    expect(org.status).toBe("PENDING_DELETION");
    // Nobody opens it any more; the owner sees it waiting; the admin doesn't.
    await expect(requireOrganisationAccess(t.owner, t.orgId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await listMyOrganisations(t.owner)).toEqual([]);
    expect((await listPendingDeletions(t.owner)).map((p) => p.id)).toEqual([t.organisationId]);
    expect(await listPendingDeletions(admin)).toEqual([]);
    await expect(cancelOrganisationDeletion(admin, t.orgId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // The storefront treats it as unavailable (outbox event raised for caches).
    expect(
      await migratorDb().outboxEvent.count({ where: { organisationId: t.organisationId } }),
    ).toBeGreaterThan(0);
    // Not due yet: the worker leaves it alone.
    expect(await deleteDueOrganisations(fakeProvider([]))).toEqual({ deleted: 0, failed: 0 });

    await cancelOrganisationDeletion(t.owner, t.orgId);
    expect(
      (await migratorDb().organisation.findUniqueOrThrow({ where: { id: t.organisationId } }))
        .status,
    ).toBe("ACTIVE");
    await requireOrganisationAccess(t.owner, t.orgId);
    const actions = (
      await migratorDb().auditLog.findMany({
        where: { organisationId: t.organisationId },
        select: { action: true },
      })
    ).map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "organisation.deletion_requested",
        "organisation.deletion_cancelled",
      ]),
    );
  });

  function fakeProvider(removed: string[], fail = false): DomainProvisioner {
    return {
      removeDomain: (hostname: string) => {
        if (fail) return Promise.reject(new Error("provider down"));
        removed.push(hostname);
        return Promise.resolve();
      },
    } as unknown as DomainProvisioner;
  }

  it("after the cooling-off period the worker deletes it, keeping financial records", async () => {
    const t = await tenant();
    const db = migratorDb();
    await db.storeDomain.create({
      data: {
        organisationId: t.organisationId,
        storeId: t.storeId,
        hostname: "shop.doomed.test",
        type: "CUSTOM",
        status: "ACTIVE",
        verificationToken: "t".repeat(43),
        providerRef: "vercel:doomed",
        verifiedAt: new Date(),
      },
    });
    const media = uuidv7();
    await db.$executeRaw`
      INSERT INTO "MediaAsset" (id, "organisationId", "storeId", kind, status, filename, "declaredMimeType",
        "storageKey", "updatedAt")
      VALUES (${media}::uuid, ${t.organisationId}::uuid, ${t.storeId}::uuid, 'IMAGE', 'READY', 'a.jpg',
        'image/jpeg', ${`uploads/${t.organisationId}/${t.storeId}/${media}`}, now())`;
    await requestOrganisationDeletion(t.stepped, { confirmName: "Doomed Org" });
    await db.$executeRaw`
      UPDATE "Organisation" SET "deletionScheduledAt" = now() - interval '1 minute'
      WHERE id = ${t.organisationId}::uuid`;

    // A provider failure leaves everything in place for the next run.
    expect(await deleteDueOrganisations(fakeProvider([], true))).toEqual({ deleted: 0, failed: 1 });
    expect(
      (await db.organisation.findUniqueOrThrow({ where: { id: t.organisationId } })).status,
    ).toBe("PENDING_DELETION");
    expect(
      await db.storeDomain.count({ where: { organisationId: t.organisationId } }),
    ).toBeGreaterThan(0);

    const removed: string[] = [];
    expect(await deleteDueOrganisations(fakeProvider(removed))).toEqual({ deleted: 1, failed: 0 });
    expect(removed).toEqual(["shop.doomed.test"]);
    const org = await db.organisation.findUniqueOrThrow({ where: { id: t.organisationId } });
    expect(org).toMatchObject({
      status: "DELETED",
      name: "Deleted organisation",
      billingEmail: null,
    });
    expect(org.deletedAt).toBeInstanceOf(Date);
    expect(await db.membership.count({ where: { organisationId: t.organisationId } })).toBe(0);
    expect(await db.storeDomain.count({ where: { organisationId: t.organisationId } })).toBe(0);
    expect((await db.store.findUniqueOrThrow({ where: { id: t.storeId } })).status).toBe(
      "ARCHIVED",
    );
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: media } })).status).toBe(
      "DELETED",
    );
    expect(
      (await db.subscription.findFirstOrThrow({ where: { organisationId: t.organisationId } }))
        .status,
    ).toBe("EXPIRED");
    expect(
      await db.auditLog.count({
        where: { organisationId: t.organisationId, action: "organisation.deleted" },
      }),
    ).toBe(1);
    // The owner's account is free to be deleted now; nothing is pending.
    expect(await listPendingDeletions(t.owner)).toEqual([]);
    // Idempotent.
    expect(await deleteDueOrganisations(fakeProvider(removed))).toEqual({ deleted: 0, failed: 0 });
  });
});
