// Product tags and the category taxonomy through the real services: tag
// normalisation and limits on every write path, store-scoped suggestions,
// category assignment (valid, invalid, retired, cleared, audited), store
// isolation, the list filters (indexed, no query per row) and the public
// product DTO. The taxonomy itself is the reference data `pnpm db:seed`
// loaded into the test database.
import type { Prisma } from "@storevia/database";
import {
  countQueries,
  disconnectTestClients,
  migratorDb,
  truncateAll,
} from "@storevia/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bulkProductAction,
  createProduct,
  getCategoryPath,
  getProduct,
  listProductCategories,
  listProductTags,
  listProducts,
  setProductStatus,
  updateProduct,
} from "../src";
import { readStorefront } from "../src/storefront";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

const RETIRED = "zz-test-retired";

let a: Tenant; // two stores in one organisation
let b: Tenant; // another organisation
const p: Record<string, string> = {};

const tagsOf = async (key: string, tenant = a, store = 0) =>
  (await getProduct(storeOf(tenant, store), p[key] ?? "")).tags;

beforeAll(async () => {
  await truncateAll();
  // A category the taxonomy has retired (the seed deactivates, never deletes).
  await migratorDb().productCategory.upsert({
    where: { code: RETIRED },
    create: { code: RETIRED, name: "Retired", level: 1, path: "Retired", active: false },
    update: { active: false },
  });
  a = await makeTenant("tax-a", { stores: [{ currency: "INR" }, { currency: "INR" }] });
  b = await makeTenant("tax-b");
  const create = async (key: string, tenant: Tenant, store: number, input: object) => {
    p[key] = (await createProduct(storeOf(tenant, store), input)).productId;
  };
  await create("pan", a, 0, {
    title: "Enamel saucepan",
    tags: ["Kitchen", "cookware"],
    categoryCode: "hg-kd-cookware",
  });
  await create("mug", a, 0, {
    title: "Stoneware mug",
    price: "450",
    tags: "kitchen, Ceramics",
    categoryCode: "hg-kd-drinkware-mugs",
  });
  await create("planter", a, 0, { title: "Ceramic planter", tags: ["ceramics", "garden"] });
  await create("sister", a, 1, { title: "Sister-store bowl", tags: ["sister-only", "kitchen"] });
  await create("other", b, 0, {
    title: "Other org lamp",
    tags: ["other-org-secret", "Kitchen"],
    categoryCode: "hg-decor",
  });
  await setProductStatus(storeOf(a), p["mug"] ?? "", "ACTIVE");
}, 60_000);

afterAll(async () => {
  await truncateAll();
  await migratorDb().productCategory.deleteMany({ where: { code: RETIRED } });
  await disconnectTestClients();
});

