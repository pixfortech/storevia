// Plan enforcement through the real tenancy services (ADR-0022): store_count,
// staff_accounts and advanced_permissions. Plans are given as real
// subscription rows; enforcement is the production path.
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTenant } from "@storevia/database";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { getUsage } from "@storevia/entitlements";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptInvitation,
  archiveStore,
  createInvitation,
  createOrganisation,
  createStore,
  getAllowance,
  getOrganisationBilling,
  listMembers,
  listStores,
  removeMember,
  requireOrganisationAccess,
  requireStoreAccess,
  scopeOf,
  setMemberStoreAccess,
  updateStore,
  type OrganisationContext,
  type Principal,
} from "../src";

const MAIL_DIR = mkdtempSync(join(tmpdir(), "storevia-entitlements-mail-"));
process.env["EMAIL_TRANSPORT"] = "file";
process.env["EMAIL_FILE_DIR"] = MAIL_DIR;
process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";

const acceptUrl = (token: string) => `http://app.localhost:3001/invitations/${token}`;
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

async function makeOrg(owner: Principal, name: string): Promise<OrganisationContext> {
  const { organisationId } = await createOrganisation(owner, { name });
  return requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
}

async function subscribe(organisationId: string, planKey: string): Promise<string> {
  const db = migratorDb();
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  const sub = await db.subscription.create({
    data: {
      organisationId,
      planId: plan.id,
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
    },
  });
  return sub.id;
}

async function changePlan(subscriptionId: string, planKey: string): Promise<void> {
  const db = migratorDb();
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  await db.subscription.update({ where: { id: subscriptionId }, data: { planId: plan.id } });
}

function latestInviteToken(email: string): string {
  const last = readdirSync(MAIL_DIR)
    .filter((f) => f.includes(email) && f.endsWith("-invitation.json"))
    .sort()
    .at(-1);
  if (!last) throw new Error(`no invitation email for ${email}`);
  const { text } = JSON.parse(readFileSync(join(MAIL_DIR, last), "utf8")) as { text: string };
  const token = /\/invitations\/([A-Za-z0-9_-]+)/.exec(text)?.[1];
  if (!token) throw new Error("no token");
  return token;
}

const usage = (ctx: OrganisationContext, key: "store_count" | "staff_accounts") =>
  withTenant(scopeOf(ctx), (tx) => getUsage(tx, ctx.organisationId, key));

let owner: Principal;
let org: OrganisationContext;

beforeEach(async () => {
  await truncateAll();
  owner = await makeUser("owner");
  org = await makeOrg(owner, "Acme");
});

afterAll(disconnectTestClients);

