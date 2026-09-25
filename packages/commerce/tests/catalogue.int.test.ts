// Collections, search, bulk actions, the dashboard overview and export.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addProductsToCollection,
  adjustInventory,
  archiveProduct,
  bulkProductAction,
  createCollection,
  createProduct,
  exportProducts,
  getCatalogue,
  getCatalogueOverview,
  getCollection,
  getProduct,
  listCollections,
  listLocations,
  listProducts,
  removeProductsFromCollection,
  reorderCollectionProducts,
  setCollectionArchived,
  setProductStatus,
  updateVariants,
} from "../src";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let tenant: Tenant;
const store = () => storeOf(tenant);
const p: Record<string, string> = {};

beforeAll(async () => {
  await truncateAll();
  tenant = await makeTenant("cat");
  const specs = [
    {
      key: "linen",
      title: "Linen Shirt",
      vendor: "North Mill",
      productType: "Shirts",
      tags: ["summer"],
      sku: "LIN-01",
      initialStock: 20,
    },
    {
      key: "oxford",
      title: "Oxford Shirt",
      vendor: "North Mill",
      productType: "Shirts",
      sku: "OXF-01",
      initialStock: 3,
    },
    {
      key: "mug",
      title: "Stoneware Mug",
      vendor: "Kiln & Co",
      productType: "Homeware",
      sku: "MUG-01",
      barcode: "4006381333931",
      initialStock: 0,
    },
    { key: "poster", title: "Café poster", productType: "Prints", trackInventory: false },
  ];
  for (const { key, ...input } of specs) p[key] = (await createProduct(store(), input)).productId;
  await setProductStatus(store(), p["linen"] ?? "", "ACTIVE");
});

afterAll(disconnectTestClients);

describe("search and filters", () => {
  const titles = async (query: Record<string, unknown>) =>
    (await listProducts(store(), query)).items.map((i) => i.title);

  it.each([
    // Default order is most recently updated first; Linen was activated last.
    [{ q: "shirt" }, ["Linen Shirt", "Oxford Shirt"]],
    [{ q: "lin" }, ["Linen Shirt"]],
    [{ q: "oxf-01" }, ["Oxford Shirt"]],
    [{ q: "4006381333931" }, ["Stoneware Mug"]],
    // Handles fold accents ("cafe-poster"), so unaccented searches still find it.
    [{ q: "cafe" }, ["Café poster"]],
    [{ q: "café" }, ["Café poster"]],
    [{ q: "summer" }, ["Linen Shirt"]],
    [{ q: "north" }, ["Linen Shirt", "Oxford Shirt"]],
    [{ q: "%" }, []],
    [{ q: "' OR 1=1 --" }, []],
    [{ status: "ACTIVE" }, ["Linen Shirt"]],
    [{ vendor: "Kiln & Co" }, ["Stoneware Mug"]],
    [{ productType: "Shirts", sort: "title_asc" }, ["Linen Shirt", "Oxford Shirt"]],
    [{ stock: "out_of_stock" }, ["Stoneware Mug"]],
    [{ stock: "low_stock" }, ["Oxford Shirt"]],
    [{ stock: "untracked" }, ["Café poster"]],
    [{ stock: "in_stock", sort: "title_asc" }, ["Linen Shirt", "Oxford Shirt"]],
  ])("%j", async (query, expected) => {
    expect(await titles(query)).toEqual(expected);
  });

  it("pages with a keyset cursor without gaps or repeats", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listProducts(store(), {
        sort: "title_asc",
        limit: 1,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((i) => i.title));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(["Café poster", "Linen Shirt", "Oxford Shirt", "Stoneware Mug"]);
  });

  it("ignores malformed query values instead of failing", async () => {
    const page = await listProducts(store(), {
      sort: "DROP TABLE",
      status: "NOPE",
      limit: "9999",
      cursor: "garbage",
    });
    expect(page.items.length).toBe(4);
    expect(page.counts).toEqual({ all: 4, active: 1, draft: 3, archived: 0 });
    expect(page.vendors).toEqual(["Kiln & Co", "North Mill"]);
  });

  it("returns prices, stock summaries and variant counts for the list", async () => {
    const [item] = (await listProducts(store(), { q: "linen" })).items;
    expect(item).toMatchObject({
      variantCount: 1,
      trackedVariants: 1,
      available: 20,
      outOfStockVariants: 0,
    });
  });
});

