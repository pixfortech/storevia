// Recent activity (dashboard home) read from the audit log: tenant isolation,
// store scoping, permission and field minimisation. Two independent tenants:
//   Tenant A: owner → Organisation A → Store A + Store A2 (+ an admin, a store manager)
//   Tenant B: owner → Organisation B → Store B
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createInvitation,
  createOrganisation,
  createStore,
  listRecentActivity,
  requireOrganisationAccess,
  requireStoreAccess,
  updateStore,
  type MemberRole,
  type OrganisationContext,
  type Principal,
} from "../src";

process.env["EMAIL_TRANSPORT"] = "file";
process.env["EMAIL_FILE_DIR"] = mkdtempSync(join(tmpdir(), "storevia-activity-mail-"));
process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";

const orgId = (id: string) => toTypeId("organisation", id);
const storeId = (id: string) => toTypeId("store", id);

async function makeUser(label: string): Promise<Principal> {
  const email = `${label}@example.test`;
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

const storeInput = (slug: string) => ({
  name: `Store ${slug}`,
  slug,
  currency: "INR",
  country: "IN",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
});

const rename = (name: string) => ({
  name,
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  contactEmail: "",
  supportEmail: "",
});

async function addMember(ctx: OrganisationContext, user: Principal, role: MemberRole) {
  await migratorDb().membership.create({
    data: { organisationId: ctx.organisationId, userId: user.userId, role, allStores: true },
  });
}

async function subscribe(organisationId: string, planKey: string): Promise<void> {
  const db = migratorDb();
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  await db.subscription.create({
    data: {
      organisationId,
      planId: plan.id,
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
    },
  });
}

interface Tenant {
  owner: Principal;
  org: string;
  store: string;
  orgCtx: OrganisationContext;
}

let A: Tenant;
let B: Tenant;
let storeA2: string;
let adminA: Principal;
let managerA: Principal;

beforeEach(async () => {
  await truncateAll();
  const setup = async (label: string, slug: string): Promise<Tenant> => {
    const owner = await makeUser(label);
    const { organisationId } = await createOrganisation(owner, { name: `Organisation ${label}` });
    const orgCtx = await requireOrganisationAccess(owner, orgId(organisationId));
    await subscribe(organisationId, "business");
    const { storeId: sid } = await createStore(orgCtx, storeInput(slug));
    return { owner, org: organisationId, store: sid, orgCtx };
  };
  A = await setup("a", "activity-a");
  B = await setup("b", "activity-b");
  storeA2 = (await createStore(A.orgCtx, storeInput("activity-a-two"))).storeId;
  adminA = await makeUser("a-admin");
  managerA = await makeUser("a-manager");
  await addMember(A.orgCtx, adminA, "ADMIN");
  await addMember(A.orgCtx, managerA, "STORE_MANAGER");
  // Store-level events in each of A's stores and in B's store.
  await updateStore(await requireStoreAccess(adminA, storeId(A.store)), rename("Store A renamed"));
  await updateStore(
    await requireStoreAccess(A.owner, storeId(storeA2)),
    rename("Store A2 renamed"),
  );
  await updateStore(await requireStoreAccess(B.owner, storeId(B.store)), rename("Store B renamed"));
});

afterAll(disconnectTestClients);

async function allAuditIds(organisationId: string): Promise<Set<string>> {
  const rows = await migratorDb().auditLog.findMany({
    where: { organisationId },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

describe("listRecentActivity", () => {
  it("never returns another tenant's events", async () => {
    const bIds = await allAuditIds(B.org);
    expect(bIds.size).toBeGreaterThan(0);
    const a = await listRecentActivity(A.orgCtx, { limit: 50 });
    expect(a.length).toBeGreaterThan(0);
    for (const entry of a) expect(bIds.has(entry.id)).toBe(false);
    const aIds = await allAuditIds(A.org);
    for (const entry of a) expect(aIds.has(entry.id)).toBe(true);
  });

  it("scopes a store view to that store plus organisation-wide events", async () => {
    const ctx = await requireStoreAccess(A.owner, storeId(A.store));
    const entries = await listRecentActivity(ctx, { limit: 50 });
    const storeIds = new Set(entries.map((e) => e.storeId));
    expect(storeIds.has(A.store)).toBe(true);
    expect(storeIds.has(storeA2)).toBe(false);
    expect(entries.some((e) => e.storeId === null && e.action === "organisation.created")).toBe(
      true,
    );
  });

  it("shows every store's events in the organisation view for all-store members", async () => {
    const storeIds = new Set(
      (await listRecentActivity(A.orgCtx, { limit: 50 })).map((e) => e.storeId),
    );
    expect(storeIds.has(A.store)).toBe(true);
    expect(storeIds.has(storeA2)).toBe(true);
  });

  it("requires audit.read", async () => {
    const ctx = await requireStoreAccess(managerA, storeId(A.store));
    expect(ctx.permissions.has("audit.read")).toBe(false);
    await expect(listRecentActivity(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<DomainError>);
  });

  it("names co-members, marks the viewer as you, newest first", async () => {
    const entries = await listRecentActivity(A.orgCtx, { limit: 50 });
    const renameA = entries.find((e) => e.action === "store.updated" && e.storeId === A.store);
    expect(renameA?.actor).toEqual({ kind: "member", name: "User a-admin" });
    const renameA2 = entries.find((e) => e.action === "store.updated" && e.storeId === storeA2);
    expect(renameA2?.actor).toEqual({ kind: "you" });
    const times = entries.map((e) => e.occurredAt.getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("returns only display-safe details (no emails, IPs, user agents or request IDs)", async () => {
    await createInvitation(
      A.orgCtx,
      { email: "invitee@example.test", role: "DESIGNER" },
      (t) => `http://app.localhost:3001/invitations/${t}`,
    );
    const entries = await listRecentActivity(A.orgCtx, { limit: 50 });
    const invited = entries.find((e) => e.action === "member.invited");
    expect(invited).toBeDefined();
    expect(invited?.details).not.toHaveProperty("email");
    const serialised = JSON.stringify(entries);
    expect(serialised).not.toContain("invitee@example.test");
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(
        ["action", "actor", "details", "entityType", "id", "occurredAt", "storeId"].sort(),
      );
    }
  });

  it("clamps the limit", async () => {
    expect(await listRecentActivity(A.orgCtx, { limit: 1 })).toHaveLength(1);
    expect((await listRecentActivity(A.orgCtx, { limit: 0 })).length).toBe(1);
    expect((await listRecentActivity(A.orgCtx, { limit: 10_000 })).length).toBeLessThanOrEqual(50);
  });
});
