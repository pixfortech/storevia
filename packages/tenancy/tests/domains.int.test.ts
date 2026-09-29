// Custom domains from the merchant's side (ADR-0032): add, verify, make
// primary, remove; entitlement and permission; tenant isolation; and the
// races between two stores, two tabs, and a removal against a check.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { ownershipRecordValue } from "@storevia/domains";
import {
  LocalProvisioner,
  simulateDns,
  type DomainProvisioner,
} from "@storevia/domains/provisioner";
import {
  canonicalRedirectHost,
  invalidateHostCache,
  resolveStoreHost,
} from "@storevia/domains/resolver";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addCustomDomain,
  checkCustomDomain,
  listStoreDomains,
  removeCustomDomain,
  setPrimaryDomain,
} from "../src/domains";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  requireStoreAccess,
  setStorefrontLive,
  type MemberRole,
  type OrganisationContext,
  type Principal,
  type StoreContext,
} from "../src";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";
process.env["DOMAIN_HOSTING_PROVIDER"] = "local";
delete process.env["STOREFRONT_PROTOCOL"];

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

let statePath: string;
let provisioner: LocalProvisioner;
const opts = () => ({ provisioner });

async function newOrganisation(
  name: string,
  subscribed = true,
): Promise<{ owner: Principal; org: OrganisationContext }> {
  const owner = await makeUser(name.toLowerCase());
  const { organisationId } = await createOrganisation(owner, { name });
  const org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  if (subscribed) {
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
  }
  return { owner, org };
}

async function newStore(
  owner: Principal,
  org: OrganisationContext,
  slug: string,
): Promise<StoreContext> {
  const { storeId } = await createStore(org, {
    name: `Store ${slug}`,
    slug,
    currency: "INR",
    country: "IN",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  });
  const ctx = await requireStoreAccess(owner, toTypeId("store", storeId));
  await setStorefrontLive(ctx, true, () => Promise.resolve([]));
  return requireStoreAccess(owner, toTypeId("store", storeId));
}

async function as(org: OrganisationContext, store: StoreContext, role: MemberRole) {
  const user = await makeUser(role.toLowerCase());
  await migratorDb().membership.create({
    data: {
      organisationId: org.organisationId,
      userId: user.userId,
      role,
      status: "ACTIVE",
      allStores: true,
    },
  });
  return requireStoreAccess(user, toTypeId("store", store.storeId));
}

/** DNS that satisfies the ownership record and routing for `hostname`. */
async function pointDns(store: StoreContext, hostname: string) {
  const row = await migratorDb().storeDomain.findFirstOrThrow({
    where: { storeId: store.storeId, hostname },
  });
  simulateDns(
    hostname,
    { txt: [ownershipRecordValue(row.verificationToken)], routed: true },
    statePath,
  );
}

async function activate(store: StoreContext, hostname: string) {
  const added = await addCustomDomain(store, { hostname }, opts());
  await pointDns(store, hostname);
  return checkCustomDomain(store, added.id, opts());
}

/** The same store context, re-issued after a recent password confirmation (step-up, M8). */
function steppedUp(ctx: StoreContext): Promise<StoreContext> {
  return requireStoreAccess(
    { ...ctx.principal, recentlyAuthenticated: true },
    toTypeId("store", ctx.storeId),
  );
}

async function resolve(hostname: string) {
  invalidateHostCache();
  return resolveStoreHost(hostname);
}

let acme: { owner: Principal; org: OrganisationContext };
let store: StoreContext;

beforeEach(async () => {
  await truncateAll();
  statePath = join(mkdtempSync(join(tmpdir(), "storevia-domains-int-")), "state.json");
  provisioner = new LocalProvisioner(statePath);
  acme = await newOrganisation("Acme");
  store = await newStore(acme.owner, acme.org, "clay");
});

afterAll(disconnectTestClients);

