// The storefront from the merchant's side (ADR-0028 §3, §11, §12): going
// live, preview links and store address changes with slug history.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { verifyPreviewToken } from "@storevia/domains";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  changeStoreSlug,
  createOrganisation,
  createStore,
  getOnlineStore,
  requireOrganisationAccess,
  requireStoreAccess,
  setStorefrontLive,
  storefrontPreviewUrl,
  type MemberRole,
  type OrganisationContext,
  type Principal,
  type StoreContext,
} from "../src";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";
process.env["STOREFRONT_PREVIEW_SECRET"] = "tenancy-test-preview-secret-000000000000";
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

let owner: Principal;
let org: OrganisationContext;
let store: StoreContext;

async function newStore(slug: string): Promise<StoreContext> {
  const { storeId } = await createStore(org, {
    name: `Store ${slug}`,
    slug,
    currency: "INR",
    country: "IN",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  });
  return requireStoreAccess(owner, toTypeId("store", storeId));
}

async function as(role: MemberRole): Promise<StoreContext> {
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

beforeEach(async () => {
  await truncateAll();
  owner = await makeUser("owner");
  const { organisationId } = await createOrganisation(owner, { name: "Acme" });
  org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
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
  store = await newStore("clay");
});

afterAll(disconnectTestClients);

describe("going live", () => {
  it("new stores start as coming soon; going live and back is audited and idempotent", async () => {
    expect(await getOnlineStore(store)).toEqual({
      status: "DRAFT",
      slug: "clay",
      url: "https://clay.storevia.site/",
      redirectingHosts: [],
    });
    await setStorefrontLive(store, true);
    await setStorefrontLive(store, true);
    expect((await getOnlineStore(store)).status).toBe("ACTIVE");
    await setStorefrontLive(store, false);
    expect((await getOnlineStore(store)).status).toBe("DRAFT");
    const actions = (await migratorDb().auditLog.findMany({ orderBy: { createdAt: "asc" } })).map(
      (a) => a.action,
    );
    expect(actions.filter((a) => a.startsWith("store.storefront"))).toEqual([
      "store.storefront_live",
      "store.storefront_coming_soon",
    ]);
  });

  it("a suspended or archived store can't be taken live by the merchant", async () => {
    await migratorDb().store.update({
      where: { id: store.storeId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await expectCode(setStorefrontLive(store, true), "CONFLICT");
    await migratorDb().store.update({
      where: { id: store.storeId },
      data: { status: "ARCHIVED", suspendedAt: null, archivedAt: new Date() },
    });
    await expectCode(setStorefrontLive(store, true), "CONFLICT");
  });

  it("needs store.update", async () => {
    await expectCode(setStorefrontLive(await as("VIEWER"), true), "FORBIDDEN");
    await expectCode(setStorefrontLive(await as("CATALOGUE_MANAGER"), true), "FORBIDDEN");
  });
});

describe("store address changes (slug history)", () => {
  it("moves the primary host and keeps the old one redirecting", async () => {
    expect(await changeStoreSlug(store, { slug: "clay-and-co" })).toEqual({
      hostname: "clay-and-co.storevia.site",
    });
    expect(await getOnlineStore(store)).toMatchObject({
      slug: "clay-and-co",
      url: "https://clay-and-co.storevia.site/",
      redirectingHosts: ["clay.storevia.site"],
    });
    const history = await migratorDb().storeSlugHistory.findMany();
    expect(history.map((h) => h.slug)).toEqual(["clay"]);
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "store.slug_changed" },
    });
    expect(audit.metadata).toEqual({ slug: "clay-and-co", previousSlug: "clay" });
  });

  it("an old address can never be claimed by another store, but its own store can return to it", async () => {
    await changeStoreSlug(store, { slug: "clay-and-co" });
    const other = await newStore("other-shop");
    await expectCode(changeStoreSlug(other, { slug: "clay" }), "CONFLICT");
    await expect(
      createStore(org, {
        name: "X",
        slug: "clay",
        currency: "INR",
        country: "IN",
        locale: "en-IN",
        timezone: "Asia/Kolkata",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await changeStoreSlug(store, { slug: "clay" });
    expect(await getOnlineStore(store)).toMatchObject({
      slug: "clay",
      url: "https://clay.storevia.site/",
      redirectingHosts: ["clay-and-co.storevia.site"],
    });
    expect(await migratorDb().storeDomain.count({ where: { storeId: store.storeId } })).toBe(2);
    expect(
      await migratorDb().storeDomain.count({ where: { storeId: store.storeId, isPrimary: true } }),
    ).toBe(1);
  });

  it("validates the address and needs domain.manage", async () => {
    await expectCode(changeStoreSlug(store, { slug: "admin" }), "VALIDATION_FAILED");
    await expectCode(changeStoreSlug(store, { slug: "Not Valid" }), "VALIDATION_FAILED");
    await expectCode(changeStoreSlug(store, { slug: "my-storevia" }), "VALIDATION_FAILED");
    await expectCode(
      changeStoreSlug(await as("CATALOGUE_MANAGER"), { slug: "clay-2" }),
      "FORBIDDEN",
    );
    await expectCode(changeStoreSlug(await as("VIEWER"), { slug: "clay-2" }), "FORBIDDEN");
  });

  it("a taken address is a conflict", async () => {
    await newStore("taken");
    await expectCode(changeStoreSlug(store, { slug: "taken" }), "CONFLICT");
    expect((await getOnlineStore(store)).slug).toBe("clay");
  });
});

describe("preview links", () => {
  it("carry a store-bound token and need design.edit", async () => {
    const url = new URL(await storefrontPreviewUrl(store, "/products/mug"));
    expect(url.origin).toBe("https://clay.storevia.site");
    expect(url.pathname).toBe("/products/mug");
    const token = url.searchParams.get("preview");
    expect(
      verifyPreviewToken(token, store.storeId, process.env["STOREFRONT_PREVIEW_SECRET"] ?? ""),
    ).not.toBeNull();
    const other = await newStore("elsewhere");
    expect(
      verifyPreviewToken(token, other.storeId, process.env["STOREFRONT_PREVIEW_SECRET"] ?? ""),
    ).toBeNull();
    expect(new URL(await storefrontPreviewUrl(store, "//evil.test/x")).origin).toBe(
      "https://clay.storevia.site",
    );
    await expectCode(storefrontPreviewUrl(await as("VIEWER")), "FORBIDDEN");
  });
});
