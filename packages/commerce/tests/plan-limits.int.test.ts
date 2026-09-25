// product_limit through the entitlement engine (ADR-0027 §7): counted
// organisation-wide, consumed on create and restore, released on archive,
// race-safe, and never deleting anything when a plan shrinks.
import { withTenant } from "@storevia/database";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { getUsage, reconcileUsage } from "@storevia/entitlements";
import { scopeOf } from "@storevia/tenancy";
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

async function setProductLimit(organisationId: string, limit: number): Promise<void> {
  const db = migratorDb();
  const feature = await db.feature.findUniqueOrThrow({ where: { key: "product_limit" } });
  await db.organisationFeatureOverride.upsert({
    where: { organisationId_featureId: { organisationId, featureId: feature.id } },
    create: {
      organisationId,
      featureId: feature.id,
      enabled: true,
      limit: BigInt(limit),
      reason: "test",
    },
    update: { limit: BigInt(limit) },
  });
}

const usage = () =>
  withTenant(scopeOf(tenant.org), (tx) => getUsage(tx, tenant.org.organisationId, "product_limit"));

beforeEach(async () => {
  await truncateAll();
  tenant = await makeTenant("limits", { stores: [{ currency: "INR" }, { currency: "INR" }] });
  await setProductLimit(tenant.org.organisationId, 3);
});

afterAll(disconnectTestClients);

describe("product_limit", () => {
  it("counts products across all of the organisation's stores", async () => {
    await createProduct(storeOf(tenant, 0), { title: "One" });
    await createProduct(storeOf(tenant, 1), { title: "Two" });
    await createProduct(storeOf(tenant, 0), { title: "Three" });
    await expectCode(createProduct(storeOf(tenant, 1), { title: "Four" }), "LIMIT_REACHED");
    expect(await usage()).toBe(3n);
    expect(await migratorDb().product.count()).toBe(3);
  });

  it("archiving frees a slot; restoring takes one again", async () => {
    const store = storeOf(tenant);
    const ids = [];
    for (const title of ["A", "B", "C"])
      ids.push((await createProduct(store, { title })).productId);
    await archiveProduct(store, ids[0] ?? "");
    expect(await usage()).toBe(2n);
    await createProduct(store, { title: "D" });
    await expectCode(restoreProduct(store, ids[0] ?? ""), "LIMIT_REACHED");
    expect((await getProduct(store, ids[0] ?? "")).status).toBe("ARCHIVED");
    await archiveProduct(store, ids[1] ?? "");
    await restoreProduct(store, ids[0] ?? "");
    expect(await usage()).toBe(3n);
  });

  it("activating a draft doesn't change usage", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Draft" });
    await setProductStatus(store, productId, "ACTIVE");
    await setProductStatus(store, productId, "DRAFT");
    expect(await usage()).toBe(1n);
  });

  it("parallel creations cannot pass the limit", async () => {
    await setProductLimit(tenant.org.organisationId, 5);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        createProduct(storeOf(tenant, i % 2), { title: `Race ${String(i)}` }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(5);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "LIMIT_REACHED" });
    }
    expect(await migratorDb().product.count()).toBe(5);
    expect(await usage()).toBe(5n);
  });

  it("parallel restores cannot pass the limit either", async () => {
    const store = storeOf(tenant);
    const ids = [];
    for (const title of ["A", "B", "C"])
      ids.push((await createProduct(store, { title })).productId);
    for (const id of ids) await archiveProduct(store, id);
    await createProduct(store, { title: "D" });
    await createProduct(store, { title: "E" });
    const results = await Promise.allSettled(ids.map((id) => restoreProduct(store, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await usage()).toBe(3n);
  });

  it("over the limit after a downgrade: nothing is deleted, existing products stay editable", async () => {
    const store = storeOf(tenant);
    const ids = [];
    for (const title of ["A", "B", "C"])
      ids.push((await createProduct(store, { title })).productId);
    await setProductLimit(tenant.org.organisationId, 1); // the plan shrank
    const first = ids[0] ?? "";
    await updateProduct(store, first, { title: "A edited" });
    await setProductStatus(store, first, "ACTIVE");
    await expectCode(createProduct(store, { title: "New" }), "LIMIT_REACHED");
    await archiveProduct(store, ids[1] ?? "");
    await expectCode(restoreProduct(store, ids[1] ?? ""), "LIMIT_REACHED");
    expect(await migratorDb().product.count()).toBe(3);
    expect((await getProduct(store, first)).title).toBe("A edited");
  });

  it("bulk restore reports the products that hit the limit and restores the rest", async () => {
    const store = storeOf(tenant);
    const ids = [];
    for (const title of ["A", "B", "C"])
      ids.push((await createProduct(store, { title })).productId);
    for (const id of ids) await archiveProduct(store, id);
    await createProduct(store, { title: "D" });
    const result = await bulkProductAction(store, { action: "restore", productIds: ids });
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.message).toContain("limit");
  });

  it("reconciliation recounts from the products table", async () => {
    const store = storeOf(tenant);
    await createProduct(store, { title: "A" });
    await createProduct(storeOf(tenant, 1), { title: "B" });
    const db = migratorDb();
    const feature = await db.feature.findUniqueOrThrow({ where: { key: "product_limit" } });
    await db.usageCounter.updateMany({ where: { featureId: feature.id }, data: { value: 0n } });
    const drift = await withTenant(scopeOf(tenant.org), (tx) =>
      reconcileUsage(tx, tenant.org.organisationId),
    );
    expect(drift).toEqual(
      expect.arrayContaining([{ key: "product_limit", recorded: 0n, actual: 2n }]),
    );
    expect(await usage()).toBe(2n);
  });

  it("a missing counter starts from the real org-wide count, even from a store scope", async () => {
    await createProduct(storeOf(tenant, 1), { title: "Elsewhere" });
    await createProduct(storeOf(tenant, 1), { title: "Elsewhere 2" });
    const db = migratorDb();
    const feature = await db.feature.findUniqueOrThrow({ where: { key: "product_limit" } });
    await db.usageCounter.deleteMany({ where: { featureId: feature.id } });
    await createProduct(storeOf(tenant, 0), { title: "Here" });
    await expectCode(createProduct(storeOf(tenant, 0), { title: "Too many" }), "LIMIT_REACHED");
    expect(await usage()).toBe(3n);
  });
});
