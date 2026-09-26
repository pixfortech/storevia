// Storefront read models and carts (ADR-0028 §7–§8) through the storefront
// role, with data created by the real merchant services. Proves the public
// DTOs hold only sellable, public data, that nothing crosses stores, that the
// cart never trusts the browser, and the per-page query budget (M4-09).
import {
  countQueries,
  disconnectTestClients,
  migratorDb,
  truncateAll,
} from "@storevia/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addProductsToCollection,
  archiveProduct,
  createCollection,
  createProduct,
  getProduct,
  setCollectionArchived,
  setProductStatus,
  updateVariants,
} from "../src";
import {
  CART_LIMITS,
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
const ids: Record<string, string> = {};
const variant: Record<string, string> = {};
let storeA: CartStore;
let storeB: CartStore;

const scopeOf = (tenant: Tenant): CartStore => {
  const s = storeOf(tenant);
  return { organisationId: s.organisationId, storeId: s.storeId, currency: "INR" };
};

async function product(
  tenant: Tenant,
  key: string,
  input: { title: string; price: string; stock?: number; status?: "ACTIVE" | "DRAFT" },
) {
  const ctx = storeOf(tenant);
  const { productId } = await createProduct(ctx, {
    title: input.title,
    price: input.price,
    initialStock: input.stock ?? 5,
    status: input.status ?? "ACTIVE",
    description: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: `${input.title} description` }] },
      ],
    },
  });
  ids[key] = productId;
  variant[key] = (await getProduct(ctx, productId)).variants[0]?.id ?? "";
}

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("sf-a");
  b = await makeTenant("sf-b");
  storeA = scopeOf(a);
  storeB = scopeOf(b);
  await product(a, "mug", { title: "Stoneware Mug", price: "999.50", stock: 3 });
  await product(a, "bowl", { title: "Serving Bowl", price: "1,500", stock: 2 });
  await product(a, "sold", { title: "Sold Out Vase", price: "2000", stock: 0 });
  await product(a, "draft", { title: "Draft Plate", price: "500", status: "DRAFT" });
  await product(a, "archived", { title: "Old Jug", price: "700" });
  await archiveProduct(storeOf(a), ids["archived"] ?? "");
  await product(b, "other", { title: "Other Store Mug", price: "100" });
  const ctx = storeOf(a);
  ids["summer"] = (await createCollection(ctx, { title: "Summer" })).collectionId;
  ids["winter"] = (await createCollection(ctx, { title: "Winter" })).collectionId;
  for (const c of ["summer", "winter"]) {
    await addProductsToCollection(ctx, ids[c] ?? "", {
      productIds: [ids["mug"], ids["sold"], ids["draft"]] as string[],
    });
  }
  await setCollectionArchived(ctx, ids["winter"] ?? "", true);
});

afterAll(disconnectTestClients);

