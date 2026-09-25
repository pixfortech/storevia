// Tenant isolation for the catalogue (ADR-0027, 03-tenancy §8). Tenant A's
// contexts try every service with tenant B's ids (and store A2's ids from
// store A1): each attempt reads as "not found" and changes nothing.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addProductsToCollection,
  adjustInventory,
  archiveProduct,
  attachProductMedia,
  bulkProductAction,
  changeProductOptions,
  createCollection,
  createLocation,
  createProduct,
  getCollection,
  getProduct,
  getProductStock,
  listLocations,
  listProducts,
  moveInventory,
  setLocationActive,
  updateProduct,
  updateVariants,
} from "../src";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

let A: Tenant;
let B: Tenant;
const ids = {} as Record<
  | "a1Product"
  | "a2Product"
  | "bProduct"
  | "a1Variant"
  | "bVariant"
  | "a2Variant"
  | "a1Collection"
  | "bCollection"
  | "a1Location"
  | "a2Location"
  | "bLocation"
  | "bMedia"
  | "a2Media",
  string
>;

async function mediaFor(tenant: Tenant, store = 0): Promise<string> {
  const s = storeOf(tenant, store);
  const id = crypto.randomUUID();
  await migratorDb().mediaAsset.create({
    data: {
      id,
      organisationId: s.organisationId,
      storeId: s.storeId,
      kind: "IMAGE",
      status: "READY",
      filename: "x.jpg",
      declaredMimeType: "image/jpeg",
      mimeType: "image/jpeg",
      sizeBytes: 10n,
      storageKey: `${s.organisationId}/${s.storeId}/${id}/original.jpg`,
    },
  });
  return toTypeId("media", id);
}

beforeAll(async () => {
  await truncateAll();
  A = await makeTenant("tenant-a", { stores: [{ currency: "INR" }, { currency: "INR" }] });
  B = await makeTenant("tenant-b");
  const a1 = storeOf(A, 0);
  const a2 = storeOf(A, 1);
  const b = storeOf(B);
  ids.a1Product = (
    await createProduct(a1, { title: "A1 shirt", sku: "A1", initialStock: 5 })
  ).productId;
  ids.a2Product = (await createProduct(a2, { title: "A2 shirt", initialStock: 5 })).productId;
  ids.bProduct = (
    await createProduct(b, { title: "B shirt", sku: "B1", initialStock: 5 })
  ).productId;
  ids.a1Variant = (await getProduct(a1, ids.a1Product)).variants[0]?.id ?? "";
  ids.a2Variant = (await getProduct(a2, ids.a2Product)).variants[0]?.id ?? "";
  ids.bVariant = (await getProduct(b, ids.bProduct)).variants[0]?.id ?? "";
  ids.a1Collection = (await createCollection(a1, { title: "A1 picks" })).collectionId;
  ids.bCollection = (await createCollection(b, { title: "B picks" })).collectionId;
  ids.a1Location = (await listLocations(a1))[0]?.id ?? "";
  ids.a2Location = (await listLocations(a2))[0]?.id ?? "";
  ids.bLocation = (await listLocations(b))[0]?.id ?? "";
  ids.bMedia = await mediaFor(B);
  ids.a2Media = await mediaFor(A, 1);
});

afterAll(disconnectTestClients);

describe("cross-tenant ids read as not found", () => {
  it.each([
    ["getProduct", () => getProduct(storeOf(A), ids.bProduct)],
    ["getProduct (other store, same org)", () => getProduct(storeOf(A), ids.a2Product)],
    ["updateProduct", () => updateProduct(storeOf(A), ids.bProduct, { title: "pwned" })],
    ["archiveProduct", () => archiveProduct(storeOf(A), ids.bProduct)],
    ["changeProductOptions", () => changeProductOptions(storeOf(A), ids.bProduct, { options: [] })],
    ["getProductStock", () => getProductStock(storeOf(A), ids.bProduct)],
    ["getCollection", () => getCollection(storeOf(A), ids.bCollection)],
    [
      "adjustInventory: B's variant at A's location",
      () =>
        adjustInventory(storeOf(A), {
          variantId: ids.bVariant,
          locationId: ids.a1Location,
          delta: 5,
          reason: "RESTOCK",
        }),
    ],
    [
      "adjustInventory: A's variant at B's location",
      () =>
        adjustInventory(storeOf(A), {
          variantId: ids.a1Variant,
          locationId: ids.bLocation,
          delta: 5,
          reason: "RESTOCK",
        }),
    ],
    [
      "adjustInventory: A1's variant at A2's location",
      () =>
        adjustInventory(storeOf(A), {
          variantId: ids.a1Variant,
          locationId: ids.a2Location,
          delta: 5,
          reason: "RESTOCK",
        }),
    ],
    [
      "moveInventory into B's location",
      () =>
        moveInventory(storeOf(A), {
          variantId: ids.a1Variant,
          fromLocationId: ids.a1Location,
          toLocationId: ids.bLocation,
          quantity: 1,
        }),
    ],
    [
      "setLocationActive on B's location",
      () => setLocationActive(storeOf(A), ids.bLocation, false),
    ],
    [
      "updateVariants with B's variant under A's product",
      () =>
        updateVariants(storeOf(A), ids.a1Product, {
          variants: [{ variantId: ids.bVariant, price: "1" }],
        }),
    ],
    [
      "updateVariants with A2's variant under A1's product",
      () =>
        updateVariants(storeOf(A), ids.a1Product, {
          variants: [{ variantId: ids.a2Variant, price: "1" }],
        }),
    ],
  ])("%s", async (_, attempt) => {
    await expectCode(attempt(), "NOT_FOUND");
  });

  it("B's data is untouched after all of the above", async () => {
    const product = await getProduct(storeOf(B), ids.bProduct);
    expect(product.title).toBe("B shirt");
    expect(product.status).toBe("DRAFT");
    expect(product.variants[0]?.available).toBe(5);
    expect(product.variants[0]?.price.amount).toBe("0");
  });
});

