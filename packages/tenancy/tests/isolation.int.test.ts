// Tenant-isolation and permission suite (docs/architecture/03-tenancy.md §8).
// Two completely independent tenants:
//   Tenant A: User A → Organisation A → Store A (+ Store A2)
//   Tenant B: User B → Organisation B → Store B
// Every test proves a boundary at the service layer (the same functions the
// dashboard's server actions call). Database-layer proofs live in
// packages/database/tests/rls.int.test.ts; HTTP-level proofs in the E2E suite.
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptInvitation,
  archiveStore,
  changeMemberRole,
  createInvitation,
  createOrganisation,
  createStore,
  getStore,
  leaveOrganisation,
  listInvitations,
  listMembers,
  listMyOrganisations,
  listStores,
  organisationOf,
  previewInvitation,
  removeMember,
  requireOrganisationAccess,
  requireStoreAccess,
  requireStorePermission,
  revokeInvitation,
  scopeOf,
  setMemberStatus,
  setMemberStoreAccess,
  transferOwnership,
  updateStore,
  type MemberRole,
  type OrganisationContext,
  type Principal,
} from "../src";

const MAIL_DIR = mkdtempSync(join(tmpdir(), "storevia-tenancy-mail-"));
process.env["EMAIL_TRANSPORT"] = "file";
process.env["EMAIL_FILE_DIR"] = MAIL_DIR;
process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";

const orgId = (id: string) => toTypeId("organisation", id);
const storeId = (id: string) => toTypeId("store", id);
const memId = (id: string) => toTypeId("membership", id);
const invId = (id: string) => toTypeId("invitation", id);

