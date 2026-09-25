// Inventory (ADR-0027 §8): the single write path, the append-only ledger,
// the rules for negative stock, tracking and locations, and concurrency.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adjustInventory,
  createLocation,
  createProduct,
  getProduct,
  getProductStock,
  listLocations,
  listMovements,
  moveInventory,
  setInventory,
  setInventoryTracking,
  setLocationActive,
  updateVariants,
} from "../src";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let tenant: Tenant;
let productId: string;
let variantId: string;
let main: string;

const store = () => storeOf(tenant);

async function available(): Promise<number> {
  return (await getProductStock(store(), productId))[0]?.available ?? NaN;
}

async function ledgerSum(): Promise<number> {
  const rows = await migratorDb().inventoryMovement.aggregate({ _sum: { delta: true } });
  return rows._sum.delta ?? 0;
}

beforeEach(async () => {
  await truncateAll();
  tenant = await makeTenant("inv");
  productId = (await createProduct(store(), { title: "Mug", initialStock: 10 })).productId;
  variantId = (await getProduct(store(), productId)).variants[0]?.id ?? "";
  main = (await listLocations(store()))[0]?.id ?? "";
});

afterAll(disconnectTestClients);

describe("adjustments", () => {
  it("records delta, location, reason, note and actor, and the ledger explains the level", async () => {
    await adjustInventory(store(), {
      variantId,
      locationId: main,
      delta: 5,
      reason: "RESTOCK",
      note: "Supplier delivery",
    });
    await adjustInventory(store(), {
      variantId,
      locationId: main,
      delta: -3,
      reason: "CORRECTION",
    });
    expect(await available()).toBe(12);
    expect(await ledgerSum()).toBe(12);
    const { movements } = await listMovements(store(), { productId });
    expect(movements.map((m) => [m.reason, m.delta, m.resultingValue])).toEqual([
      ["CORRECTION", -3, 12],
      ["RESTOCK", 5, 15],
      ["INITIAL", 10, 10],
    ]);
    expect(movements[1]).toMatchObject({
      note: "Supplier delivery",
      actorName: "User inv-owner",
      locationName: "Main location",
    });
  });

  it("refuses to go below zero for variants that can't be oversold", async () => {
    await expect(
      adjustInventory(store(), { variantId, locationId: main, delta: -11, reason: "CORRECTION" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Not enough stock at Main location: 10 available.",
    });
    expect(await available()).toBe(10);
    await updateVariants(store(), productId, {
      variants: [{ variantId, inventoryPolicy: "CONTINUE" }],
    });
    await adjustInventory(store(), {
      variantId,
      locationId: main,
      delta: -11,
      reason: "CORRECTION",
    });
    expect(await available()).toBe(-1);
  });

  it("refuses zero, oversized and unsupported reasons (no fake sales or returns)", async () => {
    await expectCode(
      adjustInventory(store(), { variantId, locationId: main, delta: 0, reason: "RESTOCK" }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      adjustInventory(store(), {
        variantId,
        locationId: main,
        delta: 2_000_000,
        reason: "RESTOCK",
      }),
      "VALIDATION_FAILED",
    );
    for (const reason of ["SALE", "RETURN", "RESERVATION", "FULFILMENT", "INITIAL"]) {
      await expectCode(
        adjustInventory(store(), { variantId, locationId: main, delta: 1, reason }),
        "VALIDATION_FAILED",
      );
    }
  });

  it("set-to converts to a delta under the lock and is a no-op when unchanged", async () => {
    await setInventory(store(), { variantId, locationId: main, quantity: 4, note: "Stock count" });
    await setInventory(store(), { variantId, locationId: main, quantity: 4 });
    expect(await available()).toBe(4);
    const { movements } = await listMovements(store(), { productId });
    expect(movements.map((m) => [m.reason, m.delta])).toEqual([
      ["CORRECTION", -6],
      ["INITIAL", 10],
    ]);
  });

  it("untracked variants and inactive locations take no adjustments", async () => {
    const { locationId: second } = await createLocation(store(), {
      name: "Pop-up",
      code: "POP",
      countryCode: "IN",
    });
    await setLocationActive(store(), second, false);
    await expectCode(
      adjustInventory(store(), { variantId, locationId: second, delta: 1, reason: "RESTOCK" }),
      "CONFLICT",
    );
    await setInventoryTracking(store(), variantId, false);
    await expectCode(
      adjustInventory(store(), { variantId, locationId: main, delta: 1, reason: "RESTOCK" }),
      "CONFLICT",
    );
    await setInventoryTracking(store(), variantId, true);
    expect(await available()).toBe(10);
  });

  it("the ledger is append-only for the app role", async () => {
    const before = await migratorDb().inventoryMovement.count();
    await adjustInventory(store(), { variantId, locationId: main, delta: 1, reason: "RESTOCK" });
    expect(await migratorDb().inventoryMovement.count()).toBe(before + 1);
  });
});

describe("transfers", () => {
  it("moves stock between locations with a shared reference", async () => {
    const { locationId: shop } = await createLocation(store(), {
      name: "Shop",
      code: "SHOP",
      countryCode: "IN",
    });
    await moveInventory(store(), {
      variantId,
      fromLocationId: main,
      toLocationId: shop,
      quantity: 4,
    });
    const stock = (await getProductStock(store(), productId))[0];
    expect(stock?.levels.map((l) => [l.locationCode, l.available])).toEqual([
      ["MAIN", 6],
      ["SHOP", 4],
    ]);
    const transfers = await migratorDb().inventoryMovement.findMany({
      where: { reason: "TRANSFER" },
    });
    expect(transfers).toHaveLength(2);
    expect(new Set(transfers.map((t) => t.referenceId)).size).toBe(1);
    await expectCode(
      moveInventory(store(), { variantId, fromLocationId: shop, toLocationId: main, quantity: 5 }),
      "CONFLICT",
    );
    await expectCode(
      moveInventory(store(), { variantId, fromLocationId: shop, toLocationId: shop, quantity: 1 }),
      "VALIDATION_FAILED",
    );
  });
});

describe("locations", () => {
  it("can't deactivate the last active location or one that holds stock", async () => {
    await expectCode(setLocationActive(store(), main, false), "CONFLICT");
    const { locationId: shop } = await createLocation(store(), {
      name: "Shop",
      code: "SHOP",
      countryCode: "IN",
    });
    await expectCode(setLocationActive(store(), main, false), "CONFLICT"); // still holds 10
    await moveInventory(store(), {
      variantId,
      fromLocationId: main,
      toLocationId: shop,
      quantity: 10,
    });
    await setLocationActive(store(), main, false);
    await expectCode(setLocationActive(store(), shop, false), "CONFLICT");
    expect(await migratorDb().location.count()).toBe(2);
  });

  it("codes are unique per store", async () => {
    await expect(
      createLocation(store(), { name: "Dup", code: "main", countryCode: "IN" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      fieldErrors: { code: "That code is already in use." },
    });
  });
});

describe("concurrency (no read-modify-write)", () => {
  it("20 parallel decrements of 1 on 10 units: exactly 10 succeed, stock ends at 0", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        adjustInventory(store(), { variantId, locationId: main, delta: -1, reason: "CORRECTION" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await available()).toBe(0);
    expect(await ledgerSum()).toBe(0);
    const level = await migratorDb().inventoryLevel.findFirstOrThrow({
      where: { inventoryItem: { variantId: parseTypeId("variant", variantId) ?? "" } },
    });
    expect(level.available).toBe(0);
  });

  it("parallel mixed adjustments add up exactly", async () => {
    const deltas = [5, -3, 7, -2, 4, -1, 6, -5, 3, -4];
    await Promise.all(
      deltas.map((delta) =>
        adjustInventory(store(), { variantId, locationId: main, delta, reason: "CORRECTION" }),
      ),
    );
    expect(await available()).toBe(10 + deltas.reduce((a, b) => a + b, 0));
    expect(await ledgerSum()).toBe(await available());
  });

  it("opposite transfers in parallel don't deadlock and conserve stock", async () => {
    const { locationId: shop } = await createLocation(store(), {
      name: "Shop",
      code: "SHOP",
      countryCode: "IN",
    });
    await moveInventory(store(), {
      variantId,
      fromLocationId: main,
      toLocationId: shop,
      quantity: 5,
    });
    const moves = Array.from({ length: 10 }, (_, i) =>
      moveInventory(store(), {
        variantId,
        fromLocationId: i % 2 ? main : shop,
        toLocationId: i % 2 ? shop : main,
        quantity: 1,
      }),
    );
    const results = await Promise.allSettled(moves);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const levels = (await getProductStock(store(), productId))[0]?.levels ?? [];
    expect(levels.reduce((n, l) => n + l.available, 0)).toBe(10);
  });

  it("first stock at a new location from parallel requests creates one level row", async () => {
    const { locationId: shop } = await createLocation(store(), {
      name: "Shop",
      code: "SHOP",
      countryCode: "IN",
    });
    await Promise.all(
      Array.from({ length: 8 }, () =>
        adjustInventory(store(), { variantId, locationId: shop, delta: 1, reason: "RESTOCK" }),
      ),
    );
    expect(await migratorDb().inventoryLevel.count()).toBe(2);
    const levels = (await getProductStock(store(), productId))[0]?.levels ?? [];
    expect(levels.find((l) => l.locationCode === "SHOP")?.available).toBe(8);
  });
});
