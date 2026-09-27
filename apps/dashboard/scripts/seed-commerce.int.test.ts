// The Milestone 6 development seed converges: a store left part-seeded (the
// seed failed after shipping, tax and a discount were created, e.g. on an
// unusable PAYMENT_CREDENTIALS_KEYS) is completed by a rerun, and further
// reruns change nothing.
import {
  adjustInventory,
  changeProductOptions,
  createDiscount,
  createProduct,
  createShippingRate,
  createShippingZone,
  createTaxRate,
  getOrder,
  getPaymentSettings,
  getProduct,
  getShippingSettings,
  getTaxSettings,
  listDiscounts,
  listOrders,
  updateTaxSettings,
} from "@storevia/commerce";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  requireStoreAccess,
  type StoreContext,
} from "@storevia/tenancy";
import { toTypeId, uuidv7 } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedAcmeCommerce } from "./seed-commerce";

let ctx: StoreContext;

async function makeStore(): Promise<StoreContext> {
  const user = await migratorDb().user.create({
    data: { id: uuidv7(), email: "seed-owner@example.test", name: "Seed", emailVerified: true },
  });
  const owner = {
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: true,
    recentlyAuthenticated: false,
  };
  const { organisationId } = await createOrganisation(owner, { name: "Seed org" });
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
  const org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  const { storeId } = await createStore(org, {
    name: "Seed flagship",
    slug: "seed-flagship",
    currency: "INR",
    country: "IN",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  });
  return requireStoreAccess(owner, toTypeId("store", storeId));
}

/** The two catalogue products the seeded orders use. */
async function makeProducts(store: StoreContext) {
  const { productId } = await createProduct(store, {
    title: "Stoneware mug",
    price: "450",
    status: "ACTIVE",
  });
  await changeProductOptions(store, productId, {
    options: [{ name: "Colour", values: [{ value: "Sand" }, { value: "Slate" }] }],
  });
  for (const v of (await getProduct(store, productId)).variants) {
    await adjustInventory(store, { variantId: v.id, delta: 40, reason: "RESTOCK" });
  }
  await createProduct(store, {
    title: "Cotton tea towels, set of 2",
    price: "350",
    initialStock: 40,
    status: "ACTIVE",
  });
}

/** What the seed owns, counted. */
async function snapshot(store: StoreContext) {
  const zones = await getShippingSettings(store);
  const tax = await getTaxSettings(store);
  const discounts = await listDiscounts(store);
  const payments = await getPaymentSettings(store);
  const orders = (await listOrders(store, {})).items;
  const details = await Promise.all(orders.map((o) => getOrder(store, o.id)));
  return {
    zones: zones.map((z) => z.name),
    rates: zones.flatMap((z) => z.rates.map((r) => r.name)).sort(),
    taxRates: tax.rates.map((r) => r.name),
    pricesIncludeTax: tax.pricesIncludeTax,
    discounts: discounts.map((d) => d.code).sort(),
    connections: payments.connections.map((c) => `${c.provider}:${c.status}`),
    orders: orders.map((o) => o.email).sort(),
    fulfilments: details.reduce((n, d) => n + d.fulfilments.length, 0),
    refunds: details.reduce((n, d) => n + d.refunds.length, 0),
  };
}

beforeAll(async () => {
  await truncateAll();
  ctx = await makeStore();
  await makeProducts(ctx);
});

afterAll(async () => {
  await disconnectTestClients();
});

describe("seedAcmeCommerce", () => {
  it("completes a part-seeded store on a rerun and then changes nothing", async () => {
    // What the old seed had written before it failed on the credential key:
    // the zone with its first rate, tax, and the first discount code.
    const { zoneId } = await createShippingZone(ctx, { name: "India", countries: "IN" });
    await createShippingRate(ctx, zoneId, { name: "Standard", type: "FLAT", amount: "60" });
    await updateTaxSettings(ctx, { pricesIncludeTax: "on", chargeTaxOnShipping: "" });
    await createTaxRate(ctx, { name: "GST", countryCode: "IN", rate: "18" });
    await createDiscount(ctx, {
      code: "WELCOME10",
      title: "Welcome",
      type: "PERCENTAGE",
      value: "10",
    });

    // A rerun with the same unusable key: everything else that doesn't need
    // it is repaired, and the payment problem is reported, not thrown.
    const key = process.env["PAYMENT_CREDENTIALS_KEYS"];
    process.env["PAYMENT_CREDENTIALS_KEYS"] = "replace-me";
    let blocked;
    try {
      blocked = await seedAcmeCommerce(ctx);
    } finally {
      process.env["PAYMENT_CREDENTIALS_KEYS"] = key;
    }
    expect(blocked.problems.join(" ")).toMatch(/PAYMENT_CREDENTIALS_KEYS can't be used/);
    expect(blocked.created).toEqual([
      "shipping rate Free shipping",
      "discount FLAT200",
      "discount ONEUSE",
      "discount SPRING",
      "discount LAUNCH",
    ]);
    const partial = await snapshot(ctx);
    expect(partial.connections).toEqual([]);
    expect(partial.orders).toEqual([]);

    // With a usable key the next run connects payments and places the orders.
    const repaired = await seedAcmeCommerce(ctx);
    expect(repaired.problems).toEqual([]);
    expect(repaired.created).toEqual([
      "test payments connection",
      "order for asha.rao@example.test",
      "order for vikram.mehta@example.test",
      "shipment of #1002",
      "order for neha.iyer@example.test",
      "refund on #1003",
    ]);
    const complete = await snapshot(ctx);
    expect(complete).toEqual({
      zones: ["India"],
      rates: ["Free shipping", "Standard"],
      taxRates: ["GST"],
      pricesIncludeTax: true,
      discounts: ["FLAT200", "LAUNCH", "ONEUSE", "SPRING", "WELCOME10"],
      connections: ["storevia-test:ACTIVE"],
      orders: ["asha.rao@example.test", "neha.iyer@example.test", "vikram.mehta@example.test"],
      fulfilments: 1,
      refunds: 1,
    });

    // Converged: a further run creates nothing and duplicates nothing.
    const again = await seedAcmeCommerce(ctx);
    expect(again).toEqual({ created: [], problems: [] });
    expect(await snapshot(ctx)).toEqual(complete);
  });
});