describe("collections", () => {
  it("adds, reorders, removes and archives", async () => {
    const { collectionId } = await createCollection(store(), { title: "Summer edit" });
    await addProductsToCollection(store(), collectionId, {
      productIds: [p["linen"], p["mug"], p["linen"]],
    });
    await addProductsToCollection(store(), collectionId, { productIds: [p["oxford"]] });
    let collection = await getCollection(store(), collectionId);
    expect(collection.products.map((x) => x.title)).toEqual([
      "Linen Shirt",
      "Stoneware Mug",
      "Oxford Shirt",
    ]);
    await reorderCollectionProducts(store(), collectionId, {
      productIds: [p["oxford"], p["linen"], p["mug"]],
    });
    await expectCode(
      reorderCollectionProducts(store(), collectionId, { productIds: [p["oxford"]] }),
      "CONFLICT",
    );
    await removeProductsFromCollection(store(), collectionId, { productIds: [p["mug"]] });
    collection = await getCollection(store(), collectionId);
    expect(collection.products.map((x) => x.title)).toEqual(["Oxford Shirt", "Linen Shirt"]);
    expect((await listProducts(store(), { collectionId })).items).toHaveLength(2);
    await setCollectionArchived(store(), collectionId, true);
    expect(await listCollections(store())).toEqual([]);
    expect(await listCollections(store(), { archived: true })).toHaveLength(1);
    await expectCode(
      addProductsToCollection(store(), collectionId, { productIds: [p["mug"]] }),
      "CONFLICT",
    );
    await setCollectionArchived(store(), collectionId, false);
    const again = await createCollection(store(), { title: "Summer edit" });
    expect((await getCollection(store(), again.collectionId)).handle).toBe("summer-edit-2");
  });
});

describe("bulk actions", () => {
  it("activates many and tags many, reporting per product", async () => {
    const ids = [p["oxford"] ?? "", p["mug"] ?? ""];
    const activated = await bulkProductAction(store(), { action: "activate", productIds: ids });
    expect(activated).toEqual({ succeeded: ids, failed: [] });
    await bulkProductAction(store(), { action: "addTags", productIds: ids, tags: "new, Sale" });
    await bulkProductAction(store(), { action: "removeTags", productIds: ids, tags: ["sale"] });
    expect((await getProduct(store(), p["mug"] ?? "")).tags).toEqual(["new"]);
    await bulkProductAction(store(), { action: "draft", productIds: ids });
  });
});

describe("overview and catalogue read", () => {
  it("counts real products and stock, nothing invented", async () => {
    const overview = await getCatalogueOverview(store());
    expect(overview.products).toMatchObject({ total: 4, active: 1 });
    expect(overview.outOfStockVariants).toBe(1);
    expect(overview.lowStockVariants).toBe(1);
    expect(overview.lowStock.map((l) => l.productTitle)).toEqual(["Stoneware Mug", "Oxford Shirt"]);
    expect(overview.recentlyUpdated.length).toBeGreaterThan(0);
    expect(Object.keys(overview)).not.toEqual(
      expect.arrayContaining(["revenue", "orders", "customers"]),
    );
  });

  it("the sellable catalogue lists active products only", async () => {
    const { products } = await getCatalogue(store());
    expect(products.map((x) => x.title)).toEqual(["Linen Shirt"]);
    expect(products[0]?.variants[0]).toMatchObject({ sku: "LIN-01", available: 20, tracked: true });
  });

  it("archived products leave lists, overview counts and the catalogue", async () => {
    const { productId } = await createProduct(store(), { title: "Temp" });
    await archiveProduct(store(), productId);
    expect((await listProducts(store(), { q: "temp" })).items).toEqual([]);
    expect((await listProducts(store(), { status: "ARCHIVED" })).items.map((i) => i.title)).toEqual(
      ["Temp"],
    );
  });
});

describe("export", () => {
  it("exports one row per variant, with formula-looking cells neutralised", async () => {
    const { productId } = await createProduct(store(), { title: '=HYPERLINK("x")', price: "10" });
    const variantId = (await getProduct(store(), productId)).variants[0]?.id ?? "";
    await updateVariants(store(), productId, { variants: [{ variantId, sku: "+SKU" }] });
    const { body, rows } = await exportProducts(store());
    expect(rows).toBeGreaterThanOrEqual(5);
    expect(body).toContain(`"'=HYPERLINK(""x"")"`);
    expect(body).toContain("'+SKU");
    expect(body).toContain(",10.00,");
    expect(await migratorDb().auditLog.count({ where: { action: "product.exported" } })).toBe(1);
    const locationId = (await listLocations(store()))[0]?.id ?? "";
    await adjustInventory(store(), { variantId, locationId, delta: 1, reason: "RESTOCK" });
  });
});
