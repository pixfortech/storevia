// Options and variants (ADR-0027 §5): surviving variants keep their data,
// removals need exact confirmation, variants with stock history are
// soft-deleted, and the matrix saves validate together.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adjustInventory,
  attachProductMedia,
  changeProductOptions,
  createProduct,
  getProduct,
  listLocations,
  updateVariants,
  type ProductDetails,
} from "../src";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let tenant: Tenant;
let productId: string;
const store = () => storeOf(tenant);

const desiredFrom = (product: ProductDetails) =>
  product.options.map((o) => ({
    id: o.id,
    name: o.name,
    values: o.values.map((v) => ({ id: v.id, value: v.value })),
  }));

beforeEach(async () => {
  await truncateAll();
  tenant = await makeTenant("var");
  productId = (
    await createProduct(store(), { title: "Tee", price: "500", sku: "TEE", initialStock: 7 })
  ).productId;
});

afterAll(disconnectTestClients);

describe("changeProductOptions", () => {
  it("adding options keeps the default variant (its SKU, price and stock) as the first combination", async () => {
    const result = await changeProductOptions(store(), productId, {
      options: [
        { name: "Size", values: [{ value: "S" }, { value: "M" }] },
        { name: "Colour", values: [{ value: "Black" }, { value: "White" }] },
      ],
    });
    expect(result).toMatchObject({ status: "applied", created: 3, removed: 0 });
    const product = await getProduct(store(), productId);
    expect(product.variants.map((v) => v.title)).toEqual([
      "S / Black",
      "S / White",
      "M / Black",
      "M / White",
    ]);
    expect(product.variants[0]).toMatchObject({
      sku: "TEE",
      available: 7,
      price: { amount: "50000" },
    });
    expect(product.variants[1]).toMatchObject({
      sku: null,
      available: 0,
      price: { amount: "50000" },
    });
    expect(Object.keys(product.variants[0]?.optionValues ?? {})).toHaveLength(2);
  });

  it("renames and reorders without touching variant data", async () => {
    await changeProductOptions(store(), productId, {
      options: [
        { name: "Size", values: [{ value: "S" }, { value: "M" }] },
        { name: "Colour", values: [{ value: "Black" }, { value: "White" }] },
      ],
    });
    const before = await getProduct(store(), productId);
    const [size, colour] = desiredFrom(before);
    const result = await changeProductOptions(store(), productId, {
      options: [
        { ...colour, name: "Color" },
        {
          ...size,
          values: (size?.values ?? []).map((v) => ({
            ...v,
            value: v.value === "S" ? "Small" : v.value,
          })),
        },
      ],
    });
    expect(result).toMatchObject({ status: "applied", created: 0, removed: 0 });
    const after = await getProduct(store(), productId);
    expect(after.options.map((o) => o.name)).toEqual(["Color", "Size"]);
    expect(new Set(after.variants.map((v) => v.id))).toEqual(
      new Set(before.variants.map((v) => v.id)),
    );
    expect(after.variants.find((v) => v.sku === "TEE")?.title).toBe("Black / Small");
  });

  it("removing a value requires confirming exactly the variants it removes", async () => {
    await changeProductOptions(store(), productId, {
      options: [{ name: "Size", values: [{ value: "S" }, { value: "M" }, { value: "L" }] }],
    });
    const product = await getProduct(store(), productId);
    const [size] = desiredFrom(product);
    const withoutS = [
      { ...size, name: "Size", values: (size?.values ?? []).filter((v) => v.value !== "S") },
    ];
    const first = await changeProductOptions(store(), productId, { options: withoutS });
    expect(first).toMatchObject({ status: "confirmation_required" });
    if (first.status !== "confirmation_required") throw new Error("expected confirmation");
    expect(first.removals).toEqual([
      expect.objectContaining({ title: "S", sku: "TEE", available: 7, hasInventoryHistory: true }),
    ]);
    // A different (or partial) confirmation applies nothing.
    const wrong = await changeProductOptions(store(), productId, {
      options: withoutS,
      confirmRemoveVariantIds: [product.variants[1]?.id ?? ""],
    });
    expect(wrong.status).toBe("confirmation_required");
    expect((await getProduct(store(), productId)).variants).toHaveLength(3);

    const applied = await changeProductOptions(store(), productId, {
      options: withoutS,
      confirmRemoveVariantIds: first.removals.map((r) => r.variantId),
    });
    expect(applied).toMatchObject({ status: "applied", removed: 1 });
    const after = await getProduct(store(), productId);
    expect(after.variants.map((v) => v.title)).toEqual(["M", "L"]);
    // With stock history, the variant is soft-deleted: the ledger still points at it.
    const removedId = parseTypeId("variant", first.removals[0]?.variantId ?? "") ?? "";
    const row = await migratorDb().productVariant.findUniqueOrThrow({ where: { id: removedId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.optionSignature).toBe(`deleted:${removedId}`);
    expect(
      await migratorDb().inventoryMovement.count({
        where: { inventoryItem: { variantId: removedId } },
      }),
    ).toBe(1);
    // Its SKU is free again.
    await updateVariants(store(), productId, {
      variants: [{ variantId: after.variants[0]?.id ?? "", sku: "TEE" }],
    });
  });

  it("a removed variant with no stock history is erased with its inventory item", async () => {
    await changeProductOptions(store(), productId, {
      options: [{ name: "Size", values: [{ value: "S" }, { value: "M" }] }],
    });
    const product = await getProduct(store(), productId);
    const [size] = desiredFrom(product);
    const onlyS = [
      { ...size, name: "Size", values: (size?.values ?? []).filter((v) => v.value === "S") },
    ];
    const plan = await changeProductOptions(store(), productId, { options: onlyS });
    if (plan.status !== "confirmation_required") throw new Error("expected confirmation");
    expect(plan.removals).toEqual([
      expect.objectContaining({ title: "M", hasInventoryHistory: false }),
    ]);
    await changeProductOptions(store(), productId, {
      options: onlyS,
      confirmRemoveVariantIds: plan.removals.map((r) => r.variantId),
    });
    const id = parseTypeId("variant", plan.removals[0]?.variantId ?? "") ?? "";
    expect(await migratorDb().productVariant.count({ where: { id } })).toBe(0);
    expect(await migratorDb().inventoryItem.count({ where: { variantId: id } })).toBe(0);
  });

  it("removing every option collapses to one default variant after confirmation", async () => {
    await changeProductOptions(store(), productId, {
      options: [{ name: "Size", values: [{ value: "S" }, { value: "M" }] }],
    });
    const plan = await changeProductOptions(store(), productId, { options: [] });
    if (plan.status !== "confirmation_required") throw new Error("expected confirmation");
    await changeProductOptions(store(), productId, {
      options: [],
      confirmRemoveVariantIds: plan.removals.map((r) => r.variantId),
    });
    const product = await getProduct(store(), productId);
    expect(product.options).toEqual([]);
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toMatchObject({ title: "Default", sku: "TEE", available: 7 });
  });

  it("refuses more than 100 variants and forged option ids", async () => {
    await expect(
      changeProductOptions(store(), productId, {
        options: [
          { name: "A", values: Array.from({ length: 11 }, (_, i) => ({ value: `a${String(i)}` })) },
          { name: "B", values: Array.from({ length: 10 }, (_, i) => ({ value: `b${String(i)}` })) },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expectCode(
      changeProductOptions(store(), productId, {
        options: [{ id: "opt_bogus", name: "Size", values: [{ value: "S" }] }],
      }),
      "NOT_FOUND",
    );
  });
});

describe("updateVariants (the matrix)", () => {
  it("saves prices, SKUs, barcodes and cost together", async () => {
    await changeProductOptions(store(), productId, {
      options: [{ name: "Size", values: [{ value: "S" }, { value: "M" }] }],
    });
    const [s, m] = (await getProduct(store(), productId)).variants;
    await updateVariants(store(), productId, {
      variants: [
        {
          variantId: s?.id ?? "",
          price: "450",
          compareAtPrice: "600",
          cost: "200.25",
          sku: "TEE-S",
          barcode: "8901234567890",
        },
        { variantId: m?.id ?? "", price: "475.50", sku: "TEE-M", trackInventory: false },
      ],
    });
    const [s2, m2] = (await getProduct(store(), productId)).variants;
    expect(s2).toMatchObject({
      price: { amount: "45000" },
      compareAtPrice: { amount: "60000" },
      cost: { amount: "20025" },
      sku: "TEE-S",
      barcode: "8901234567890",
    });
    expect(m2).toMatchObject({ price: { amount: "47550" }, sku: "TEE-M", tracked: false });
  });

  it("reports every invalid row at once and writes nothing", async () => {
    await createProduct(store(), { title: "Other", sku: "TAKEN" });
    await changeProductOptions(store(), productId, {
      options: [{ name: "Size", values: [{ value: "S" }, { value: "M" }, { value: "L" }] }],
    });
    const [s, m, l] = (await getProduct(store(), productId)).variants;
    await expect(
      updateVariants(store(), productId, {
        variants: [
          { variantId: s?.id ?? "", sku: "SAME", price: "100" },
          { variantId: m?.id ?? "", sku: "SAME" },
          { variantId: l?.id ?? "", sku: "TAKEN", compareAtPrice: "1" },
        ],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: {
        "variants.1.sku": "Each variant needs a different SKU.",
        "variants.2.sku": "Another variant already uses this SKU.",
        "variants.2.compareAtPrice": "The compare-at price must be higher than the price.",
      },
    });
    expect((await getProduct(store(), productId)).variants[0]?.price.amount).toBe("50000");
  });

  it("a variant image must be one of the product's images", async () => {
    const s = store();
    const id = crypto.randomUUID();
    await migratorDb().mediaAsset.create({
      data: {
        id,
        organisationId: s.organisationId,
        storeId: s.storeId,
        kind: "IMAGE",
        status: "READY",
        filename: "tee.jpg",
        declaredMimeType: "image/jpeg",
        mimeType: "image/jpeg",
        storageKey: `${s.organisationId}/${s.storeId}/${id}/original.jpg`,
      },
    });
    const publicMedia = toTypeId("media", id);
    const variantId = (await getProduct(s, productId)).variants[0]?.id ?? "";
    await expectCode(
      updateVariants(s, productId, { variants: [{ variantId, imageMediaId: publicMedia }] }),
      "VALIDATION_FAILED",
    );
    await attachProductMedia(s, productId, { mediaIds: [publicMedia] });
    await updateVariants(s, productId, { variants: [{ variantId, imageMediaId: publicMedia }] });
    expect((await getProduct(s, productId)).variants[0]?.imageMediaId).toBe(publicMedia);
  });

  it("stock adjustments still target the right variant after option edits", async () => {
    await changeProductOptions(store(), productId, {
      options: [{ name: "Size", values: [{ value: "S" }, { value: "M" }] }],
    });
    const [, m] = (await getProduct(store(), productId)).variants;
    const locationId = (await listLocations(store()))[0]?.id ?? "";
    await adjustInventory(store(), {
      variantId: m?.id ?? "",
      locationId,
      delta: 3,
      reason: "RESTOCK",
    });
    const after = await getProduct(store(), productId);
    expect(after.variants.map((v) => v.available)).toEqual([7, 3]);
  });
});