describe("store_count", () => {
  it("the system default allows one store without a plan", async () => {
    await createStore(org, storeInput("first"));
    await expectCode(createStore(org, storeInput("second")), "LIMIT_REACHED");
    expect(await listStores(org)).toHaveLength(1);
    expect(await usage(org, "store_count")).toBe(1n);
  });

  it("the plan limit applies and a rejected creation leaves nothing behind", async () => {
    await subscribe(org.organisationId, "business"); // 3 stores
    for (const slug of ["one", "two", "three"]) await createStore(org, storeInput(slug));
    await expectCode(createStore(org, storeInput("four")), "LIMIT_REACHED");
    expect(await migratorDb().store.count({ where: { slug: "four" } })).toBe(0);
    expect(
      await migratorDb().storeDomain.count({ where: { hostname: { startsWith: "four." } } }),
    ).toBe(0);
  });

  it("concurrent creations cannot exceed the limit", async () => {
    await subscribe(org.organisationId, "business");
    const results = await Promise.allSettled(
      ["conc-1", "conc-2", "conc-3", "conc-4", "conc-5", "conc-6"].map((slug) =>
        createStore(org, storeInput(slug)),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await migratorDb().store.count({ where: { organisationId: org.organisationId } })).toBe(
      3,
    );
  });

  it("archiving a store frees its slot", async () => {
    const { storeId } = await createStore(org, storeInput("old"));
    await archiveStore(await requireStoreAccess(owner, toTypeId("store", storeId)));
    await createStore(org, storeInput("new"));
    expect(await usage(org, "store_count")).toBe(1n);
  });

  it("a forged organisationId in the input cannot spend another organisation's allowance", async () => {
    const other = await makeOrg(owner, "Other");
    await subscribe(other.organisationId, "enterprise");
    await createStore(org, storeInput("full"));
    await expectCode(
      createStore(org, { ...storeInput("forged"), organisationId: other.organisationId }),
      "LIMIT_REACHED",
    );
    expect(
      await migratorDb().store.count({ where: { organisationId: other.organisationId } }),
    ).toBe(0);
  });

  it("a downgrade never deletes stores: they keep working, new ones are blocked", async () => {
    const sub = await subscribe(org.organisationId, "business");
    const ids: string[] = [];
    for (const slug of ["down-1", "down-2", "down-3"])
      ids.push((await createStore(org, storeInput(slug))).storeId);
    await changePlan(sub, "starter"); // 1 store
    expect(await listStores(org)).toHaveLength(3);
    for (const id of ids) {
      const ctx = await requireStoreAccess(owner, toTypeId("store", id));
      await updateStore(ctx, {
        name: "Still editable",
        locale: "en-IN",
        timezone: "Asia/Kolkata",
        contactEmail: "",
        supportEmail: "",
      });
    }
    await expectCode(createStore(org, storeInput("down-4")), "LIMIT_REACHED");
  });
});

describe("staff_accounts", () => {
  it("the owner holds the first seat; the default floor allows no invitations", async () => {
    expect(await usage(org, "staff_accounts")).toBe(1n);
    await expectCode(
      createInvitation(org, { email: "new@example.test", role: "VIEWER" }, acceptUrl),
      "LIMIT_REACHED",
    );
  });

  it("pending invitations count towards the limit; re-inviting the same email doesn't", async () => {
    await subscribe(org.organisationId, "starter"); // 2 seats
    await createInvitation(org, { email: "first@example.test", role: "VIEWER" }, acceptUrl);
    await createInvitation(org, { email: "first@example.test", role: "SUPPORT" }, acceptUrl);
    await expectCode(
      createInvitation(org, { email: "second@example.test", role: "VIEWER" }, acceptUrl),
      "LIMIT_REACHED",
    );
  });

  it("acceptance is enforced: a downgrade after inviting blocks joining", async () => {
    const sub = await subscribe(org.organisationId, "business");
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    await createInvitation(org, { email: alice.email, role: "VIEWER" }, acceptUrl);
    await createInvitation(org, { email: bob.email, role: "VIEWER" }, acceptUrl);
    await acceptInvitation(alice, latestInviteToken(alice.email));
    await changePlan(sub, "starter"); // 2 seats: owner + alice
    await expectCode(acceptInvitation(bob, latestInviteToken(bob.email)), "LIMIT_REACHED");
    // The failed acceptance rolled back: no membership, invitation still pending.
    expect(await listMembers(org)).toHaveLength(2);
    const invitation = await migratorDb().invitation.findFirstOrThrow({
      where: { email: bob.email },
    });
    expect(invitation.status).toBe("PENDING");
  });

  it("concurrent acceptances cannot exceed the limit", async () => {
    const sub = await subscribe(org.organisationId, "business");
    const users = await Promise.all(["p1", "p2", "p3"].map((l) => makeUser(l)));
    for (const u of users)
      await createInvitation(org, { email: u.email, role: "VIEWER" }, acceptUrl);
    await changePlan(sub, "starter"); // one free seat
    const results = await Promise.allSettled(
      users.map((u) => acceptInvitation(u, latestInviteToken(u.email))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await listMembers(org)).toHaveLength(2);
    expect(await usage(org, "staff_accounts")).toBe(2n);
  });

  it("removing a member frees a seat", async () => {
    await subscribe(org.organisationId, "starter");
    const alice = await makeUser("alice");
    await createInvitation(org, { email: alice.email, role: "VIEWER" }, acceptUrl);
    await acceptInvitation(alice, latestInviteToken(alice.email));
    const member = (await listMembers(org)).find((m) => m.userId === alice.userId);
    if (!member) throw new Error("member missing");
    await removeMember(org, toTypeId("membership", member.membershipId));
    expect(await usage(org, "staff_accounts")).toBe(1n);
    await createInvitation(org, { email: "next@example.test", role: "VIEWER" }, acceptUrl);
  });
});

describe("advanced_permissions (BOOLEAN)", () => {
  it("store-limited access requires the feature; removing a restriction does not", async () => {
    const sub = await subscribe(org.organisationId, "business");
    const { storeId } = await createStore(org, storeInput("limited"));
    const alice = await makeUser("alice");
    await createInvitation(org, { email: alice.email, role: "VIEWER" }, acceptUrl);
    await acceptInvitation(alice, latestInviteToken(alice.email));
    const member = (await listMembers(org)).find((m) => m.userId === alice.userId);
    if (!member) throw new Error("member missing");
    const limited = { allStores: false, storeIds: [toTypeId("store", storeId)] };
    await setMemberStoreAccess(org, toTypeId("membership", member.membershipId), limited);

    await changePlan(sub, "starter"); // no advanced_permissions
    await expectCode(
      setMemberStoreAccess(org, toTypeId("membership", member.membershipId), limited),
      "ENTITLEMENT_REQUIRED",
    );
    await setMemberStoreAccess(org, toTypeId("membership", member.membershipId), {
      allStores: true,
    });
  });
});

describe("merchant billing view (read-only)", () => {
  it("owners see plan, usage and limits; the source is only a label", async () => {
    await subscribe(org.organisationId, "starter");
    await createStore(org, storeInput("corner-market"));
    const billing = await getOrganisationBilling(org);
    expect(billing.subscription).toMatchObject({
      planName: "Starter",
      status: "ACTIVE",
      managedBy: "STOREVIA",
    });
    expect(billing.subscription).not.toHaveProperty("source");
    expect(billing.usage).toEqual([
      expect.objectContaining({ key: "store_count", usage: 1n, limit: 1n, overLimit: false }),
      expect.objectContaining({ key: "staff_accounts", usage: 1n, limit: 2n, overLimit: false }),
    ]);
    expect(await getAllowance(org, "store_count")).toMatchObject({ usage: 1n, limit: 1n });
  });

  it("requires billing.read", async () => {
    await subscribe(org.organisationId, "business");
    const viewer = await makeUser("viewer");
    await createInvitation(org, { email: viewer.email, role: "VIEWER" }, acceptUrl);
    await acceptInvitation(viewer, latestInviteToken(viewer.email));
    const viewerCtx = await requireOrganisationAccess(
      viewer,
      toTypeId("organisation", org.organisationId),
    );
    await expectCode(getOrganisationBilling(viewerCtx), "FORBIDDEN");
    await expectCode(getAllowance(viewerCtx, "store_count"), "FORBIDDEN");
  });
});