describe("public read models", () => {
  it("the catalogue lists sellable products only, with prices and availability flags", async () => {
    const lists = await readStorefront(storeA, (r) =>
      r.productLists([{ source: { type: "catalogue" }, limit: 10 }]),
    );
    const cards = [...lists.values()][0] ?? [];
    expect(cards.map((c) => c.title).sort()).toEqual([
      "Serving Bowl",
      "Sold Out Vase",
      "Stoneware Mug",
    ]);
    const mug = cards.find((c) => c.title === "Stoneware Mug");
    expect(mug).toEqual({
      id: ids["mug"],
      handle: "stoneware-mug",
      title: "Stoneware Mug",
      price: { amount: "99950", currency: "INR" },
      compareAtPrice: null,
      priceVaries: false,
      image: null,
      available: true,
    });
    expect(cards.find((c) => c.title === "Sold Out Vase")?.available).toBe(false);
  });

  it("the product page DTO holds public fields only", async () => {
    const mug = await readStorefront(storeA, (r) => r.product("stoneware-mug"));
    expect(mug).toMatchObject({ id: ids["mug"], title: "Stoneware Mug", images: [], options: [] });
    expect(Object.keys(mug ?? {}).sort()).toEqual(
      [
        "description",
        "handle",
        "id",
        "images",
        "options",
        "seoDescription",
        "seoTitle",
        "title",
        "updatedAt",
        "variants",
        "vendor",
      ].sort(),
    );
    expect(Object.keys(mug?.variants[0] ?? {}).sort()).toEqual(
      ["available", "compareAtPrice", "id", "image", "optionValues", "price", "title"].sort(),
    );
    expect(mug?.description).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Stoneware Mug description" }] },
      ],
    });
  });

  it("drafts, archived products and other stores' products read as not found", async () => {
    await readStorefront(storeA, async (r) => {
      expect(await r.product("draft-plate")).toBeNull();
      expect(await r.product("old-jug")).toBeNull();
      expect(await r.product("other-store-mug")).toBeNull();
    });
    expect(await readStorefront(storeB, (r) => r.product("stoneware-mug"))).toBeNull();
  });

  it("collections page their sellable products; archived collections are not found", async () => {
    const summer = await readStorefront(storeA, (r) => r.collection("summer", 1, 1));
    expect(summer).toMatchObject({
      id: ids["summer"],
      title: "Summer",
      total: 2,
      pageCount: 2,
      page: 1,
    });
    expect(summer?.products).toHaveLength(1);
    const page2 = await readStorefront(storeA, (r) => r.collection("summer", 2, 1));
    expect(
      [...(summer?.products ?? []), ...(page2?.products ?? [])].map((p) => p.title).sort(),
    ).toEqual(["Sold Out Vase", "Stoneware Mug"]);
    expect(await readStorefront(storeA, (r) => r.collection("winter", 1))).toBeNull();
    expect(await readStorefront(storeB, (r) => r.collection("summer", 1))).toBeNull();
  });

  it("search matches sellable products and treats input as text", async () => {
    await readStorefront(storeA, async (r) => {
      expect((await r.search("mug", 1)).products.map((p) => p.title)).toEqual(["Stoneware Mug"]);
      expect((await r.search("  SERVING   bowl ", 1)).query).toBe("SERVING bowl");
      expect((await r.search("", 1)).total).toBe(3);
      expect((await r.search("plate", 1)).total).toBe(0);
      for (const hostile of [
        "%",
        "_",
        '\'; DROP TABLE "Product"; --',
        "a & b | !c",
        "\\",
        "<script>",
      ]) {
        await expect(r.search(hostile, 1)).resolves.toMatchObject({ page: 1 });
      }
    });
    expect(
      (await readStorefront(storeB, (r) => r.search("mug", 1))).products.map((p) => p.title),
    ).toEqual(["Other Store Mug"]);
  });

  it("links resolve only to this store's sellable targets", async () => {
    const links = await readStorefront(storeA, (r) =>
      r.links({
        products: [ids["mug"], ids["draft"], ids["other"], "prod_garbage"] as string[],
        collections: [ids["summer"], ids["winter"]] as string[],
      }),
    );
    expect([...links.products]).toEqual([[ids["mug"], "stoneware-mug"]]);
    expect([...links.collections]).toEqual([[ids["summer"], "summer"]]);
  });

  it("published pages come from the page's published version only", async () => {
    expect(await readStorefront(storeA, (_r, site) => site.publishedPage("HOME"))).toBeNull();
    const db = migratorDb();
    const page = "0190f2a4-0000-7000-8000-00000000f001";
    const version = "0190f2a4-0000-7000-8000-00000000f002";
    await db.$transaction([
      db.$executeRaw`INSERT INTO "Page" (id, "organisationId", "storeId", kind, title, handle, "updatedAt")
        VALUES (${page}::uuid, ${storeA.organisationId}::uuid, ${storeA.storeId}::uuid, 'HOME', 'Home', 'home', now())`,
      db.$executeRaw`INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state, "schemaVersion", document, "documentHash", "publishedAt", "updatedAt")
        VALUES (${version}::uuid, ${storeA.organisationId}::uuid, ${storeA.storeId}::uuid, ${page}::uuid, 1, 'PUBLISHED', 1,
                '{"schemaVersion":1,"root":[]}', ${"a".repeat(64)}, now(), now())`,
      db.$executeRaw`UPDATE "Page" SET "publishedVersionId" = ${version}::uuid WHERE id = ${page}::uuid`,
    ]);
    const home = await readStorefront(storeA, (_r, site) => site.publishedPage("HOME"));
    expect(home).toMatchObject({ kind: "HOME", document: { schemaVersion: 1, root: [] } });
    expect(await readStorefront(storeB, (_r, site) => site.publishedPage("HOME"))).toBeNull();
  });

  it("the catalogue sitemap lists sellable products and live collections", async () => {
    const entries = await readStorefront(storeA, (r) => r.sitemap());
    expect(entries.map((e) => e.path)).toEqual([
      "/collections/summer",
      "/products/serving-bowl",
      "/products/sold-out-vase",
      "/products/stoneware-mug",
    ]);
  });

  it("a read-only transaction: the reader can't write", async () => {
    await expect(
      readStorefront(
        storeA,
        (r) =>
          (r as unknown as { tx: { $executeRaw: (s: TemplateStringsArray) => Promise<number> } }).tx
            .$executeRaw`DELETE FROM "CartLine"`,
      ),
    ).rejects.toThrow(/read-only/);
  });
});