describe("tags", () => {
  it("normalise on create and update: cleaned, first spelling kept, commas split", async () => {
    expect(await tagsOf("mug")).toEqual(["kitchen", "Ceramics"]);
    await updateProduct(storeOf(a), p["planter"] ?? "", {
      tags: ["  Garden\tTools ", "garden tools", "Outdoor, patio", "​ceramics", "<b>x</b>"],
    });
    expect(await tagsOf("planter")).toEqual([
      "Garden Tools",
      "Outdoor",
      "patio",
      "ceramics",
      "<b>x</b>",
    ]);
    // Text from a form field works the same way; "" clears.
    await updateProduct(storeOf(a), p["planter"] ?? "", { tags: "ceramics, garden" });
    expect(await tagsOf("planter")).toEqual(["ceramics", "garden"]);
  });

  it("refuse too many or too long tags with a field error, changing nothing", async () => {
    const many = Array.from({ length: 51 }, (_, i) => `t${String(i)}`);
    await expect(
      updateProduct(storeOf(a), p["planter"] ?? "", { tags: many }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { tags: "Use at most 50 tags." },
    });
    await expect(
      createProduct(storeOf(a), { title: "Too long", tags: ["x".repeat(41)] }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { tags: expect.stringMatching(/at most 40 characters/) as unknown },
    });
    expect(await tagsOf("planter")).toEqual(["ceramics", "garden"]);
  });

  it("bulk add stops at the same limit and matches ignoring case", async () => {
    const result = await bulkProductAction(storeOf(a), {
      action: "addTags",
      productIds: [p["planter"]],
      tags: "GARDEN, Sale",
    });
    expect(result.failed).toEqual([]);
    expect(await tagsOf("planter")).toEqual(["ceramics", "garden", "Sale"]);
    await updateProduct(storeOf(a), p["planter"] ?? "", {
      tags: Array.from({ length: 50 }, (_, i) => `t${String(i)}`),
    });
    const full = await bulkProductAction(storeOf(a), {
      action: "addTags",
      productIds: [p["planter"]],
      tags: "one more",
    });
    expect(full.failed[0]?.message).toBe("A product can have at most 50 tags.");
    await updateProduct(storeOf(a), p["planter"] ?? "", { tags: ["ceramics", "garden"] });
  });

  it("the database refuses badly shaped tags from any writer", async () => {
    const db = migratorDb();
    for (const tags of [["x".repeat(41)], [" padded"], ["a,b"], ["line\nbreak"], [""]]) {
      await expect(
        db.product.update({ where: { id: (await rawId("planter")) ?? "" }, data: { tags } }),
      ).rejects.toThrow();
    }
  });

  it("suggests only this store's tags, by prefix ignoring case, most used first", async () => {
    const suggestions = await listProductTags(storeOf(a));
    // One suggestion per tag ignoring case, in its most used spelling.
    const tags = suggestions.map((s) => s.tag.toLowerCase());
    expect(tags).toContain("kitchen");
    expect(tags).not.toContain("sister-only");
    expect(tags).not.toContain("other-org-secret");
    // "Kitchen" and "kitchen" are one suggestion, counted across both products.
    expect(suggestions.filter((s) => s.tag.toLowerCase() === "kitchen")).toEqual([
      { tag: expect.stringMatching(/^[Kk]itchen$/) as unknown, products: 2 },
    ]);
    expect(
      (await listProductTags(storeOf(a), { prefix: "CER" })).map((s) => s.tag.toLowerCase()),
    ).toEqual(["ceramics"]);
    expect(await listProductTags(storeOf(a), { prefix: "%" })).toEqual([]);
    expect(await listProductTags(storeOf(a), { prefix: "_" })).toEqual([]);
    expect((await listProductTags(storeOf(a), { limit: 1 })).length).toBe(1);
    // The sister store and the other organisation see their own tags only.
    expect((await listProductTags(storeOf(a, 1))).map((s) => s.tag.toLowerCase()).sort()).toEqual([
      "kitchen",
      "sister-only",
    ]);
    expect((await listProductTags(storeOf(b))).map((s) => s.tag.toLowerCase())).not.toContain(
      "ceramics",
    );
  });
});

