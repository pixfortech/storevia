// Product logistics and publishing (Phase 2A): the HSN code (validated in
// the service and the database, never readable by the storefront role),
// weight, shipping and tax flags per variant, and the confirmation a product
// priced at 0 needs before it goes live, on every path that can publish it.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { requireOrganisationAccess } from "@storevia/tenancy";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  bulkProductAction,
  changeProductOptions,
  createProduct,
  exportProducts,
  FREE_BULK_MESSAGE,
  getProduct,
  setProductStatus,
  updateProduct,
  updateVariants,
} from "../src";
import { exportOrganisationData } from "../src/data-export";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let tenant: Tenant;

beforeEach(async () => {
  await truncateAll();
  tenant = await makeTenant("logi");
});

afterAll(disconnectTestClients);

const uuid = (productId: string) => parseTypeId("product", productId) ?? "";

async function productRow(productId: string) {
  return migratorDb().product.findUniqueOrThrow({ where: { id: uuid(productId) } });
}

async function collect(chunks: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

describe("HSN code", () => {
  it("is stored on create, changed and cleared on update, and audited", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, {
      title: "Cotton tee",
      price: "499",
      hsnCode: "6109",
    });
    expect((await getProduct(store, productId)).hsnCode).toBe("6109");

    await updateProduct(store, productId, { hsnCode: "6109 1000" });
    expect((await productRow(productId)).hsnCode).toBe("61091000");
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "product.updated", entityId: uuid(productId) },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.metadata).toMatchObject({
      fields: "hsnCode",
      hsnCode: "61091000",
      previousHsnCode: "6109",
    });

    // Saving other fields leaves it alone; "" clears it.
    await updateProduct(store, productId, { vendor: "Acme" });
    expect((await productRow(productId)).hsnCode).toBe("61091000");
    await updateProduct(store, productId, { hsnCode: "" });
    expect((await getProduct(store, productId)).hsnCode).toBeNull();
  });

  it("refuses anything but 4, 6 or 8 digits, in the service and in the database", async () => {
    const store = storeOf(tenant);
    for (const hsnCode of ["123", "12345", "1234567", "123456789", "61O9", "ab12"]) {
      await expect(createProduct(store, { title: "Tee", hsnCode })).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { hsnCode: "Enter an HSN code of 4, 6 or 8 digits." },
      });
    }
    const { productId } = await createProduct(store, { title: "Tee", hsnCode: "610910" });
    await expect(updateProduct(store, productId, { hsnCode: "61091" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { hsnCode: "Enter an HSN code of 4, 6 or 8 digits." },
    });
    expect((await productRow(productId)).hsnCode).toBe("610910");
    await expect(
      migratorDb().product.update({ where: { id: uuid(productId) }, data: { hsnCode: "61091" } }),
    ).rejects.toThrow(/Product_hsn_code/);
  });

  it("is not readable by the storefront role", async () => {
    const rows = await migratorDb().$queryRaw<{ hsn: boolean; category: boolean }[]>`
      SELECT has_column_privilege('storevia_storefront', '"Product"', 'hsnCode', 'SELECT') AS hsn,
        has_column_privilege('storevia_storefront', '"Product"', 'categoryCode', 'SELECT') AS category`;
    expect(rows[0]).toEqual({ hsn: false, category: true });
  });

  it("is in the product CSV and the organisation's data export", async () => {
    const store = storeOf(tenant);
    await createProduct(store, {
      title: "Cotton tee",
      price: "499",
      hsnCode: "6109",
      weightGrams: 250,
      requiresShipping: true,
      taxable: false,
    });
    const { body } = await exportProducts(store);
    const [header, row] = body.split("\r\n");
    const columns = (header ?? "").split(",");
    const cells = (row ?? "").split(",");
    const cell = (name: string) => cells[columns.indexOf(name)];
    expect(cell("hsnCode")).toBe("6109");
    expect(cell("weightGrams")).toBe("250");
    expect(cell("requiresShipping")).toBe("yes");
    expect(cell("taxable")).toBe("no");

    const owner = await requireOrganisationAccess(
      { ...tenant.owner, recentlyAuthenticated: true },
      toTypeId("organisation", tenant.org.organisationId),
    );
    const doc = JSON.parse(await collect(await exportOrganisationData(owner))) as {
      stores: { products: { hsnCode: string | null }[] }[];
    };
    expect(doc.stores[0]?.products.map((p) => p.hsnCode)).toEqual(["6109"]);
  });
});

