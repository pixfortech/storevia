// Products through the real services: handles, money, rich text, status,
// archive/restore, optimistic concurrency, SKUs and audit.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  archiveProduct,
  bulkProductAction,
  createProduct,
  getProduct,
  restoreProduct,
  setProductStatus,
  updateProduct,
} from "../src";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let tenant: Tenant;

beforeEach(async () => {
  await truncateAll();
  tenant = await makeTenant("acme", {
    stores: [{ currency: "INR" }, { currency: "JPY", country: "JP" }],
  });
});

afterAll(disconnectTestClients);

const uuid = (productId: string) => parseTypeId("product", productId) ?? "";

describe("createProduct", () => {
  it("creates a draft with a default variant priced in the store currency", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, {
      title: "Linen Shirt",
      price: "999.50",
      compareAtPrice: "1,299",
      sku: "SHIRT-1",
      initialStock: 12,
    });
    const product = await getProduct(store, productId);
    expect(product).toMatchObject({
      title: "Linen Shirt",
      handle: "linen-shirt",
      status: "DRAFT",
      currency: "INR",
    });
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toMatchObject({
      title: "Default",
      sku: "SHIRT-1",
      price: { amount: "99950", currency: "INR" },
      compareAtPrice: { amount: "129900", currency: "INR" },
      tracked: true,
      available: 12,
      hasInventoryHistory: true,
    });
    const movement = await migratorDb().inventoryMovement.findFirstOrThrow();
    expect(movement).toMatchObject({
      reason: "INITIAL",
      delta: 12,
      resultingValue: 12,
      actorUserId: store.userId,
    });
    const location = await migratorDb().location.findFirstOrThrow();
    expect(location).toMatchObject({ code: "MAIN", name: "Main location", countryCode: "IN" });
  });

  it("uses the currency's own decimals, never an assumed two", async () => {
    const yen = storeOf(tenant, 1);
    const { productId } = await createProduct(yen, { title: "Tea bowl", price: "1200" });
    expect((await getProduct(yen, productId)).variants[0]?.price).toEqual({
      amount: "1200",
      currency: "JPY",
    });
    await expect(createProduct(yen, { title: "Tea cup", price: "12.5" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { price: "JPY amounts have no decimal places." },
    });
    await expect(
      createProduct(storeOf(tenant), { title: "Cup", price: "1.005" }),
    ).rejects.toMatchObject({
      fieldErrors: { price: "INR amounts have at most 2 decimal places." },
    });
  });

  it("generates unique handles and refuses explicit collisions and reserved handles", async () => {
    const store = storeOf(tenant);
    const a = await createProduct(store, { title: "Linen Shirt" });
    const b = await createProduct(store, { title: "Linen shirt!" });
    expect((await getProduct(store, b.productId)).handle).toBe("linen-shirt-2");
    await expect(
      createProduct(store, { title: "Other", handle: "linen-shirt" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { handle: "Another product already uses this handle." },
    });
    await expect(
      createProduct(store, { title: "Other", handle: "checkout" }),
    ).rejects.toMatchObject({
      fieldErrors: { handle: "That handle is reserved. Choose another." },
    });
    // Another store may use the same handle.
    const other = await createProduct(storeOf(tenant, 1), { title: "Linen Shirt" });
    expect((await getProduct(storeOf(tenant, 1), other.productId)).handle).toBe("linen-shirt");
    expect(a.productId).not.toBe(b.productId);
  });

  it("generates distinct handles for concurrent creations of the same title", async () => {
    const store = storeOf(tenant);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createProduct(store, { title: "Race Tee" })),
    );
    const handles = await Promise.all(
      results.map(async (r) => (await getProduct(store, r.productId)).handle),
    );
    expect(new Set(handles).size).toBe(5);
  });

  it("stores rich text as a validated document and derives escaped HTML", async () => {
    const store = storeOf(tenant);
    const description = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "<b>Soft</b> linen" }] }],
    };
    const { productId } = await createProduct(store, { title: "Soft", description });
    const row = await migratorDb().product.findUniqueOrThrow({ where: { id: uuid(productId) } });
    expect(row.descriptionHtml).toBe("<p>&lt;b&gt;Soft&lt;/b&gt; linen</p>");
    await expect(
      createProduct(store, { title: "Bad", description: "<script>alert(1)</script>" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { description: "Invalid description." },
    });
  });

  it("refuses a duplicate live SKU in the same store", async () => {
    const store = storeOf(tenant);
    await createProduct(store, { title: "One", sku: "DUP-1" });
    await expect(createProduct(store, { title: "Two", sku: "DUP-1" })).rejects.toMatchObject({
      code: "CONFLICT",
      fieldErrors: { sku: "That SKU is already in use." },
    });
    await createProduct(storeOf(tenant, 1), { title: "Elsewhere", sku: "DUP-1" });
  });
});