describe("adding a domain", () => {
  it("creates a PENDING domain and shows the DNS records to add, registering nothing yet", async () => {
    const domain = await addCustomDomain(store, { hostname: "  Shop.ABC.test. " }, opts());
    expect(domain).toMatchObject({
      hostname: "shop.abc.test",
      kind: "custom",
      status: "PENDING",
      isPrimary: false,
      https: "not_yet",
      message: "The verification record hasn't been found yet.",
    });
    expect(domain.id).toMatch(/^domain_/);
    const row = await migratorDb().storeDomain.findFirstOrThrow({
      where: { hostname: "shop.abc.test" },
    });
    expect(row.verificationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(domain.records).toEqual([
      {
        type: "TXT",
        name: "_storevia-verification.shop.abc.test",
        value: `storevia-verification=${row.verificationToken}`,
        purpose: "ownership",
        state: "waiting",
      },
      {
        type: "CNAME",
        name: "shop.abc.test",
        value: "stores.storevia.test",
        purpose: "routing",
        state: "waiting",
      },
    ]);
    // M8: the hosting provider hears of it only once ownership is proven.
    expect((await provisioner.getDomainStatus("shop.abc.test")).registered).toBe(false);
    // Not ACTIVE, so not served.
    expect(await resolve("shop.abc.test")).toBeNull();
    const audit = await migratorDb().auditLog.findMany({ where: { action: "domain.added" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toEqual({ hostname: "shop.abc.test", status: "PENDING" });
  });

  it.each([
    "https://abc.test",
    "abc.test/shop",
    "abc.test:8443",
    "10.0.0.1",
    "localhost",
    "db.internal",
    "clay.storevia.site",
    "storevia.site",
  ])("refuses %s", async (hostname) => {
    await expectCode(addCustomDomain(store, { hostname }, opts()), "VALIDATION_FAILED");
    expect(await migratorDb().storeDomain.count({ where: { type: "CUSTOM" } })).toBe(0);
  });

  it("a domain is added once per store, and once across Storevia", async () => {
    await addCustomDomain(store, { hostname: "abc.test" }, opts());
    await expect(addCustomDomain(store, { hostname: "ABC.test" }, opts())).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This domain is already added to this store.",
    });
    const rival = await newOrganisation("Rival");
    const rivalStore = await newStore(rival.owner, rival.org, "rival");
    await expect(
      addCustomDomain(rivalStore, { hostname: "abc.test" }, opts()),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This domain is already connected to another Storevia store.",
    });
  });

  it("needs the custom_domain feature and domain.manage, enforced on the server", async () => {
    const free = await newOrganisation("Free", false);
    const freeStore = await newStore(free.owner, free.org, "free");
    await expectCode(
      addCustomDomain(freeStore, { hostname: "free.test" }, opts()),
      "ENTITLEMENT_REQUIRED",
    );
    expect((await listStoreDomains(freeStore)).customDomainsIncluded).toBe(false);
    for (const role of ["STORE_MANAGER", "VIEWER", "SITE_MANAGER"] as const) {
      const member = await as(acme.org, store, role);
      await expectCode(addCustomDomain(member, { hostname: "abc.test" }, opts()), "FORBIDDEN");
      expect((await listStoreDomains(member)).canManage).toBe(false);
    }
    const admin = await as(acme.org, store, "ADMIN");
    await expect(addCustomDomain(admin, { hostname: "abc.test" }, opts())).resolves.toBeTruthy();
  });

  it("a provider failure leaves the domain PENDING for the worker to retry", async () => {
    const added = await addCustomDomain(store, { hostname: "provider-error.abc.test" }, opts());
    await pointDns(store, "provider-error.abc.test");
    const domain = await checkCustomDomain(store, added.id, opts());
    expect(domain).toMatchObject({
      status: "PENDING",
      message: "The hosting provider couldn't add this domain. We'll keep trying.",
    });
    // The records are still shown while the provider is down.
    expect(domain.records.map((r) => r.purpose)).toEqual(["ownership", "routing"]);
  });

  it("is rate limited per store", async () => {
    for (let i = 0; i < 10; i++) {
      await addCustomDomain(store, { hostname: `s${String(i)}.abc.test` }, opts()).catch(
        () => undefined,
      );
    }
    await expectCode(addCustomDomain(store, { hostname: "one-more.test" }, opts()), "RATE_LIMITED");
  });
});

describe("verification and primary", () => {
  it("activates only with the ownership record and routing, then serves and redirects", async () => {
    const added = await addCustomDomain(store, { hostname: "abc.test" }, opts());
    // Routing without the ownership record isn't enough.
    simulateDns("abc.test", { routed: true }, statePath);
    expect(await checkCustomDomain(store, added.id, opts())).toMatchObject({
      status: "PENDING",
    });
    await pointDns(store, "abc.test");
    const active = await checkCustomDomain(store, added.id, opts());
    expect(active).toMatchObject({ status: "ACTIVE", https: "active", message: null });
    expect(active.records.every((r) => r.state === "found")).toBe(true);
    // Idempotent: checking an active domain changes nothing.
    expect(await checkCustomDomain(store, added.id, opts())).toMatchObject({ status: "ACTIVE" });

    // ACTIVE but not primary: served, redirecting to the platform address.
    const secondary = await resolve("abc.test");
    expect(secondary && canonicalRedirectHost(secondary)).toBe("clay.storevia.site");

    await setPrimaryDomain(store, added.id);
    await setPrimaryDomain(store, added.id);
    const primary = await resolve("abc.test");
    expect(primary && canonicalRedirectHost(primary)).toBeNull();
    const platform = await resolve("clay.storevia.site");
    expect(platform && canonicalRedirectHost(platform)).toBe("abc.test");
    const list = await listStoreDomains(store);
    expect(list.primaryHostname).toBe("abc.test");
    expect(list.domains.map((d) => [d.hostname, d.isPrimary])).toEqual([
      ["abc.test", true],
      ["clay.storevia.site", false],
    ]);
    const audit = await migratorDb().auditLog.findMany({
      where: { action: { startsWith: "domain." } },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual([
      "domain.added",
      "domain.verified",
      "domain.primary_changed",
    ]);
    expect(audit[2]?.metadata).toEqual({
      hostname: "abc.test",
      previousHostname: "clay.storevia.site",
    });

    // And back to the platform address.
    const platformId = list.domains.find((d) => d.kind === "platform")?.id;
    await setPrimaryDomain(store, platformId);
    expect((await listStoreDomains(store)).primaryHostname).toBe("clay.storevia.site");
  });

  it("only an ACTIVE domain, or the current platform address, can be primary", async () => {
    const pending = await addCustomDomain(store, { hostname: "abc.test" }, opts());
    await expectCode(setPrimaryDomain(store, pending.id), "CONFLICT");
    await expect(
      migratorDb().storeDomain.updateMany({
        where: { hostname: "abc.test" },
        data: { isPrimary: true },
      }),
    ).rejects.toThrow(/StoreDomain_primary_active|one_primary/);
  });

  it("a FAILED domain can be checked again and recovers", async () => {
    const added = await addCustomDomain(store, { hostname: "abc.test" }, opts());
    await migratorDb().storeDomain.updateMany({
      where: { hostname: "abc.test" },
      data: { status: "FAILED", failureReason: "verification_timeout", checkAttempts: 80 },
    });
    const failed = (await listStoreDomains(store)).domains.find((d) => d.hostname === "abc.test");
    expect(failed).toMatchObject({
      status: "FAILED",
      message: "Domain verification failed. Check the DNS records, then check again.",
    });
    await pointDns(store, "abc.test");
    expect(await checkCustomDomain(store, added.id, opts())).toMatchObject({ status: "ACTIVE" });
  });
});

describe("removal and reuse", () => {
  it("removing a domain needs a recent password confirmation (M8, S5)", async () => {
    const domain = await activate(store, "abc.test");
    await expectCode(removeCustomDomain(store, domain.id, opts()), "REAUTHENTICATION_REQUIRED");
    expect(await migratorDb().storeDomain.count({ where: { hostname: "abc.test" } })).toBe(1);
  });

  it("removing the primary hands primary back to the platform address and stops serving", async () => {
    const domain = await activate(store, "abc.test");
    await setPrimaryDomain(store, domain.id);
    await removeCustomDomain(await steppedUp(store), domain.id, opts());
    expect(await migratorDb().storeDomain.count({ where: { hostname: "abc.test" } })).toBe(0);
    expect((await listStoreDomains(store)).primaryHostname).toBe("clay.storevia.site");
    expect((await provisioner.getDomainStatus("abc.test")).registered).toBe(false);
    expect(await resolve("abc.test")).toBeNull();
    const platform = await resolve("clay.storevia.site");
    expect(platform && canonicalRedirectHost(platform)).toBeNull();
    expect(
      (await migratorDb().auditLog.findMany({ where: { action: "domain.removed" } }))[0]?.metadata,
    ).toEqual({ hostname: "abc.test", status: "ACTIVE" });
    await expectCode(removeCustomDomain(await steppedUp(store), domain.id, opts()), "NOT_FOUND");
  });

  it("another store can claim a removed domain, but must prove ownership afresh", async () => {
    await activate(store, "abc.test");
    const oldToken = (
      await migratorDb().storeDomain.findFirstOrThrow({ where: { hostname: "abc.test" } })
    ).verificationToken;
    const listed = await listStoreDomains(store);
    const custom = listed.domains.find((d) => d.kind === "custom");
    await removeCustomDomain(await steppedUp(store), custom?.id, opts());

    const buyer = await newOrganisation("Buyer");
    const buyerStore = await newStore(buyer.owner, buyer.org, "buyer");
    const claimed = await addCustomDomain(buyerStore, { hostname: "abc.test" }, opts());
    const row = await migratorDb().storeDomain.findFirstOrThrow({
      where: { hostname: "abc.test" },
    });
    expect(row.verificationToken).not.toBe(oldToken);
    // The previous owner's DNS record is still there: it proves nothing now.
    expect(await checkCustomDomain(buyerStore, claimed.id, opts())).toMatchObject({
      status: "PENDING",
      message: "The verification record hasn't been found yet.",
    });
  });

  it("an unproven claim can't hold someone else's domain forever (M8, S2)", async () => {
    // A squatter adds a domain it doesn't own and never proves it.
    const squatter = await newOrganisation("Squatter");
    const squatterStore = await newStore(squatter.owner, squatter.org, "squat");
    await addCustomDomain(squatterStore, { hostname: "victim.test" }, opts());
    // Nothing reached the hosting provider.
    expect((await provisioner.getDomainStatus("victim.test")).registered).toBe(false);

    // Recent: the real owner is told it's taken (by whom isn't said).
    await expect(addCustomDomain(store, { hostname: "victim.test" }, opts())).rejects.toMatchObject(
      { code: "CONFLICT", message: "This domain is already connected to another Storevia store." },
    );
    // After 72 hours unverified, the owner's add releases it.
    await migratorDb().storeDomain.updateMany({
      where: { hostname: "victim.test" },
      data: { createdAt: new Date(Date.now() - 73 * 3600_000) },
    });
    const mine = await addCustomDomain(store, { hostname: "victim.test" }, opts());
    expect(mine.hostname).toBe("victim.test");
    const rows = await migratorDb().storeDomain.findMany({ where: { hostname: "victim.test" } });
    expect(rows.map((r) => r.storeId)).toEqual([store.storeId]);
    // The squatter's audit log says what happened; it never learns who.
    const released = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "domain.released", organisationId: squatter.org.organisationId },
    });
    expect(released).toMatchObject({ actorType: "SYSTEM", storeId: squatterStore.storeId });
    expect(JSON.stringify(released.metadata)).not.toContain(store.storeId);
  });

  it("a FAILED claim is released at once; an ACTIVE domain never is (M8, S2)", async () => {
    const other = await newOrganisation("Other");
    const otherStore = await newStore(other.owner, other.org, "other");
    await addCustomDomain(otherStore, { hostname: "failed.test" }, opts());
    await migratorDb().storeDomain.updateMany({
      where: { hostname: "failed.test" },
      data: { status: "FAILED", failureReason: "verification_timeout" },
    });
    await expect(addCustomDomain(store, { hostname: "failed.test" }, opts())).resolves.toBeTruthy();

    await activate(otherStore, "owned.test");
    await migratorDb().storeDomain.updateMany({
      where: { hostname: "owned.test" },
      data: { createdAt: new Date(Date.now() - 400 * 24 * 3600_000) },
    });
    await expect(addCustomDomain(store, { hostname: "owned.test" }, opts())).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(
      (await migratorDb().storeDomain.findFirstOrThrow({ where: { hostname: "owned.test" } }))
        .storeId,
    ).toBe(otherStore.storeId);
  });

  it("the release function can't be pointed at anything but a stale claim", async () => {
    // Called directly by the app role: an ACTIVE domain survives.
    const other = await newOrganisation("Direct");
    const otherStore = await newStore(other.owner, other.org, "direct");
    await activate(otherStore, "direct.test");
    const { withTenant } = await import("@storevia/database");
    const rows = await withTenant(
      { organisationId: store.organisationId, storeId: store.storeId, userId: store.userId },
      (tx) => tx.$queryRaw<{ released: boolean }[]>`
        SELECT app_release_stale_domain('direct.test') AS released`,
    );
    expect(rows[0]?.released).toBe(false);
    expect(await migratorDb().storeDomain.count({ where: { hostname: "direct.test" } })).toBe(1);
  });

  it("Storevia addresses can't be removed", async () => {
    const platform = (await listStoreDomains(store)).domains.find((d) => d.kind === "platform");
    await expectCode(removeCustomDomain(await steppedUp(store), platform?.id, opts()), "CONFLICT");
  });
});