describe("weight, shipping and tax", () => {
  it("apply to a simple product's variant and can differ per variant", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, {
      title: "Candle",
      price: "350",
      weightGrams: "1250",
      requiresShipping: true,
      taxable: true,
      sku: "CANDLE-1",
    });
    const variant = (await getProduct(store, productId)).variants[0];
    expect(variant).toMatchObject({
      weightGrams: 1250,
      requiresShipping: true,
      taxable: true,
      sku: "CANDLE-1",
    });
    await updateVariants(store, productId, {
      variants: [
        {
          variantId: variant?.id ?? "",
          weightGrams: "",
          requiresShipping: false,
          taxable: false,
          sku: "CANDLE-D",
        },
      ],
    });
    expect((await getProduct(store, productId)).variants[0]).toMatchObject({
      weightGrams: null,
      requiresShipping: false,
      taxable: false,
      sku: "CANDLE-D",
    });
    await expect(
      updateVariants(store, productId, {
        variants: [{ variantId: variant?.id ?? "", weightGrams: "12.5" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    // Options: new variants start from the first one; each can then differ.
    await updateVariants(store, productId, {
      variants: [{ variantId: variant?.id ?? "", weightGrams: 400, requiresShipping: true }],
    });
    await changeProductOptions(store, productId, {
      options: [{ name: "Size", values: [{ value: "S" }, { value: "L" }] }],
    });
    const [small, large] = (await getProduct(store, productId)).variants;
    expect(small).toMatchObject({ weightGrams: 400, requiresShipping: true, taxable: false });
    expect(large).toMatchObject({ weightGrams: 400, requiresShipping: true, taxable: false });
    await updateVariants(store, productId, {
      variants: [{ variantId: large?.id ?? "", weightGrams: 900, taxable: true }],
    });
    const after = (await getProduct(store, productId)).variants;
    expect(after.map((v) => [v.weightGrams, v.taxable])).toEqual([
      [400, false],
      [900, true],
    ]);
  });
});

describe("publishing a product priced at 0", () => {
  it("create: refused without confirmation, nothing written; allowed with it", async () => {
    const store = storeOf(tenant);
    await expect(
      createProduct(store, { title: "Free sticker", status: "ACTIVE" }),
    ).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      message:
        '"Free sticker" is priced at ₹0.00. Publish it only if you mean to offer it for free.',
    });
    await expectCode(
      createProduct(store, { title: "Free sticker", price: "0.00", status: "ACTIVE" }),
      "CONFIRMATION_REQUIRED",
    );
    expect(await migratorDb().product.count()).toBe(0);

    // A draft needs no confirmation; nor does a priced product.
    await createProduct(store, { title: "Free draft" });
    await createProduct(store, { title: "Mug", price: "450", status: "ACTIVE" });

    const { productId } = await createProduct(store, {
      title: "Free sticker",
      status: "ACTIVE",
      confirmFree: true,
    });
    expect((await productRow(productId)).status).toBe("ACTIVE");
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "product.created", entityId: uuid(productId) },
    });
    expect(audit.metadata).toMatchObject({ status: "ACTIVE", confirmedFree: true });
  });

  it("set as active: refused without confirmation, the product stays a draft", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Sample pack" });
    await expectCode(setProductStatus(store, productId, "ACTIVE"), "CONFIRMATION_REQUIRED");
    // Only a real `true` confirms: a replayed string doesn't.
    await expectCode(
      setProductStatus(store, productId, "ACTIVE", { confirmFree: "true" }),
      "CONFIRMATION_REQUIRED",
    );
    expect((await productRow(productId)).status).toBe("DRAFT");
    await setProductStatus(store, productId, "ACTIVE", { confirmFree: true });
    expect((await productRow(productId)).status).toBe("ACTIVE");
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "product.activated", entityId: uuid(productId) },
    });
    expect(audit.metadata).toMatchObject({ confirmedFree: true });
    // Back to draft needs nothing.
    await setProductStatus(store, productId, "DRAFT");
  });

  it("counts any free live variant, and names how many", async () => {
    const store = storeOf(tenant);
    const { productId } = await createProduct(store, { title: "Tote", price: "300" });
    await changeProductOptions(store, productId, {
      options: [{ name: "Colour", values: [{ value: "Red" }, { value: "Blue" }] }],
    });
    const [red] = (await getProduct(store, productId)).variants;
    await updateVariants(store, productId, { variants: [{ variantId: red?.id ?? "", price: "" }] });
    await expect(setProductStatus(store, productId, "ACTIVE")).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      message:
        '1 of the 2 variants of "Tote" is priced at ₹0.00. Publish it only if you mean to offer it for free.',
    });
    await updateVariants(store, productId, {
      variants: [{ variantId: red?.id ?? "", price: "250" }],
    });
    await setProductStatus(store, productId, "ACTIVE");
    expect((await productRow(productId)).status).toBe("ACTIVE");
  });

  it("bulk: free products are skipped and reported, the others published", async () => {
    const store = storeOf(tenant);
    const paid = (await createProduct(store, { title: "Mug", price: "450" })).productId;
    const free = (await createProduct(store, { title: "Sticker" })).productId;
    const result = await bulkProductAction(store, {
      action: "activate",
      productIds: [paid, free],
    });
    expect(result).toEqual({
      succeeded: [paid],
      failed: [{ id: free, message: FREE_BULK_MESSAGE }],
    });
    expect((await productRow(paid)).status).toBe("ACTIVE");
    expect((await productRow(free)).status).toBe("DRAFT");
  });
});
