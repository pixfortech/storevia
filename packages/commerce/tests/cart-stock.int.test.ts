// Cart quantities against stock (M6 correction): the cart and the product
// page use app_variant_stock(), the rule checkout reserves by: a tracked
// DENY variant can be bought up to the largest `available` at one active,
// online-fulfilling location. Quantities are refused, never clamped, and a
// line that stock can no longer supply is marked and kept out of the
// subtotal until the shopper changes it. The cart never reserves.
import { countQueries, disconnectTestClients, truncateAll } from "@storevia/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adjustInventory,
  createLocation,
  createProduct,
  getProduct,
  listLocations,
  setInventoryTracking,
  updateLocation,
  updateVariants,
} from "../src";
import {
  addToCart,
  readCart,
  readStorefront,
  removeCartLine,
  updateCartLine,
  type CartStore,
} from "../src/storefront";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let a: Tenant;
let b: Tenant;
let storeA: CartStore;
const ids: Record<string, string> = {};
const variant: Record<string, string> = {};
let ip = 0;

const scopeOf = (tenant: Tenant): CartStore => {
  const s = storeOf(tenant);
  return { organisationId: s.organisationId, storeId: s.storeId, currency: "INR" };
};
const ctx = (token: string | null, store = storeA) => {
  ip += 1;
  return { store, token, clientIp: `203.0.113.${String(ip % 250)}` };
};

async function product(tenant: Tenant, key: string, stock: number, price = "250") {
  const { productId } = await createProduct(storeOf(tenant), {
    title: `Item ${key}`,
    price,
    initialStock: stock,
    status: "ACTIVE",
  });
  ids[key] = productId;
  variant[key] = (await getProduct(storeOf(tenant), productId)).variants[0]?.id ?? "";
}

const adjust = (key: string, delta: number, locationId?: string, tenant = a) =>
  adjustInventory(storeOf(tenant), {
    variantId: variant[key],
    delta,
    reason: "CORRECTION",
    ...(locationId ? { locationId } : {}),
  });

const lineOf = async (token: string | null, key: string) =>
  (await readCart(storeA, token)).lines.find((l) => l.variantId === variant[key]);

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("stock-a");
  b = await makeTenant("stock-b");
  storeA = scopeOf(a);
  await product(a, "saucepan", 2);
  await product(a, "oversell", 0);
  await updateVariants(storeOf(a), ids["oversell"] ?? "", {
    variants: [{ variantId: variant["oversell"], inventoryPolicy: "CONTINUE" }],
  });
  await product(a, "untracked", 0);
  await setInventoryTracking(storeOf(a), variant["untracked"] ?? "", false);
  await product(b, "theirs", 50);
});

afterAll(disconnectTestClients);

describe("quantities against stock", () => {
  it("stock 2: 1, then 2 are accepted; 3 is refused and the line keeps 2; sold out marks the line", async () => {
    const { newToken: token, cart } = await addToCart(ctx(null), {
      variantId: variant["saucepan"],
      quantity: 1,
    });
    expect(cart.lines[0]).toMatchObject({ quantity: 1, stock: "limited", maxQuantity: 2 });

    const two = await updateCartLine(ctx(token), { variantId: variant["saucepan"], quantity: 2 });
    expect(two.cart.lines[0]).toMatchObject({ quantity: 2, available: true, stock: "limited" });

    await expect(
      updateCartLine(ctx(token), { variantId: variant["saucepan"], quantity: 3 }),
    ).rejects.toMatchObject({ reason: "stock", available: 2, message: "Only 2 are available." });
    expect((await lineOf(token, "saucepan"))?.quantity).toBe(2);
    // Adding more counts what's already in the cart.
    await expect(
      addToCart(ctx(token), { variantId: variant["saucepan"], quantity: 1 }),
    ).rejects.toMatchObject({
      reason: "stock",
      message: "Only 2 are available. You already have 2 in your cart.",
    });

    // The stock goes: the line stays, marked, out of the subtotal.
    await adjust("saucepan", -2);
    const soldOut = await readCart(storeA, token);
    expect(soldOut.lines[0]).toMatchObject({ quantity: 2, available: false, stock: "sold_out" });
    expect(soldOut.subtotal.amount).toBe("0");
    expect(soldOut.hasUnavailableLines).toBe(true);
    // Only removing it (or restock) resolves it.
    await expect(
      updateCartLine(ctx(token), { variantId: variant["saucepan"], quantity: 1 }),
    ).rejects.toMatchObject({ reason: "sold_out" });
    await expect(
      addToCart(ctx(null), { variantId: variant["saucepan"], quantity: 1 }),
    ).rejects.toMatchObject({ reason: "sold_out", message: "This item is sold out." });
    const removed = await removeCartLine(ctx(token), { variantId: variant["saucepan"] });
    expect(removed.cart.hasUnavailableLines).toBe(false);
    await adjust("saucepan", 2);
  });

  it("a line above what's left is 'insufficient' until lowered", async () => {
    const { newToken: token } = await addToCart(ctx(null), {
      variantId: variant["saucepan"],
      quantity: 2,
    });
    await adjust("saucepan", -1);
    expect(await lineOf(token, "saucepan")).toMatchObject({
      quantity: 2,
      available: false,
      stock: "insufficient",
      maxQuantity: 1,
    });
    const lowered = await updateCartLine(ctx(token), {
      variantId: variant["saucepan"],
      quantity: 1,
    });
    expect(lowered.cart.lines[0]).toMatchObject({ quantity: 1, available: true });
    expect(lowered.cart.hasUnavailableLines).toBe(false);
    await adjust("saucepan", 1);
  });

  it("oversellable and untracked variants are limited only by the cart's 99", async () => {
    for (const key of ["oversell", "untracked"]) {
      const { newToken, cart } = await addToCart(ctx(null), {
        variantId: variant[key],
        quantity: 60,
      });
      expect(cart.lines[0]).toMatchObject({ quantity: 60, available: true, stock: "in_stock" });
      expect(cart.lines[0]?.maxQuantity).toBe(99);
      const full = await updateCartLine(ctx(newToken), { variantId: variant[key], quantity: 99 });
      expect(full.cart.lines[0]?.quantity).toBe(99);
      await expect(
        updateCartLine(ctx(newToken), { variantId: variant[key], quantity: 100 }),
      ).rejects.toMatchObject({ reason: "limit" });
      await expect(
        addToCart(ctx(newToken), { variantId: variant[key], quantity: 1 }),
      ).rejects.toMatchObject({ reason: "limit" });
      expect((await lineOf(newToken, key))?.quantity).toBe(99);
    }
  });

  it("forged quantities are refused, never coerced", async () => {
    const { newToken } = await addToCart(ctx(null), { variantId: variant["saucepan"] });
    for (const quantity of ["abc", "2.5", "-1", "", "1e3", 3.5, "0x10"]) {
      await expectCode(
        updateCartLine(ctx(newToken), { variantId: variant["saucepan"], quantity }),
        "VALIDATION_FAILED",
      );
    }
    for (const quantity of ["0", 0]) {
      await expectCode(
        addToCart(ctx(newToken), { variantId: variant["saucepan"], quantity }),
        "VALIDATION_FAILED",
      );
    }
    await expect(
      addToCart(ctx(newToken), { variantId: variant["saucepan"], quantity: "1000" }),
    ).rejects.toMatchObject({ reason: "limit" });
    expect((await lineOf(newToken, "saucepan"))?.quantity).toBe(1);
  });
});