describe("tenant isolation", () => {
  it("another store's domain ids are indistinguishable from missing ones", async () => {
    const rival = await newOrganisation("Rival");
    const rivalStore = await newStore(rival.owner, rival.org, "rival");
    const theirs = await activate(rivalStore, "rival.test");
    await expectCode(checkCustomDomain(store, theirs.id, opts()), "NOT_FOUND");
    await expectCode(setPrimaryDomain(store, theirs.id), "NOT_FOUND");
    await expectCode(removeCustomDomain(await steppedUp(store), theirs.id, opts()), "NOT_FOUND");
    await expectCode(checkCustomDomain(store, "domain_bogus", opts()), "NOT_FOUND");
    await expectCode(setPrimaryDomain(store, toTypeId("store", store.storeId)), "NOT_FOUND");
    expect((await listStoreDomains(store)).domains.map((d) => d.hostname)).toEqual([
      "clay.storevia.site",
    ]);
    // A second store in the same organisation can't touch it either.
    const sibling = await newStore(acme.owner, acme.org, "sibling");
    const mine = await activate(store, "mine.test");
    await expectCode(removeCustomDomain(await steppedUp(sibling), mine.id, opts()), "NOT_FOUND");
    expect((await listStoreDomains(rivalStore)).domains.map((d) => d.status)).toEqual([
      "ACTIVE",
      "ACTIVE",
    ]);
  });
});