describe("query budget (M4-09): an uncached page render costs at most 8 queries, site and catalogue reads together", () => {
  it.each([
    [
      "home",
      async () =>
        readStorefront(storeA, async (r, site) => {
          await site.publishedPage("HOME");
          await r.productLists([
            { source: { type: "catalogue" }, limit: 8 },
            { source: { type: "collection", id: ids["summer"] ?? "" }, limit: 4 },
          ]);
          await r.links({
            products: [ids["mug"] ?? ""],
            collections: [ids["summer"] ?? ""],
          });
          await site.pageLinks([]);
          await site.media([]);
          await r.navigationCollections();
        }),
    ],
    [
      "product",
      async () =>
        readStorefront(storeA, async (r, site) => {
          await site.publishedPage("PRODUCT_TEMPLATE");
          await r.product("stoneware-mug");
          await r.navigationCollections();
        }),
    ],
    [
      "collection",
      async () =>
        readStorefront(storeA, async (r, site) => {
          await site.publishedPage("COLLECTION_TEMPLATE");
          await r.collection("summer", 1);
          await r.navigationCollections();
        }),
    ],
    [
      "search",
      async () =>
        readStorefront(storeA, async (r, site) => {
          await site.publishedPage("SEARCH_TEMPLATE");
          await r.search("mug", 1);
          await r.navigationCollections();
        }),
    ],
  ])("%s", async (_page, load) => {
    const { queries } = await countQueries(load);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.length).toBeLessThanOrEqual(8);
  });

  it("a product list costs the same queries for 2 or 40 products (no N+1)", async () => {
    const small = await countQueries(() =>
      readStorefront(storeA, (r) => r.productLists([{ source: { type: "catalogue" }, limit: 2 }])),
    );
    const large = await countQueries(() =>
      readStorefront(storeA, (r) => r.productLists([{ source: { type: "catalogue" }, limit: 40 }])),
    );
    expect(large.queries.length).toBe(small.queries.length);
  });
});

