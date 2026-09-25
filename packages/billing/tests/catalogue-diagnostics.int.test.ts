import { archiveProduct, createProduct, setProductStatus } from "@storevia/commerce";
import { disconnectTestClients, migratorDb } from "@storevia/database/testing";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  requireStoreAccess,
  type Principal,
  type StoreContext,
} from "@storevia/tenancy";
import { requirePlatformStaff, type PlatformContext } from "@storevia/tenancy/platform";
import { toTypeId, uuidv7 } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCatalogueDiagnostics } from "../src/catalogue-diagnostics";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";

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

async function makeTenant(label: string, storeCount: number) {
  const owner = await makeUser(label);
  const { organisationId } = await createOrganisation(owner, { name: `Org ${label}` });
  const org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
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
  const stores: StoreContext[] = [];
  for (let i = 0; i < storeCount; i += 1) {
    const { storeId } = await createStore(org, {
      name: `Store ${label} ${String(i)}`,
      slug: `${label}-${String(i)}-${uuidv7().slice(-12)}`,
      currency: "INR",
      country: "IN",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
    });
    stores.push(await requireStoreAccess(owner, toTypeId("store", storeId)));
  }
  return { organisationId, stores };
}

const at = (stores: readonly StoreContext[], i: number): StoreContext => {
  const store = stores[i];
  if (!store) throw new Error(`no store ${String(i)}`);
  return store;
};

let a: Awaited<ReturnType<typeof makeTenant>>;
let b: Awaited<ReturnType<typeof makeTenant>>;
let support: PlatformContext;

beforeAll(async () => {
  a = await makeTenant("diag-a", 2);
  b = await makeTenant("diag-b", 1);
  const user = await makeUser("support");
  await migratorDb().platformStaff.create({ data: { userId: user.userId, role: "SUPPORT" } });
  support = await requirePlatformStaff(user, {
    requestId: "req-diagnostics",
    ipAddress: "203.0.113.7",
    userAgent: "vitest",
  });
  const shirt = await createProduct(at(a.stores, 0), { title: "Shirt", price: "499" });
  await setProductStatus(at(a.stores, 0), shirt.productId, "ACTIVE");
  const old = await createProduct(at(a.stores, 0), { title: "Old shirt" });
  await archiveProduct(at(a.stores, 0), old.productId);
  await createProduct(at(a.stores, 1), { title: "Mug" });
  for (const title of ["B1", "B2", "B3"]) await createProduct(at(b.stores, 0), { title });
});

afterAll(async () => {
  await disconnectTestClients();
});

describe("getCatalogueDiagnostics", () => {
  it("counts one organisation's catalogue, per status and per store", async () => {
    const d = await getCatalogueDiagnostics(support, toTypeId("organisation", a.organisationId));
    expect(d.products).toEqual({ active: 1, draft: 1, archived: 1 });
    expect(d.variants).toBe(3);
    expect(d.overReservedLevels).toBe(0);
    expect(d.negativeLevels).toBe(0);
    expect(d.media).toEqual({ ready: 0, inProgress: 0, rejected: 0, bytes: 0n });
    expect(d.stores).toEqual(
      [0, 1].map((i) => ({
        storeId: toTypeId("store", at(a.stores, i).storeId),
        name: at(a.stores, i).storeName,
        products: i === 0 ? 2 : 1,
      })),
    );
  });

  it("never mixes in another organisation's rows", async () => {
    const d = await getCatalogueDiagnostics(support, toTypeId("organisation", b.organisationId));
    expect(d.products).toEqual({ active: 0, draft: 3, archived: 0 });
    expect(d.stores).toHaveLength(1);
  });

  it("refuses malformed or foreign-typed ids", async () => {
    await expect(getCatalogueDiagnostics(support, "not-an-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      getCatalogueDiagnostics(support, toTypeId("store", at(a.stores, 0).storeId)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