describe("races", () => {
  it("two stores claiming the same domain at once: exactly one wins", async () => {
    const rival = await newOrganisation("Rival");
    const rivalStore = await newStore(rival.owner, rival.org, "rival");
    const results = await Promise.allSettled([
      addCustomDomain(store, { hostname: "contested.test" }, opts()),
      addCustomDomain(rivalStore, { hostname: "contested.test" }, opts()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "CONFLICT" });
    expect(await migratorDb().storeDomain.count({ where: { hostname: "contested.test" } })).toBe(1);
  });

  it("two tabs switching primary at once leave exactly one primary", async () => {
    const a = await activate(store, "a.test");
    const b = await activate(store, "b.test");
    for (let round = 0; round < 5; round++) {
      await Promise.allSettled([setPrimaryDomain(store, a.id), setPrimaryDomain(store, b.id)]);
      const primaries = await migratorDb().storeDomain.findMany({
        where: { storeId: store.storeId, isPrimary: true },
      });
      expect(primaries).toHaveLength(1);
      expect(["a.test", "b.test"]).toContain(primaries[0]?.hostname);
    }
  });

  it("a removal during a check waits for it, and the domain ends removed everywhere", async () => {
    const added = await addCustomDomain(store, { hostname: "abc.test" }, opts());
    await pointDns(store, "abc.test");
    const slow: DomainProvisioner = {
      key: "local",
      addDomain: (h) => provisioner.addDomain(h),
      removeDomain: (h) => provisioner.removeDomain(h),
      verifyDomain: (h) => provisioner.verifyDomain(h),
      lookupTxt: (n) => provisioner.lookupTxt(n),
      defaultRoutingRecord: (h) => provisioner.defaultRoutingRecord(h),
      getDomainStatus: async (h) => {
        await new Promise((r) => setTimeout(r, 1500));
        return provisioner.getDomainStatus(h);
      },
    };
    const check = checkCustomDomain(store, added.id, { provisioner: slow });
    await new Promise((r) => setTimeout(r, 300));
    const removal = removeCustomDomain(await steppedUp(store), added.id, opts());
    const [checked, removed] = await Promise.allSettled([check, removal]);
    expect(checked.status === "rejected" ? checked.reason : "ok").toBe("ok");
    expect(removed.status === "rejected" ? removed.reason : "ok").toBe("ok");
    expect(await migratorDb().storeDomain.count({ where: { hostname: "abc.test" } })).toBe(0);
    expect((await provisioner.getDomainStatus("abc.test")).registered).toBe(false);
  });

  it("a check during a slow removal fails fast instead of queueing", async () => {
    const domain = await activate(store, "abc.test");
    const slowRemove: DomainProvisioner = {
      key: "local",
      addDomain: (h) => provisioner.addDomain(h),
      getDomainStatus: (h) => provisioner.getDomainStatus(h),
      verifyDomain: (h) => provisioner.verifyDomain(h),
      lookupTxt: (n) => provisioner.lookupTxt(n),
      defaultRoutingRecord: (h) => provisioner.defaultRoutingRecord(h),
      removeDomain: async (h) => {
        await new Promise((r) => setTimeout(r, 5000));
        return provisioner.removeDomain(h);
      },
    };
    const removal = removeCustomDomain(await steppedUp(store), domain.id, {
      provisioner: slowRemove,
    });
    await new Promise((r) => setTimeout(r, 300));
    await expect(checkCustomDomain(store, domain.id, opts())).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This domain is being checked right now. Try again in a moment.",
    });
    await removal;
    expect(await migratorDb().storeDomain.count({ where: { hostname: "abc.test" } })).toBe(0);
  });
});

describe("invalidation events", () => {
  it("state changes emit domain.changed for the affected hostnames; unchanged checks emit nothing", async () => {
    const added = await addCustomDomain(store, { hostname: "abc.test" }, opts());
    const events = () =>
      migratorDb().outboxEvent.findMany({
        where: { type: "domain.changed", storeId: store.storeId },
        orderBy: { occurredAt: "asc" },
        select: { payload: true },
      });
    await migratorDb().outboxEvent.deleteMany({});
    // Still waiting: attempts and lastCheckedAt change, nothing public does.
    await checkCustomDomain(store, added.id, opts());
    expect(await events()).toEqual([]);
    await pointDns(store, "abc.test");
    await checkCustomDomain(store, added.id, opts());
    expect((await events()).map((e) => e.payload)).toEqual([
      { hostnames: ["abc.test", "abc.test"] },
    ]);
    await migratorDb().outboxEvent.deleteMany({});
    await setPrimaryDomain(store, added.id);
    const hostnames = (await events()).flatMap(
      (e) => (e.payload as { hostnames: string[] }).hostnames,
    );
    expect(new Set(hostnames)).toEqual(new Set(["abc.test", "clay.storevia.site"]));
  });
});