async function makeUser(label: string, opts: { verified?: boolean } = {}): Promise<Principal> {
  const email = `${label}@example.test`;
  const user = await migratorDb().user.create({
    data: { id: uuidv7(), email, name: `User ${label}`, emailVerified: opts.verified ?? true },
  });
  return {
    userId: user.id,
    email,
    name: user.name,
    emailVerified: user.emailVerified,
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

async function expectCode(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

/** Adds a member directly with a role (fixture shortcut; invitations are tested separately). */
async function addMember(
  ctx: OrganisationContext,
  user: Principal,
  role: MemberRole,
  allStores = true,
): Promise<string> {
  const m = await migratorDb().membership.create({
    data: { organisationId: ctx.organisationId, userId: user.userId, role, allStores },
  });
  return m.id;
}

function latestInviteToken(email: string): string {
  const files = readdirSync(MAIL_DIR)
    .filter((f) => f.includes(email) && f.endsWith("-invitation.json"))
    .sort();
  const last = files.at(-1);
  if (!last) throw new Error(`no invitation email for ${email}`);
  const { text } = JSON.parse(readFileSync(join(MAIL_DIR, last), "utf8")) as { text: string };
  const match = /\/invitations\/([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("no token in invitation");
  return match[1];
}

const acceptUrl = (token: string) => `http://app.localhost:3001/invitations/${token}`;

/**
 * Gives an organisation a live MANUAL subscription as a real row, as the
 * platform-admin Subscription Service would. The entitlement engine and
 * enforcement under test are unchanged (no bypass; ADR-0022).
 */
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
  user: Principal;
  org: string;
  store: string;
  orgCtx: OrganisationContext;
}

let A: Tenant;
let B: Tenant;
let storeA2: string;

beforeEach(async () => {
  await truncateAll();
  const setup = async (label: string, slug: string): Promise<Tenant> => {
    const user = await makeUser(label);
    const { organisationId } = await createOrganisation(user, { name: `Organisation ${label}` });
    const orgCtx = await requireOrganisationAccess(user, orgId(organisationId));
    await subscribe(organisationId, "business"); // 3 stores, 10 seats, store-limited staff
    const { storeId: sid } = await createStore(orgCtx, storeInput(slug));
    return { user, org: organisationId, store: sid, orgCtx };
  };
  A = await setup("a", "tenant-a");
  B = await setup("b", "tenant-b");
  storeA2 = (await createStore(A.orgCtx, storeInput("tenant-a-two"))).storeId;
});

afterAll(disconnectTestClients);

describe("T1 onboarding: user → organisation (OWNER) → store", () => {
  it("creates the organisation with the creator as sole OWNER and a primary platform domain", async () => {
    const members = await listMembers(A.orgCtx);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ role: "OWNER", userId: A.user.userId, isCurrentUser: true });
    const store = await getStore(await requireStoreAccess(A.user, storeId(A.store)));
    expect(store).toMatchObject({
      slug: "tenant-a",
      status: "DRAFT",
      primaryHostname: "tenant-a.storevia.site",
    });
    expect(A.orgCtx.permissions.has("billing.manage")).toBe(true);
  });

  it("rejects duplicate store addresses across tenants without revealing the owner", async () => {
    await expectCode(createStore(A.orgCtx, storeInput("tenant-b")), "CONFLICT");
  });

  it("rejects reserved and malformed store addresses", async () => {
    await expectCode(createStore(A.orgCtx, storeInput("admin")), "VALIDATION_FAILED");
    await expectCode(createStore(A.orgCtx, storeInput("Bad Slug")), "VALIDATION_FAILED");
  });
});

describe("T2-T4 cross-tenant access (User A vs Tenant B)", () => {
  it("cannot access Organisation B", async () => {
    await expectCode(requireOrganisationAccess(A.user, orgId(B.org)), "NOT_FOUND");
  });

  it("cannot retrieve Store B", async () => {
    await expectCode(requireStoreAccess(A.user, storeId(B.store)), "NOT_FOUND");
  });

  it("cannot update or delete (archive) Store B: no context can be obtained for it", async () => {
    await expectCode(requireStorePermission(A.user, storeId(B.store), "store.update"), "NOT_FOUND");
    await expectCode(
      requireStorePermission(A.user, storeId(B.store), "store.archive"),
      "NOT_FOUND",
    );
    const b = await getStore(await requireStoreAccess(B.user, storeId(B.store)));
    expect(b.status).toBe("DRAFT");
  });

  it("cannot enumerate Tenant B through listings", async () => {
    expect((await listMyOrganisations(A.user)).map((o) => o.id)).toEqual([A.org]);
    const stores = await listStores(A.orgCtx);
    expect(stores.map((s) => s.id).sort()).toEqual([A.store, storeA2].sort());
    expect(stores.some((s) => s.id === B.store)).toBe(false);
  });

  it("the same response for a foreign store and a store that doesn't exist", async () => {
    const foreign = requireStoreAccess(A.user, storeId(B.store)).catch((e: unknown) => e);
    const missing = requireStoreAccess(A.user, storeId(uuidv7())).catch((e: unknown) => e);
    const [f, m] = await Promise.all([foreign, missing]);
    expect(f).toMatchObject({ code: "NOT_FOUND", message: "Not found." });
    expect(m).toMatchObject({ code: "NOT_FOUND", message: "Not found." });
  });

  it("cannot manage Tenant B's memberships through its own context", async () => {
    const [bOwner] = await listMembers(B.orgCtx);
    if (!bOwner) throw new Error("fixture");
    await expectCode(
      changeMemberRole(A.orgCtx, memId(bOwner.membershipId), { role: "VIEWER" }),
      "NOT_FOUND",
    );
    await expectCode(removeMember(A.orgCtx, memId(bOwner.membershipId)), "NOT_FOUND");
  });

  it("cannot revoke Tenant B's invitations", async () => {
    const { invitationId } = await createInvitation(
      B.orgCtx,
      { email: "new@example.test", role: "VIEWER" },
      acceptUrl,
    );
    await expectCode(revokeInvitation(A.orgCtx, invId(invitationId)), "NOT_FOUND");
    expect(await listInvitations(B.orgCtx)).toHaveLength(1);
  });

  it("cannot reference Store B from nested records (store access lists)", async () => {
    const helper = await makeUser("a-helper");
    const membershipId = await addMember(A.orgCtx, helper, "SUPPORT");
    await expectCode(
      setMemberStoreAccess(A.orgCtx, memId(membershipId), {
        allStores: false,
        storeIds: [storeId(B.store)],
      }),
      "NOT_FOUND",
    );
    expect(await migratorDb().membershipStoreAccess.count({ where: { storeId: B.store } })).toBe(0);
  });
});

describe("T16 tenant IDs in request bodies are never trusted", () => {
  it("ignores organisationId/storeId smuggled into an update body", async () => {
    const ctx = await requireStoreAccess(A.user, storeId(A.store));
    await updateStore(ctx, {
      name: "Renamed A",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      contactEmail: "",
      supportEmail: "",
      organisationId: B.org,
      storeId: B.store,
      id: B.store,
    });
    const [a, b] = await Promise.all([
      migratorDb().store.findUniqueOrThrow({ where: { id: A.store } }),
      migratorDb().store.findUniqueOrThrow({ where: { id: B.store } }),
    ]);
    expect(a).toMatchObject({ name: "Renamed A", organisationId: A.org });
    expect(b.name).toBe("Store tenant-b");
  });

  it("refuses contexts that were not issued by the resolvers", () => {
    const forged = { ...A.orgCtx, organisationId: B.org };
    expect(() => scopeOf(forged)).toThrow(/not issued/);
  });
});

describe("malformed identifiers", () => {
  it.each([
    ["empty", ""],
    ["raw uuid", "0190f2a4-0000-7000-8000-000000000000"],
    ["wrong prefix", "org_01j9zq3v4n8xkq2m7c5r6t8w9y"],
    ["sql", "store_' OR '1'='1"],
    ["path traversal", "../store_01j9zq3v4n8xkq2m7c5r6t8w9y"],
    ["too long", `store_${"a".repeat(200)}`],
    ["non-string", 42],
  ])("%s → NOT_FOUND", async (_label, value) => {
    await expectCode(requireStoreAccess(A.user, value), "NOT_FOUND");
  });

  it("an organisation ID of the wrong kind is rejected", async () => {
    await expectCode(requireOrganisationAccess(A.user, storeId(A.store)), "NOT_FOUND");
  });
});

describe("unauthenticated and unverified principals", () => {
  it("requires a principal", async () => {
    await expectCode(requireStoreAccess(null, storeId(A.store)), "UNAUTHENTICATED");
    await expectCode(requireOrganisationAccess(undefined, orgId(A.org)), "UNAUTHENTICATED");
    await expectCode(createOrganisation(null, { name: "x" }), "UNAUTHENTICATED");
  });

  it("requires a verified email", async () => {
    const unverified = await makeUser("unverified", { verified: false });
    await expectCode(createOrganisation(unverified, { name: "x" }), "FORBIDDEN");
  });
});

describe("T6 role permissions at the service layer", () => {
  it("OWNER can do everything in M1 scope", async () => {
    const ctx = await requireStoreAccess(A.user, storeId(A.store));
    await updateStore(ctx, {
      name: "Owner edit",
      locale: "en",
      timezone: "UTC",
      contactEmail: "",
      supportEmail: "",
    });
    const stepped = await requireOrganisationAccess(
      { ...A.user, recentlyAuthenticated: true },
      orgId(A.org),
    );
    await createInvitation(stepped, { email: "x@example.test", role: "ADMIN" }, acceptUrl);
  });

  it("VIEWER is read-only", async () => {
    const viewer = await makeUser("viewer");
    await addMember(A.orgCtx, viewer, "VIEWER");
    const orgCtx = await requireOrganisationAccess(viewer, orgId(A.org));
    const ctx = await requireStoreAccess(viewer, storeId(A.store));
    expect((await getStore(ctx)).id).toBe(A.store);
    await expectCode(
      updateStore(ctx, {
        name: "x",
        locale: "en",
        timezone: "UTC",
        contactEmail: "",
        supportEmail: "",
      }),
      "FORBIDDEN",
    );
    await expectCode(createStore(orgCtx, storeInput("viewer-store")), "FORBIDDEN");
    await expectCode(
      createInvitation(orgCtx, { email: "v@example.test", role: "VIEWER" }, acceptUrl),
      "FORBIDDEN",
    );
    await expectCode(listMembers(orgCtx), "FORBIDDEN");
    await expectCode(archiveStore(ctx), "FORBIDDEN");
  });

  it("STORE_MANAGER can edit store settings but not create stores, archive or manage members", async () => {
    const manager = await makeUser("manager");
    await addMember(A.orgCtx, manager, "STORE_MANAGER");
    const ctx = await requireStoreAccess(manager, storeId(A.store));
    await updateStore(ctx, {
      name: "Managed",
      locale: "en",
      timezone: "UTC",
      contactEmail: "ops@example.test",
      supportEmail: "",
    });
    const orgCtx = organisationOf(ctx);
    expect((await listMembers(orgCtx)).length).toBe(2);
    await expectCode(createStore(orgCtx, storeInput("manager-store")), "FORBIDDEN");
    await expectCode(archiveStore(ctx), "FORBIDDEN");
    await expectCode(
      createInvitation(orgCtx, { email: "m@example.test", role: "VIEWER" }, acceptUrl),
      "FORBIDDEN",
    );
  });

  it("DESIGNER cannot change store settings", async () => {
    const designer = await makeUser("designer");
    await addMember(A.orgCtx, designer, "DESIGNER");
    const ctx = await requireStoreAccess(designer, storeId(A.store));
    await expectCode(
      updateStore(ctx, {
        name: "x",
        locale: "en",
        timezone: "UTC",
        contactEmail: "",
        supportEmail: "",
      }),
      "FORBIDDEN",
    );
  });
});

describe("T7 privilege escalation", () => {
  it("nobody can invite or promote to OWNER", async () => {
    await expectCode(
      createInvitation(A.orgCtx, { email: "o@example.test", role: "OWNER" }, acceptUrl),
      "VALIDATION_FAILED",
    );
    const admin = await makeUser("admin");
    const adminMembership = await addMember(A.orgCtx, admin, "ADMIN");
    await expectCode(
      changeMemberRole(A.orgCtx, memId(adminMembership), { role: "OWNER" }),
      "VALIDATION_FAILED",
    );
  });

  it("an ADMIN cannot change or remove the OWNER", async () => {
    const admin = await makeUser("admin2");
    await addMember(A.orgCtx, admin, "ADMIN");
    const adminCtx = await requireOrganisationAccess(admin, orgId(A.org));
    const owner = (await listMembers(adminCtx)).find((m) => m.role === "OWNER");
    if (!owner) throw new Error("fixture");
    await expectCode(
      changeMemberRole(adminCtx, memId(owner.membershipId), { role: "VIEWER" }),
      "FORBIDDEN",
    );
    await expectCode(removeMember(adminCtx, memId(owner.membershipId)), "FORBIDDEN");
    await expectCode(
      setMemberStatus(adminCtx, memId(owner.membershipId), { status: "SUSPENDED" }),
      "FORBIDDEN",
    );
  });

  it("members cannot change their own role", async () => {
    const admin = await makeUser("admin3");
    const membershipId = await addMember(A.orgCtx, admin, "ADMIN");
    const adminCtx = await requireOrganisationAccess(admin, orgId(A.org));
    await expectCode(
      changeMemberRole(adminCtx, memId(membershipId), { role: "VIEWER" }),
      "FORBIDDEN",
    );
  });

  it("a MARKETING member cannot grant roles (no member.manage)", async () => {
    const marketer = await makeUser("marketer");
    await addMember(A.orgCtx, marketer, "MARKETING");
    const viewer = await makeUser("viewer2");
    const viewerMembership = await addMember(A.orgCtx, viewer, "VIEWER");
    const ctx = await requireOrganisationAccess(marketer, orgId(A.org));
    await expectCode(
      changeMemberRole(ctx, memId(viewerMembership), { role: "ADMIN" }),
      "FORBIDDEN",
    );
  });

  it("ownership transfer needs step-up auth and an active ADMIN target", async () => {
    const admin = await makeUser("heir");
    const adminMembership = await addMember(A.orgCtx, admin, "ADMIN");
    await expectCode(
      transferOwnership(A.orgCtx, memId(adminMembership)),
      "REAUTHENTICATION_REQUIRED",
    );

    const stepped = await requireOrganisationAccess(
      { ...A.user, recentlyAuthenticated: true },
      orgId(A.org),
    );
    const viewer = await makeUser("not-admin");
    const viewerMembership = await addMember(A.orgCtx, viewer, "VIEWER");
    await expectCode(transferOwnership(stepped, memId(viewerMembership)), "CONFLICT");

    await transferOwnership(stepped, memId(adminMembership));
    const roles = Object.fromEntries((await listMembers(stepped)).map((m) => [m.userId, m.role]));
    expect(roles[admin.userId]).toBe("OWNER");
    expect(roles[A.user.userId]).toBe("ADMIN");
  });

  it("an ADMIN cannot transfer ownership", async () => {
    const admin = await makeUser("admin4");
    await addMember(A.orgCtx, admin, "ADMIN");
    const ctx = await requireOrganisationAccess(
      { ...admin, recentlyAuthenticated: true },
      orgId(A.org),
    );
    const [owner] = await listMembers(ctx);
    if (!owner) throw new Error("fixture");
    await expectCode(transferOwnership(ctx, memId(owner.membershipId)), "FORBIDDEN");
  });

  it("the OWNER cannot leave without transferring ownership", async () => {
    await expectCode(leaveOrganisation(A.orgCtx), "CONFLICT");
  });
});

describe("T8 store-scoped memberships", () => {
  it("limits a member to their granted stores", async () => {
    const member = await makeUser("scoped");
    const membershipId = await addMember(A.orgCtx, member, "STORE_MANAGER");
    await setMemberStoreAccess(A.orgCtx, memId(membershipId), {
      allStores: false,
      storeIds: [storeId(A.store)],
    });

    const ctx = await requireStoreAccess(member, storeId(A.store));
    expect(ctx.storeId).toBe(A.store);
    await expectCode(requireStoreAccess(member, storeId(storeA2)), "NOT_FOUND");
    expect((await listStores(organisationOf(ctx))).map((s) => s.id)).toEqual([A.store]);
  });
});

describe("T9 membership changes take effect on the next request", () => {
  it("removed members lose access immediately", async () => {
    const member = await makeUser("removed");
    const membershipId = await addMember(A.orgCtx, member, "ADMIN");
    await requireStoreAccess(member, storeId(A.store));
    await removeMember(A.orgCtx, memId(membershipId));
    await expectCode(requireStoreAccess(member, storeId(A.store)), "NOT_FOUND");
    await expectCode(requireOrganisationAccess(member, orgId(A.org)), "NOT_FOUND");
    expect(await listMyOrganisations(member)).toEqual([]);
  });

  it("suspended members lose access until reactivated", async () => {
    const member = await makeUser("suspended");
    const membershipId = await addMember(A.orgCtx, member, "SUPPORT");
    await setMemberStatus(A.orgCtx, memId(membershipId), { status: "SUSPENDED" });
    await expectCode(requireStoreAccess(member, storeId(A.store)), "NOT_FOUND");
    await setMemberStatus(A.orgCtx, memId(membershipId), { status: "ACTIVE" });
    await requireStoreAccess(member, storeId(A.store));
  });

  it("role changes apply to the next request", async () => {
    const member = await makeUser("demoted");
    const membershipId = await addMember(A.orgCtx, member, "STORE_MANAGER");
    const before = await requireStoreAccess(member, storeId(A.store));
    expect(before.permissions.has("store.update")).toBe(true);
    await changeMemberRole(A.orgCtx, memId(membershipId), { role: "VIEWER" });
    const after = await requireStoreAccess(member, storeId(A.store));
    expect(after.role).toBe("VIEWER");
    await expectCode(
      updateStore(after, {
        name: "x",
        locale: "en",
        timezone: "UTC",
        contactEmail: "",
        supportEmail: "",
      }),
      "FORBIDDEN",
    );
  });

  it("members of a suspended organisation lose access", async () => {
    await migratorDb().organisation.update({ where: { id: B.org }, data: { status: "SUSPENDED" } });
    await expectCode(requireStoreAccess(B.user, storeId(B.store)), "NOT_FOUND");
  });
});

describe("invitations", () => {
  it("an unaccepted invitation grants no access", async () => {
    const invitee = await makeUser("invitee");
    await createInvitation(A.orgCtx, { email: invitee.email, role: "STORE_MANAGER" }, acceptUrl);
    await expectCode(requireOrganisationAccess(invitee, orgId(A.org)), "NOT_FOUND");
    await expectCode(requireStoreAccess(invitee, storeId(A.store)), "NOT_FOUND");
  });

  it("stores only the token hash and accepts once, for the invited email only", async () => {
    const invitee = await makeUser("joiner");
    const stranger = await makeUser("stranger");
    await createInvitation(A.orgCtx, { email: invitee.email, role: "DESIGNER" }, acceptUrl);
    const token = latestInviteToken(invitee.email);
    const row = await migratorDb().invitation.findFirstOrThrow({ where: { email: invitee.email } });
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    expect(await previewInvitation(token)).toMatchObject({
      organisationName: "Organisation a",
      role: "DESIGNER",
      usable: true,
    });
    await expectCode(acceptInvitation(stranger, token), "FORBIDDEN");
    await acceptInvitation(invitee, token);
    const ctx = await requireStoreAccess(invitee, storeId(A.store));
    expect(ctx.role).toBe("DESIGNER");
    await expectCode(acceptInvitation(invitee, token), "NOT_FOUND");
  });

  it("revoked and expired invitations cannot be accepted", async () => {
    const invitee = await makeUser("late");
    const { invitationId } = await createInvitation(
      A.orgCtx,
      { email: invitee.email, role: "VIEWER" },
      acceptUrl,
    );
    const revokedToken = latestInviteToken(invitee.email);
    await revokeInvitation(A.orgCtx, invId(invitationId));
    await expectCode(acceptInvitation(invitee, revokedToken), "NOT_FOUND");

    await createInvitation(A.orgCtx, { email: invitee.email, role: "VIEWER" }, acceptUrl);
    const expiredToken = latestInviteToken(invitee.email);
    await migratorDb().invitation.updateMany({
      where: { email: invitee.email, status: "PENDING" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expectCode(acceptInvitation(invitee, expiredToken), "NOT_FOUND");
    await expectCode(requireOrganisationAccess(invitee, orgId(A.org)), "NOT_FOUND");
  });

  it("rejects forged tokens", async () => {
    const invitee = await makeUser("forger");
    await expectCode(acceptInvitation(invitee, "x".repeat(43)), "NOT_FOUND");
    expect(await previewInvitation("not-a-token")).toBeNull();
  });

  it("an ADMIN cannot invite above their own permissions", async () => {
    const manager = await makeUser("mgr-inviter");
    await addMember(A.orgCtx, manager, "STORE_MANAGER");
    const ctx = await requireOrganisationAccess(manager, orgId(A.org));
    await expectCode(
      createInvitation(ctx, { email: "z@example.test", role: "ADMIN" }, acceptUrl),
      "FORBIDDEN",
    );
  });
});

describe("audit", () => {
  it("records tenant events in the tenant's audit log only", async () => {
    const aActions = await migratorDb().auditLog.findMany({
      where: { organisationId: A.org },
      select: { action: true },
    });
    expect(aActions.map((r) => r.action)).toEqual(
      expect.arrayContaining(["organisation.created", "store.created"]),
    );
    const bLeak = await migratorDb().auditLog.count({
      where: { organisationId: B.org, actorId: A.user.userId },
    });
    expect(bLeak).toBe(0);
  });
});

describe("security review regressions", () => {
  it("granting ADMIN requires a recent password confirmation", async () => {
    await expectCode(
      createInvitation(A.orgCtx, { email: "adm@example.test", role: "ADMIN" }, acceptUrl),
      "REAUTHENTICATION_REQUIRED",
    );
    const member = await makeUser("to-promote");
    const membershipId = await addMember(A.orgCtx, member, "VIEWER");
    await expectCode(
      changeMemberRole(A.orgCtx, memId(membershipId), { role: "ADMIN" }),
      "REAUTHENTICATION_REQUIRED",
    );
    const stepped = await requireOrganisationAccess(
      { ...A.user, recentlyAuthenticated: true },
      orgId(A.org),
    );
    await changeMemberRole(stepped, memId(membershipId), { role: "ADMIN" });
    expect((await requireOrganisationAccess(member, orgId(A.org))).role).toBe("ADMIN");
  });

  it("a store-limited admin can't widen store access or invite", async () => {
    const limitedAdmin = await makeUser("limited-admin");
    const adminMembership = await addMember(A.orgCtx, limitedAdmin, "ADMIN");
    await setMemberStoreAccess(A.orgCtx, memId(adminMembership), {
      allStores: false,
      storeIds: [storeId(A.store)],
    });
    const ctx = await requireOrganisationAccess(
      { ...limitedAdmin, recentlyAuthenticated: true },
      orgId(A.org),
    );
    const other = await makeUser("limited-target");
    const otherMembership = await addMember(A.orgCtx, other, "SUPPORT");

    await expectCode(
      setMemberStoreAccess(ctx, memId(otherMembership), { allStores: true }),
      "FORBIDDEN",
    );
    await expectCode(
      setMemberStoreAccess(ctx, memId(otherMembership), {
        allStores: false,
        storeIds: [storeId(storeA2)],
      }),
      "NOT_FOUND",
    );
    await setMemberStoreAccess(ctx, memId(otherMembership), {
      allStores: false,
      storeIds: [storeId(A.store)],
    });
    await expectCode(
      createInvitation(ctx, { email: "alt@example.test", role: "VIEWER" }, acceptUrl),
      "FORBIDDEN",
    );
  });

  it("an invitation dies with its inviter's access", async () => {
    const admin = await makeUser("inviter-admin");
    const adminMembership = await addMember(A.orgCtx, admin, "ADMIN");
    const adminCtx = await requireOrganisationAccess(admin, orgId(A.org));
    const invitee = await makeUser("orphan-invitee");
    await createInvitation(adminCtx, { email: invitee.email, role: "STORE_MANAGER" }, acceptUrl);
    const token = latestInviteToken(invitee.email);
    await removeMember(A.orgCtx, memId(adminMembership));
    await expectCode(acceptInvitation(invitee, token), "NOT_FOUND");
    await expectCode(requireOrganisationAccess(invitee, orgId(A.org)), "NOT_FOUND");
  });

  it("an invitation isn't honoured if the inviter was demoted without the invitation being revoked", async () => {
    const admin = await makeUser("demoted-inviter");
    const adminMembership = await addMember(A.orgCtx, admin, "ADMIN");
    const adminCtx = await requireOrganisationAccess(admin, orgId(A.org));
    const invitee = await makeUser("stale-invitee");
    await createInvitation(adminCtx, { email: invitee.email, role: "STORE_MANAGER" }, acceptUrl);
    const token = latestInviteToken(invitee.email);
    // Bypass the service (which also revokes) to prove the acceptance-time check.
    await migratorDb().membership.update({
      where: { id: adminMembership },
      data: { role: "VIEWER" },
    });
    await expectCode(acceptInvitation(invitee, token), "NOT_FOUND");
  });

  it("concurrent ownership transfer and demotion can't leave the organisation without an owner", async () => {
    const heir = await makeUser("heir-race");
    const heirMembership = await addMember(A.orgCtx, heir, "ADMIN");
    const otherAdmin = await makeUser("other-admin-race");
    await addMember(A.orgCtx, otherAdmin, "ADMIN");
    const ownerCtx = await requireOrganisationAccess(
      { ...A.user, recentlyAuthenticated: true },
      orgId(A.org),
    );
    const adminCtx = await requireOrganisationAccess(
      { ...otherAdmin, recentlyAuthenticated: true },
      orgId(A.org),
    );
    await Promise.allSettled([
      transferOwnership(ownerCtx, memId(heirMembership)),
      changeMemberRole(adminCtx, memId(heirMembership), { role: "VIEWER" }),
    ]);
    const owners = await migratorDb().membership.count({
      where: { organisationId: A.org, role: "OWNER", status: "ACTIVE" },
    });
    expect(owners).toBe(1);
  });
});