describe("categories", () => {
  it("search the taxonomy by breadcrumb words, active only, bounded", async () => {
    const results = await listProductCategories(storeOf(a), { q: "cookware" });
    expect(results[0]).toEqual({
      code: "hg-kd-cookware",
      name: "Cookware",
      path: ["Home & Garden", "Kitchen & Dining", "Cookware"],
      hasChildren: false,
    });
    const kitchen = await listProductCategories(storeOf(a), { q: "kitchen mugs" });
    expect(kitchen.map((c) => c.code)).toEqual(["hg-kd-drinkware-mugs"]);
    expect(await listProductCategories(storeOf(a), { q: "retired" })).toEqual([]);
    expect(await listProductCategories(storeOf(a), { q: "%" })).toEqual([]);
    expect((await listProductCategories(storeOf(a), { q: "e", limit: 5 })).length).toBe(5);
  });

  it("browse level by level in taxonomy order", async () => {
    const top = await listProductCategories(storeOf(a));
    expect(top.every((c) => c.path.length === 1)).toBe(true);
    expect(top.map((c) => c.code)).toContain("hg");
    expect(top.map((c) => c.code)).not.toContain(RETIRED);
    const garden = await listProductCategories(storeOf(a), { parentCode: "hg" });
    expect(garden[0]).toMatchObject({ code: "hg-kd", name: "Kitchen & Dining", hasChildren: true });
    expect(await listProductCategories(storeOf(a), { parentCode: "no-such-code" })).toEqual([]);
  });

  it("returns a breadcrumb for any code, and null for an unknown one", async () => {
    expect(await getCategoryPath(storeOf(a), "hg-lg-planters")).toEqual({
      code: "hg-lg-planters",
      name: "Planters",
      path: ["Home & Garden", "Lawn & Garden", "Planters"],
      active: true,
    });
    expect(await getCategoryPath(storeOf(a), RETIRED)).toMatchObject({ active: false });
    expect(await getCategoryPath(storeOf(a), "nope")).toBeNull();
  });

  it("assign, change and clear a product's category, audited", async () => {
    const store = storeOf(a);
    const planter = p["planter"] ?? "";
    await updateProduct(store, planter, { categoryCode: "hg-lg-planters" });
    expect((await getProduct(store, planter)).category).toEqual({
      code: "hg-lg-planters",
      name: "Planters",
      path: ["Home & Garden", "Lawn & Garden", "Planters"],
      active: true,
    });
    // Saving other fields with the same category sends it again: no change.
    await updateProduct(store, planter, {
      title: "Ceramic planter",
      categoryCode: "hg-lg-planters",
    });
    await updateProduct(store, planter, { categoryCode: "" });
    expect((await getProduct(store, planter)).category).toBeNull();
    const audits = await migratorDb().auditLog.findMany({
      where: { entityId: (await rawId("planter")) ?? "", action: "product.updated" },
      orderBy: { createdAt: "asc" },
      select: { metadata: true },
    });
    const withCategory = audits.filter((row) =>
      ((row.metadata as { fields?: string } | null)?.fields ?? "").includes("category"),
    );
    expect(withCategory.map((row) => row.metadata)).toEqual([
      { fields: "category", category: "hg-lg-planters", previousCategory: null },
      { fields: "category", category: null, previousCategory: "hg-lg-planters" },
    ]);
  });

  it("refuse unknown, retired and malformed codes with a field error", async () => {
    for (const code of ["no-such-category", RETIRED, "HG", "x".repeat(65)]) {
      await expect(
        updateProduct(storeOf(a), p["planter"] ?? "", { categoryCode: code }),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { categoryCode: expect.any(String) as unknown },
      });
    }
    await expect(
      createProduct(storeOf(a), { title: "Nope", categoryCode: "no-such-category" }),
    ).rejects.toMatchObject({ fieldErrors: { categoryCode: "Choose a category from the list." } });
  });

  it("keep a retired category until the merchant chooses another", async () => {
    await migratorDb().product.update({
      where: { id: (await rawId("pan")) ?? "" },
      data: { categoryCode: RETIRED },
    });
    await updateProduct(storeOf(a), p["pan"] ?? "", {
      title: "Enamel saucepan",
      categoryCode: RETIRED,
    });
    expect((await getProduct(storeOf(a), p["pan"] ?? "")).category).toMatchObject({
      code: RETIRED,
      active: false,
    });
    await updateProduct(storeOf(a), p["pan"] ?? "", { categoryCode: "hg-kd-cookware" });
  });

  it("never touch another store's product, in the organisation or outside it", async () => {
    await expectCode(
      updateProduct(storeOf(a, 1), p["pan"] ?? "", { categoryCode: "hg-decor" }),
      "NOT_FOUND",
    );
    await expectCode(
      updateProduct(storeOf(b), p["pan"] ?? "", { categoryCode: "", tags: "hijacked" }),
      "NOT_FOUND",
    );
    const pan = await getProduct(storeOf(a), p["pan"] ?? "");
    expect(pan.category?.code).toBe("hg-kd-cookware");
    expect(pan.tags).toEqual(["Kitchen", "cookware"]);
    await expectCode(getProduct(storeOf(b), p["pan"] ?? ""), "NOT_FOUND");
  });
});