describe("carts", () => {
  const ctxA = (token: string | null) => ({ store: storeA, token, clientIp: "203.0.113.7" });

  it("adding creates a cart with a fresh token and prices it on the server", async () => {
    const first = await addToCart(ctxA(null), { variantId: variant["mug"], quantity: 2 });
    expect(first.newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.cart).toMatchObject({
      itemCount: 2,
      subtotal: { amount: "199900", currency: "INR" },
      lines: [
        {
          productTitle: "Stoneware Mug",
          quantity: 2,
          unitPrice: { amount: "99950" },
          lineTotal: { amount: "199900" },
          available: true,
        },
      ],
    });
    // Only the hash is stored.
    const stored = await migratorDb().cart.findFirstOrThrow();
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).not.toContain(first.newToken ?? "x");

    const again = await addToCart(ctxA(first.newToken), { variantId: variant["mug"], quantity: 1 });
    expect(again.newToken).toBeNull();
    expect(again.cart.lines[0]?.quantity).toBe(3);
    const clamped = await addToCart(ctxA(first.newToken), {
      variantId: variant["mug"],
      quantity: 500,
    });
    expect(clamped.cart.lines[0]?.quantity).toBe(CART_LIMITS.maxQuantity);
  });

  it("prices always come from current variant prices, never the cart", async () => {
    const { newToken } = await addToCart(ctxA(null), { variantId: variant["bowl"], quantity: 1 });
    await updateVariants(storeOf(a), ids["bowl"] ?? "", {
      variants: [{ variantId: variant["bowl"], price: "1,250" }],
    });
    const cart = await readCart(storeA, newToken);
    expect(cart.subtotal).toEqual({ amount: "125000", currency: "INR" });
  });

  it("refuses sold-out, draft, archived, deleted and other stores' variants", async () => {
    await expectCode(addToCart(ctxA(null), { variantId: variant["sold"] }), "CONFLICT");
    await expectCode(addToCart(ctxA(null), { variantId: variant["draft"] }), "NOT_FOUND");
    await expectCode(addToCart(ctxA(null), { variantId: variant["archived"] }), "NOT_FOUND");
    await expectCode(addToCart(ctxA(null), { variantId: variant["other"] }), "NOT_FOUND");
    await expectCode(addToCart(ctxA(null), { variantId: ids["mug"] }), "NOT_FOUND"); // a product id, not a variant id
    await expectCode(addToCart(ctxA(null), { variantId: { $ne: null } }), "NOT_FOUND");
  });

  it("another store's cart token, or a garbage token, never reaches an existing cart", async () => {
    const { newToken: tokenB } = await addToCart(
      { store: storeB, token: null, clientIp: null },
      { variantId: variant["other"] },
    );
    const onA = await addToCart(ctxA(tokenB), { variantId: variant["mug"] });
    expect(onA.newToken).not.toBeNull();
    expect(onA.newToken).not.toBe(tokenB);
    expect(onA.cart.lines.map((l) => l.productTitle)).toEqual(["Stoneware Mug"]);
    expect((await readCart(storeA, tokenB)).lines).toEqual([]);
    expect((await readCart(storeB, tokenB)).lines.map((l) => l.productTitle)).toEqual([
      "Other Store Mug",
    ]);
    expect((await readCart(storeA, "not a token")).lines).toEqual([]);
    expect(
      (await addToCart(ctxA("a".repeat(43)), { variantId: variant["mug"] })).newToken,
    ).not.toBeNull();
  });

  it("updates and removes lines; unknown lines are not found", async () => {
    const { newToken } = await addToCart(ctxA(null), { variantId: variant["mug"], quantity: 1 });
    const updated = await updateCartLine(ctxA(newToken), {
      variantId: variant["mug"],
      quantity: 4,
    });
    expect(updated.cart.itemCount).toBe(4);
    await expectCode(
      updateCartLine(ctxA(newToken), { variantId: variant["bowl"], quantity: 1 }),
      "NOT_FOUND",
    );
    await expectCode(
      updateCartLine(ctxA(null), { variantId: variant["mug"], quantity: 1 }),
      "NOT_FOUND",
    );
    const removed = await removeCartLine(ctxA(newToken), { variantId: variant["mug"] });
    expect(removed.cart.lines).toEqual([]);
    expect(
      (await removeCartLine(ctxA(newToken), { variantId: variant["mug"] })).cart.lines,
    ).toEqual([]);
  });

  it("a product that stops being sellable leaves the cart view and the subtotal", async () => {
    await product(a, "temp", { title: "Temporary Cup", price: "300" });
    const { newToken } = await addToCart(ctxA(null), { variantId: variant["temp"], quantity: 2 });
    await addToCart(ctxA(newToken), { variantId: variant["mug"], quantity: 1 });
    await setProductStatus(storeOf(a), ids["temp"] ?? "", "DRAFT");
    const cart = await readCart(storeA, newToken);
    expect(cart.lines.map((l) => l.productTitle)).toEqual(["Stoneware Mug"]);
    expect(cart.subtotal.amount).toBe("99950");
  });

  it("a cart holds at most 50 different items", async () => {
    const { newToken } = await addToCart(ctxA(null), { variantId: variant["mug"] });
    const db = migratorDb();
    const cart = await db.cart.findFirstOrThrow({
      where: { storeId: storeA.storeId },
      orderBy: { createdAt: "desc" },
    });
    // Fill with 49 more distinct variants of one product (fixture rows).
    const productId = (await db.product.findFirstOrThrow({ where: { title: "Serving Bowl" } })).id;
    for (let i = 0; i < CART_LIMITS.maxLines - 1; i++) {
      const v = await db.productVariant.create({
        data: {
          organisationId: storeA.organisationId,
          storeId: storeA.storeId,
          productId,
          title: `Extra ${String(i)}`,
          optionSignature: `extra-${String(i)}`,
          currency: "INR",
          priceAmount: 100n,
          position: 10 + i,
        },
      });
      await db.cartLine.create({
        data: {
          organisationId: storeA.organisationId,
          storeId: storeA.storeId,
          cartId: cart.id,
          variantId: v.id,
          quantity: 1,
        },
      });
    }
    await expectCode(addToCart(ctxA(newToken), { variantId: variant["bowl"] }), "CONFLICT");
    // Adding to an existing line still works.
    await expect(addToCart(ctxA(newToken), { variantId: variant["mug"] })).resolves.toMatchObject({
      newToken: null,
    });
  });

  it("mutations are rate limited per client address", async () => {
    const ctx = { store: storeA, token: null, clientIp: "198.51.100.99" };
    const results = await Promise.allSettled(
      Array.from({ length: 125 }, () => addToCart(ctx, { variantId: variant["draft"] })),
    );
    const codes = results.map((r) =>
      r.status === "rejected" ? (r.reason as { code?: string }).code : "ok",
    );
    expect(codes.filter((c) => c === "RATE_LIMITED").length).toBeGreaterThan(0);
    expect(codes.filter((c) => c === "NOT_FOUND").length).toBeLessThanOrEqual(120);
  });
});