describe("updateProduct", () => {
  it("updates fields, keeps the old handle in the audit log and bumps updatedAt", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Shirt" });
    const before = await getProduct(store, productId);
    await updateProduct(store, productId, {
      title: "Oxford Shirt",
      handle: "oxford-shirt",
      tags: "cotton, Cotton , formal",
      vendor: "  North  Mill ",
      expectedUpdatedAt: before.updatedAt.toISOString(),
    });
    const after = await getProduct(store, productId);
    expect(after).toMatchObject({
      title: "Oxford Shirt",
      handle: "oxford-shirt",
      tags: ["cotton", "formal"],
      vendor: "North Mill",
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "product.updated" },
    });
    expect(audit.metadata).toMatchObject({ handle: "oxford-shirt", previousHandle: "shirt" });
  });

  it("refuses a stale save instead of overwriting someone else's changes", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Shirt" });
    const loaded = await getProduct(store, productId);
    await updateProduct(store, productId, {
      title: "First save",
      expectedUpdatedAt: loaded.updatedAt.toISOString(),
    });
    await expectCode(
      updateProduct(store, productId, {
        title: "Second save",
        expectedUpdatedAt: loaded.updatedAt.toISOString(),
      }),
      "CONFLICT",
    );
    expect((await getProduct(store, productId)).title).toBe("First save");
  });
});

describe("status, archive and restore", () => {
  it("activates, drafts, archives and restores as a draft", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Shirt" });
    await setProductStatus(store, productId, "ACTIVE");
    expect((await getProduct(store, productId)).publishedAt).not.toBeNull();
    await archiveProduct(store, productId);
    const archived = await getProduct(store, productId);
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).not.toBeNull();
    await expectCode(setProductStatus(store, productId, "ACTIVE"), "CONFLICT");
    await restoreProduct(store, productId);
    const restored = await getProduct(store, productId);
    expect(restored).toMatchObject({ status: "DRAFT", archivedAt: null });
    const actions = (
      await migratorDb().auditLog.findMany({
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "product.created",
        "product.activated",
        "product.archived",
        "product.restored",
      ]),
    );
  });

  it("status changes accept active or draft only: archiving has its own path (security review)", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Shirt" });
    for (const status of ["ARCHIVED", "archived", "", null, 1, { status: "ACTIVE" }]) {
      await expectCode(setProductStatus(store, productId, status), "VALIDATION_FAILED");
    }
    const product = await getProduct(store, productId);
    expect(product).toMatchObject({ status: "DRAFT", archivedAt: null });
    expect(await migratorDb().auditLog.count({ where: { action: "product.archived" } })).toBe(0);
  });

  it("restoring a product that isn't archived changes nothing (security review)", async () => {
    // A stale list (or a replayed request) must never unpublish a live product.
    const store = storeOf(tenant);
    const { productId: live } = await createProduct(store, { title: "Live" });
    const { productId: draft } = await createProduct(store, { title: "Draft" });
    await setProductStatus(store, live, "ACTIVE");
    const before = await getProduct(store, live);
    await restoreProduct(store, live);
    await restoreProduct(store, draft);
    const bulk = await bulkProductAction(store, { action: "restore", productIds: [live, draft] });
    expect(bulk.succeeded).toEqual([live, draft]);
    const after = await getProduct(store, live);
    expect(after).toMatchObject({ status: "ACTIVE", publishedAt: before.publishedAt });
    expect((await getProduct(store, draft)).status).toBe("DRAFT");
    expect(await migratorDb().auditLog.count({ where: { action: "product.restored" } })).toBe(0);
  });

  it("never deletes: the app role has no DELETE on products", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Keep" });
    await archiveProduct(store, productId);
    expect(await migratorDb().product.count({ where: { id: uuid(productId) } })).toBe(1);
  });

  it("audit metadata holds identifiers only, never prices or descriptions", async () => {
    const store = storeOf(tenant);
    await createProduct(store, {
      title: "Secret price",
      price: "12345.67",
      description: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "private" }] }],
      },
    });
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "product.created" },
    });
    const text = JSON.stringify(audit.metadata);
    expect(text).not.toContain("12345");
    expect(text).not.toContain("private");
  });
});
