// Business types through the real services (ADR-0024): persisted per store,
// changeable by authorised members, audited, non-destructive, and never an
// authorisation or entitlement input.
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptInvitation,
  changeStoreBusinessType,
  createInvitation,
  createOrganisation,
  createStore,
  getStore,
  listStores,
  requireOrganisationAccess,
  requireStoreAccess,
  type OrganisationContext,
  type Principal,
} from "../src";

const MAIL_DIR = mkdtempSync(join(tmpdir(), "storevia-business-types-mail-"));
process.env["EMAIL_TRANSPORT"] = "file";
process.env["EMAIL_FILE_DIR"] = MAIL_DIR;
process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";

const acceptUrl = (token: string) => `http://app.localhost:3001/invitations/${token}`;
const storeInput = (slug: string, businessType?: string) => ({
  ...(businessType ? { businessType } : {}),
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

function latestInviteToken(email: string): string {
  const last = readdirSync(MAIL_DIR)
    .filter((f) => f.includes(email) && f.endsWith("-invitation.json"))
    .sort()
    .at(-1);
  if (!last) throw new Error("no invitation");
  const { text } = JSON.parse(readFileSync(join(MAIL_DIR, last), "utf8")) as { text: string };
  return /\/invitations\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
}

let owner: Principal;
let org: OrganisationContext;

async function subscribe(planKey: string): Promise<void> {
  const db = migratorDb();
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  await db.subscription.create({
    data: {
      organisationId: org.organisationId,
      planId: plan.id,
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
    },
  });
}

async function member(role: string): Promise<Principal> {
  const user = await makeUser(role.toLowerCase());
  await createInvitation(org, { email: user.email, role }, acceptUrl);
  await acceptInvitation(user, latestInviteToken(user.email));
  return user;
}

beforeEach(async () => {
  await truncateAll();
  owner = await makeUser("owner");
  const { organisationId } = await createOrganisation(owner, { name: "Acme" });
  org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
});

afterAll(disconnectTestClients);

describe("persistence", () => {
  it("stores the chosen business type, defaulting to an online store", async () => {
    await subscribe("business");
    const { storeId } = await createStore(org, storeInput("the-journal", "PUBLISHING"));
    await createStore(org, storeInput("the-shop"));
    const ctx = await requireStoreAccess(owner, toTypeId("store", storeId));
    expect(ctx.storeBusinessType).toBe("PUBLISHING");
    expect((await getStore(ctx)).businessType).toBe("PUBLISHING");
    const stores = await listStores(org);
    expect(stores.map((s) => [s.slug, s.businessType]).sort()).toEqual([
      ["the-journal", "PUBLISHING"],
      ["the-shop", "ECOMMERCE"],
    ]);
  });

  it("rejects unknown business types", async () => {
    await expectCode(createStore(org, storeInput("the-diner", "RESTAURANT")), "VALIDATION_FAILED");
  });
});

describe("changing the business type", () => {
  it("is audited and deletes nothing", async () => {
    const { storeId } = await createStore(org, storeInput("the-studio", "ECOMMERCE"));
    const ctx = await requireStoreAccess(owner, toTypeId("store", storeId));
    const domainsBefore = await migratorDb().storeDomain.count({ where: { storeId } });
    await changeStoreBusinessType(ctx, { businessType: "PORTFOLIO" });
    const after = await requireStoreAccess(owner, toTypeId("store", storeId));
    expect(after.storeBusinessType).toBe("PORTFOLIO");
    expect(await migratorDb().storeDomain.count({ where: { storeId } })).toBe(domainsBefore);
    expect(
      await migratorDb().store.count({ where: { id: storeId, status: { not: "ARCHIVED" } } }),
    ).toBe(1);
    const audit = await migratorDb().auditLog.findFirst({
      where: { action: "store.business_type_changed" },
    });
    expect(audit?.metadata).toMatchObject({
      businessType: "PORTFOLIO",
      previousBusinessType: "ECOMMERCE",
    });
    await expectCode(
      changeStoreBusinessType(after, { businessType: "HOTEL" }),
      "VALIDATION_FAILED",
    );
  });

  it("needs store.update: editors, authors and viewers can't change it", async () => {
    await subscribe("business");
    const { storeId } = await createStore(org, storeInput("the-review", "PUBLISHING"));
    for (const role of ["EDITOR", "AUTHOR", "VIEWER", "CONTENT_MANAGER"]) {
      const user = await member(role);
      const ctx = await requireStoreAccess(user, toTypeId("store", storeId));
      await expectCode(changeStoreBusinessType(ctx, { businessType: "BUSINESS" }), "FORBIDDEN");
    }
    const siteManager = await member("SITE_MANAGER");
    await changeStoreBusinessType(
      await requireStoreAccess(siteManager, toTypeId("store", storeId)),
      {
        businessType: "BUSINESS",
      },
    );
  });

  it("can't touch another organisation's store", async () => {
    const other = await makeUser("other");
    const { organisationId } = await createOrganisation(other, { name: "Other" });
    const otherOrg = await requireOrganisationAccess(
      other,
      toTypeId("organisation", organisationId),
    );
    const { storeId } = await createStore(otherOrg, storeInput("other-shop"));
    await expectCode(requireStoreAccess(owner, toTypeId("store", storeId)), "NOT_FOUND");
  });
});

describe("business type is not an authorisation or entitlement input", () => {
  it("never grants plan capacity: store limits hold for every type", async () => {
    await createStore(org, storeInput("first-site", "BUSINESS")); // default floor: one store
    for (const type of ["ECOMMERCE", "BUSINESS", "PUBLISHING", "PORTFOLIO"]) {
      await expectCode(
        createStore(org, storeInput(`more-${type.toLowerCase()}`, type)),
        "LIMIT_REACHED",
      );
    }
  });

  it("never grants permissions: a publishing store gives authors no store or member management", async () => {
    await subscribe("business");
    const { storeId } = await createStore(org, storeInput("the-gazette", "PUBLISHING"));
    const author = await member("AUTHOR");
    const orgCtx = await requireOrganisationAccess(
      author,
      toTypeId("organisation", org.organisationId),
    );
    await expectCode(createStore(orgCtx, storeInput("author-store", "PUBLISHING")), "FORBIDDEN");
    await expectCode(
      createInvitation(orgCtx, { email: "friend@example.test", role: "AUTHOR" }, acceptUrl),
      "FORBIDDEN",
    );
    const storeCtx = await requireStoreAccess(author, toTypeId("store", storeId));
    expect(storeCtx.permissions.has("page.publish")).toBe(false);
  });

  it("preset roles follow the subset rule like every other role", async () => {
    await subscribe("business");
    const siteManager = await member("SITE_MANAGER");
    const ctx = await requireOrganisationAccess(
      siteManager,
      toTypeId("organisation", org.organisationId),
    );
    // SITE_MANAGER has no member.manage, so it can't invite anyone.
    await expectCode(
      createInvitation(ctx, { email: "x@example.test", role: "EDITOR" }, acceptUrl),
      "FORBIDDEN",
    );
    // An admin can invite any preset role.
    for (const role of ["INVENTORY_MANAGER", "CONTENT_MANAGER", "EDITOR", "AUTHOR"])
      await member(role);
  });
});
