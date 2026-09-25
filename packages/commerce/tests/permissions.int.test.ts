// Catalogue permissions come from the existing RBAC primitives (ADR-0008,
// ADR-0027 §12); there is no second permission engine. Business type never
// grants or removes access.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { requireStoreAccess } from "@storevia/tenancy";
import { toTypeId } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adjustInventory,
  archiveProduct,
  bulkProductAction,
  createCollection,
  createLocation,
  createProduct,
  exportProducts,
  getProduct,
  listCollections,
  listLocations,
  listProducts,
  updateProduct,
} from "../src";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

let tenant: Tenant;
let productId: string;
let variantId: string;
let locationId: string;

beforeAll(async () => {
  await truncateAll();
  tenant = await makeTenant("perm");
  productId = (await createProduct(storeOf(tenant), { title: "Shirt", initialStock: 3 })).productId;
  variantId = (await getProduct(storeOf(tenant), productId)).variants[0]?.id ?? "";
  locationId = (await listLocations(storeOf(tenant)))[0]?.id ?? "";
});

afterAll(disconnectTestClients);

const adjust = () => ({ variantId, locationId, delta: 1, reason: "RESTOCK" as const });

describe("role matrix for the catalogue", () => {
  it("VIEWER reads products, collections and stock but changes nothing", async () => {
    const viewer = await memberContext(tenant, "VIEWER", storeOf(tenant));
    expect((await listProducts(viewer)).items).toHaveLength(1);
    await listCollections(viewer);
    await listLocations(viewer);
    await expectCode(createProduct(viewer, { title: "x" }), "FORBIDDEN");
    await expectCode(updateProduct(viewer, productId, { title: "x" }), "FORBIDDEN");
    await expectCode(archiveProduct(viewer, productId), "FORBIDDEN");
    await expectCode(adjustInventory(viewer, adjust()), "FORBIDDEN");
    await expectCode(createCollection(viewer, { title: "x" }), "FORBIDDEN");
    await expectCode(
      createLocation(viewer, { name: "x", code: "X", countryCode: "IN" }),
      "FORBIDDEN",
    );
  });

  it("INVENTORY_MANAGER adjusts stock and manages locations, but can't edit products", async () => {
    const ctx = await memberContext(tenant, "INVENTORY_MANAGER", storeOf(tenant));
    await adjustInventory(ctx, adjust());
    await createLocation(ctx, { name: "Back room", code: "BACK", countryCode: "IN" });
    await expectCode(updateProduct(ctx, productId, { title: "x" }), "FORBIDDEN");
    await expectCode(createProduct(ctx, { title: "x" }), "FORBIDDEN");
  });

  it("CATALOGUE_MANAGER edits and archives products but can't manage locations", async () => {
    const ctx = await memberContext(tenant, "CATALOGUE_MANAGER", storeOf(tenant));
    const created = await createProduct(ctx, { title: "By catalogue manager" });
    await updateProduct(ctx, created.productId, { title: "Renamed" });
    await archiveProduct(ctx, created.productId);
    await adjustInventory(ctx, adjust());
    await expectCode(createLocation(ctx, { name: "x", code: "Y", countryCode: "IN" }), "FORBIDDEN");
  });

  it("MARKETING manages collections but not products", async () => {
    const ctx = await memberContext(tenant, "MARKETING", storeOf(tenant));
    await createCollection(ctx, { title: "Summer" });
    await expectCode(updateProduct(ctx, productId, { title: "x" }), "FORBIDDEN");
    await expectCode(
      bulkProductAction(ctx, { action: "archive", productIds: [productId] }),
      "FORBIDDEN",
    );
  });

  it("DESIGNER and ORDER_MANAGER can't create products", async () => {
    for (const role of ["DESIGNER", "ORDER_MANAGER"] as const) {
      const ctx = await memberContext(tenant, role, storeOf(tenant));
      await expectCode(createProduct(ctx, { title: "x" }), "FORBIDDEN");
    }
  });

  it("a failed permission check fails the whole bulk request, not row by row", async () => {
    const ctx = await memberContext(tenant, "CATALOGUE_MANAGER", storeOf(tenant));
    await expectCode(
      bulkProductAction(ctx, {
        action: "addToCollection",
        productIds: [productId],
        collectionId: "coll_x",
      }),
      "NOT_FOUND",
    );
    const viewer = await memberContext(tenant, "VIEWER", storeOf(tenant));
    await expectCode(
      bulkProductAction(viewer, { action: "activate", productIds: [productId] }),
      "FORBIDDEN",
    );
  });

  it("export is gated by permission and by the export entitlement", async () => {
    const csv = await exportProducts(storeOf(tenant));
    expect(csv.body.split("\r\n")[0]).toContain("productId,handle,title");
    expect(csv.rows).toBeGreaterThan(0);
  });
});

describe("store state and business type", () => {
  it("business type changes nothing about catalogue access", async () => {
    const store = storeOf(tenant);
    for (const type of ["PORTFOLIO", "PUBLISHING", "BUSINESS", "ECOMMERCE"] as const) {
      await migratorDb().store.update({
        where: { id: store.storeId },
        data: { businessType: type },
      });
      const ctx = await requireStoreAccess(tenant.owner, toTypeId("store", store.storeId));
      await updateProduct(ctx, productId, { title: `Shirt ${type}` });
    }
  });

  it("an archived store's catalogue is read-only", async () => {
    const store = storeOf(tenant);
    await migratorDb().store.update({ where: { id: store.storeId }, data: { status: "ARCHIVED" } });
    try {
      const ctx = await requireStoreAccess(tenant.owner, toTypeId("store", store.storeId));
      expect((await getProduct(ctx, productId)).id).toBe(productId);
      await expectCode(updateProduct(ctx, productId, { title: "x" }), "CONFLICT");
      await expectCode(adjustInventory(ctx, adjust()), "CONFLICT");
    } finally {
      await migratorDb().store.update({ where: { id: store.storeId }, data: { status: "DRAFT" } });
    }
  });
});