describe("nested references can't cross stores", () => {
  it("a collection only ever gains its own store's products", async () => {
    const result = await addProductsToCollection(storeOf(A), ids.a1Collection, {
      productIds: [ids.a1Product, ids.bProduct, ids.a2Product],
    });
    expect(result.added).toBe(1);
    expect(result.missing).toEqual([ids.bProduct, ids.a2Product]);
    const collection = await getCollection(storeOf(A), ids.a1Collection);
    expect(collection.products.map((p) => p.id)).toEqual([ids.a1Product]);
  });

  it("another store's collection can't be targeted", async () => {
    await expectCode(
      addProductsToCollection(storeOf(A), ids.bCollection, { productIds: [ids.a1Product] }),
      "NOT_FOUND",
    );
    expect((await getCollection(storeOf(B), ids.bCollection)).productCount).toBe(0);
  });

  it("media from another tenant or store can't be attached or used as an image", async () => {
    await expectCode(
      attachProductMedia(storeOf(A), ids.a1Product, { mediaIds: [ids.bMedia] }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      attachProductMedia(storeOf(A), ids.a1Product, { mediaIds: [ids.a2Media] }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      createCollection(storeOf(A), { title: "X", imageMediaId: ids.bMedia }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      updateVariants(storeOf(A), ids.a1Product, {
        variants: [{ variantId: ids.a1Variant, imageMediaId: ids.bMedia }],
      }),
      "VALIDATION_FAILED",
    );
  });

  it("bulk actions report foreign ids as not found and never touch them", async () => {
    const result = await bulkProductAction(storeOf(A), {
      action: "archive",
      productIds: [ids.bProduct, ids.a2Product, "prod_not-an-id"],
    });
    expect(result.succeeded).toEqual([]);
    expect(result.failed.map((f) => f.message)).toEqual(["Not found.", "Not found.", "Not found."]);
    expect((await getProduct(storeOf(B), ids.bProduct)).status).toBe("DRAFT");
    expect((await getProduct(storeOf(A, 1), ids.a2Product)).status).toBe("DRAFT");
  });

  it("lists and searches never include another store's products", async () => {
    const page = await listProducts(storeOf(A), { q: "shirt" });
    expect(page.items.map((p) => p.id)).toEqual([ids.a1Product]);
    expect(page.counts.all).toBe(1);
    const bySku = await listProducts(storeOf(A), { q: "B1" });
    expect(bySku.items).toEqual([]);
  });

  it("a member limited to store A2 can't reach store A1's catalogue", async () => {
    const limited = await memberContext(A, "CATALOGUE_MANAGER", storeOf(A, 1), {
      storeIds: [storeOf(A, 1).storeId],
    });
    await expectCode(getProduct(limited, ids.a1Product), "NOT_FOUND");
    await expectCode(updateProduct(limited, ids.a1Product, { title: "x" }), "NOT_FOUND");
    expect((await getProduct(limited, ids.a2Product)).title).toBe("A2 shirt");
  });

  it("an explicitly foreign store id in a location input is ignored: the context decides the store", async () => {
    const { locationId } = await createLocation(storeOf(A), {
      name: "Warehouse",
      code: "WH",
      countryCode: "IN",
      storeId: storeOf(B).storeId,
      organisationId: B.org.organisationId,
    });
    const row = await migratorDb().location.findUniqueOrThrow({
      where: { id: parseTypeId("location", locationId) ?? "" },
    });
    expect(row.storeId).toBe(storeOf(A).storeId);
    expect(row.organisationId).toBe(A.org.organisationId);
  });
});