describe("product list filters", () => {
  const titles = async (query: Record<string, unknown>, tenant = a) =>
    (await listProducts(storeOf(tenant), { sort: "title_asc", ...query })).items.map(
      (i) => i.title,
    );

  it("filter by tag, ignoring case, within the store", async () => {
    expect(await titles({ tag: "kitchen" })).toEqual(["Enamel saucepan", "Stoneware mug"]);
    expect(await titles({ tag: " KITCHEN " })).toEqual(["Enamel saucepan", "Stoneware mug"]);
    expect(await titles({ tag: "sister-only" })).toEqual([]);
    expect(await titles({ tag: "other-org-secret" })).toEqual([]);
    expect(await titles({ tag: "%" })).toEqual([]);
  });

  it("filter by category, including everything under it", async () => {
    expect(await titles({ category: "hg-kd-cookware" })).toEqual(["Enamel saucepan"]);
    expect(await titles({ category: "hg-kd" })).toEqual(["Enamel saucepan", "Stoneware mug"]);
    expect(await titles({ category: "hg" })).toEqual(["Enamel saucepan", "Stoneware mug"]);
    // Another store's category (hg-decor) is not this store's business.
    expect(await titles({ category: "hg-decor" })).toEqual([]);
    expect(await titles({ category: "unknown' OR 1=1 --" })).toEqual([]);
    expect(await titles({ category: "hg", tag: "ceramics" })).toEqual(["Stoneware mug"]);
  });

  it("show tags and the category name per row, and offer the store's facets", async () => {
    const page = await listProducts(storeOf(a), { sort: "title_asc" });
    expect(page.items.find((i) => i.title === "Stoneware mug")).toMatchObject({
      tags: ["kitchen", "Ceramics"],
      categoryName: "Mugs",
    });
    expect(page.tags.map((t) => t.toLowerCase())).toEqual([
      "ceramics",
      "cookware",
      "garden",
      "kitchen",
    ]);
    expect(page.tags).not.toContain("sister-only");
    expect(page.categories.map((c) => c.code)).toEqual([
      "hg",
      "hg-kd",
      "hg-kd-cookware",
      "hg-kd-drinkware",
      "hg-kd-drinkware-mugs",
    ]);
    expect(page.categories[2]?.path).toEqual(["Home & Garden", "Kitchen & Dining", "Cookware"]);
  });

  it("cost the same number of queries for one product or many (no N+1)", async () => {
    const store = storeOf(a);
    const one = await countQueries(() => listProducts(store, { tag: "cookware" }));
    const many = await countQueries(() => listProducts(store, { category: "hg" }));
    const all = await countQueries(() => listProducts(store, {}));
    expect(one.result.items.length).toBe(1);
    expect(all.result.items.length).toBeGreaterThan(2);
    expect(many.queries.length).toBe(one.queries.length);
    expect(all.queries.length).toBe(one.queries.length);
  });

  it("use the indexes for the tag and category filters", async () => {
    type Plan = { "QUERY PLAN": string }[];
    const explain = (query: (tx: Prisma.TransactionClient) => Promise<Plan>) =>
      migratorDb().$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
        return (await query(tx)).map((r) => r["QUERY PLAN"]).join("\n");
      });
    expect(
      await explain(
        (tx) => tx.$queryRaw<Plan>`EXPLAIN SELECT id FROM "Product"
          WHERE catalogue_tags_folded(tags) @> ARRAY['kitchen']::text[]`,
      ),
    ).toContain("Product_tags_folded");
    expect(
      await explain(
        (tx) => tx.$queryRaw<Plan>`EXPLAIN SELECT id FROM "Product"
          WHERE "categoryCode" = 'hg-kd-cookware'`,
      ),
    ).toContain("Product_categoryCode_storeId_idx");
  });
});

describe("public product DTO", () => {
  it("carries the category breadcrumb, tags and product type, never codes", async () => {
    const s = storeOf(a);
    await updateProduct(s, p["mug"] ?? "", { productType: "Mugs" });
    const dto = await readStorefront(
      { organisationId: s.organisationId, storeId: s.storeId },
      (r) => r.product("stoneware-mug"),
    );
    expect(dto).toMatchObject({
      productType: "Mugs",
      tags: ["kitchen", "Ceramics"],
      category: {
        name: "Mugs",
        path: ["Home & Garden", "Kitchen & Dining", "Drinkware", "Mugs"],
      },
    });
    expect(JSON.stringify(dto)).not.toContain("hg-kd");
  });
});

/** A product's internal id (for fixtures written as the schema owner). */
async function rawId(key: string): Promise<string | undefined> {
  const { parseTypeId } = await import("@storevia/types");
  return parseTypeId("product", p[key] ?? "") ?? undefined;
}