describe("one rule with checkout: the largest amount at one online-fulfilling location", () => {
  it("stock split across locations, inactive or not-online locations don't add up", async () => {
    const store = storeOf(a);
    await product(a, "split", 2);
    const main = (await listLocations(store))[0]?.id ?? "";
    const { locationId: second } = await createLocation(store, {
      name: "Second warehouse",
      code: "WH2",
      countryCode: "IN",
    });
    const { locationId: shop } = await createLocation(store, {
      name: "Shop floor",
      code: "SHOP",
      countryCode: "IN",
      fulfilsOnlineOrders: false,
    });
    await adjust("split", 3, second);
    await adjust("split", 10, shop);
    expect(main).not.toBe("");

    // 2 + 3 at two online locations: a line is reserved at one, so 3, not 5.
    const { newToken } = await addToCart(ctx(null), { variantId: variant["split"], quantity: 3 });
    expect((await lineOf(newToken, "split"))?.maxQuantity).toBe(3);
    await expect(
      updateCartLine(ctx(newToken), { variantId: variant["split"], quantity: 4 }),
    ).rejects.toMatchObject({ reason: "stock", available: 3 });

    // Deactivating the second location leaves main's 2 (the shop floor never counts).
    await updateLocation(store, second, {
      name: "Second warehouse",
      code: "WH2",
      countryCode: "IN",
      fulfilsOnlineOrders: false,
    });
    expect(await lineOf(newToken, "split")).toMatchObject({
      stock: "insufficient",
      maxQuantity: 2,
    });
    // …and the product page agrees.
    const page = await readStorefront(storeA, (r) => r.product("item-split"));
    expect(page?.variants[0]?.available).toBe(true);
    await adjust("split", -2, main);
    const gone = await readStorefront(storeA, (r) => r.product("item-split"));
    expect(gone?.variants[0]?.available).toBe(false);
  });
});

describe("tenancy", () => {
  it("another store's variants and stock never reach this store's cart", async () => {
    await expectCode(
      addToCart(ctx(null), { variantId: variant["theirs"], quantity: 1 }),
      "NOT_FOUND",
    );
    const { newToken } = await addToCart(ctx(null), { variantId: variant["saucepan"] });
    await expectCode(
      updateCartLine(ctx(newToken), { variantId: variant["theirs"], quantity: 1 }),
      "NOT_FOUND",
    );
    // Store B's stock changing doesn't move store A's ceiling.
    const before = (await lineOf(newToken, "saucepan"))?.maxQuantity;
    await adjust("theirs", 25, undefined, b);
    expect((await lineOf(newToken, "saucepan"))?.maxQuantity).toBe(before);
    // Store A's cart token means nothing in store B.
    const inB = await readCart(scopeOf(b), newToken);
    expect(inB.lines).toEqual([]);
  });
});

describe("query budget", () => {
  it("reading a cart costs the same queries for 1 or 8 lines", async () => {
    for (let i = 0; i < 7; i++) await product(a, `q${String(i)}`, 20);
    const { newToken: one } = await addToCart(ctx(null), { variantId: variant["q0"] });
    let many: string | null = null;
    for (let i = 0; i < 7; i++) {
      many = (await addToCart(ctx(many), { variantId: variant[`q${String(i)}`] })).newToken ?? many;
    }
    many = (await addToCart(ctx(many), { variantId: variant["saucepan"] })).newToken ?? many;
    const small = await countQueries(() => readCart(storeA, one));
    const large = await countQueries(() => readCart(storeA, many));
    expect(large.result.lines).toHaveLength(8);
    expect(large.queries.length).toBe(small.queries.length);
  });
});
