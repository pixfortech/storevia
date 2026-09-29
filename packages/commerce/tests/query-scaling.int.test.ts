// Query counts as the data grows (M8 performance/load, on the M4-09 query
// harness). Each storefront route is read the way apps/storefront's
// route-data.ts reads it (page, product or collection, resolved sections,
// chrome, the cart with its header count), and each dashboard list the way
// its page reads it, once for a small store and once for a store with eight
// times the catalogue, three times the variants, six times the collections,
// twenty times the cart lines and eight times the orders, beside four other
// populated stores. The counts must be equal: nothing issues a query per
// product, variant, collection, menu link, cart line, order or store.
//
// The ceilings are the counts measured when this was written plus a little
// headroom (docs/operations/load-testing.md): storefront home 3, product 2,
// collection 3, chrome 3, cart page 2 (the header count and the page share
// one read per request, apps/storefront/src/lib/cart.ts); dashboard products list 5, product editor 14, orders list 2, order
// detail 17, customers list 1. Raising one is a decision, not a fix-up.
import {
  countQueries,
  disconnectTestClients,
  migratorDb,
  truncateAll,
} from "@storevia/database/testing";
import { upgradeDocument, validateDocument, type PageDocument } from "@storevia/editor/document";
import { NAVIGATION_HANDLES, usableNavigationItems } from "@storevia/editor/navigation";
import { saveMenu } from "@storevia/site-admin";
import type { StoreContext } from "@storevia/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addProductsToCollection,
  changeProductOptions,
  connectTestPayments,
  createCollection,
  createProduct,
  createShippingRate,
  createShippingZone,
  getOrder,
  getProduct,
  listCollections,
  listCustomers,
  listOrders,
  listProducts,
} from "../src";
import { STOREVIA_REGISTRY, STOREVIA_TEMPLATES, type StoreviaPageKind } from "../src/blocks";
import {
  beginPayment,
  getCheckout,
  selectShippingRate,
  simulateTestPayment,
  startCheckout,
  updateAddress,
  updateContact,
  type CheckoutStore,
} from "../src/checkout";
import { STOREVIA_SITE } from "../src/site";
import {
  addToCart,
  readCart,
  readStorefront,
  resolveDocumentData,
  type CartStore,
} from "../src/storefront";
import { makeOrderLive, makeTenant, storeOf } from "./fixtures";

// Resolving media signs local media URLs; CI provides no secret for them.
process.env["MEDIA_UPLOAD_SECRET"] ??= "commerce-query-scaling-media-secret-00000000";

interface Shape {
  /** Simple products (one variant each). */
  readonly products: number;
  /** Values per option of the one product with options (3 options). */
  readonly optionValues: readonly [number, number, number];
  readonly collections: number;
  /** Menu links to products and to collections (main and footer). */
  readonly menuLinks: number;
  readonly cartLines: number;
  readonly orders: number;
  /** Lines on the first order. */
  readonly orderLines: number;
}

const SMALL: Shape = {
  products: 5,
  optionValues: [2, 2, 1],
  collections: 1,
  menuLinks: 1,
  cartLines: 1,
  orders: 1,
  orderLines: 1,
};
const LARGE: Shape = {
  products: 40,
  optionValues: [2, 3, 2],
  collections: 6,
  menuLinks: 8,
  cartLines: 20,
  orders: 8,
  orderLines: 4,
};

interface Fixture {
  readonly ctx: StoreContext;
  readonly scope: CheckoutStore;
  readonly productHandle: string;
  readonly productId: string;
  readonly collectionHandle: string;
  readonly cartToken: string;
  readonly orderId: string;
}

const checkoutStore = (ctx: StoreContext): CheckoutStore => ({
  organisationId: ctx.organisationId,
  storeId: ctx.storeId,
  currency: "INR",
  name: "Query scaling",
});

const values = (name: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ value: `${name} ${String(i + 1)}` }));

async function placeOrder(store: CheckoutStore, variantIds: readonly string[], n: number) {
  let cartToken: string | null = null;
  for (const variantId of variantIds) {
    const r = await addToCart(
      { store, token: cartToken, clientIp: null },
      { variantId, quantity: 1 },
    );
    cartToken = r.newToken ?? cartToken;
  }
  const { token } = await startCheckout({ store, token: null, clientIp: null, cartToken });
  const req = { store, token, clientIp: null };
  await updateContact(req, { email: `shopper-${String(n)}@example.test` });
  await updateAddress(req, {
    firstName: "Asha",
    lastName: "Rao",
    line1: "12 MG Road",
    city: "Bengaluru",
    regionCode: "KA",
    postalCode: "560001",
    countryCode: "IN",
  });
  const priced = await getCheckout(req);
  const view = await selectShippingRate(req, { rateId: priced?.shippingOptions[0]?.id });
  const started = await beginPayment(req, {
    pricingHash: view.pricingHash,
    returnUrl: "http://shop.test/checkout/return",
  });
  if (started.kind !== "redirect") throw new Error("payment did not start");
  await simulateTestPayment(req, new URL(started.url).searchParams.get("ref") ?? "", "captured");
  // A live order, so the default order list shows it.
  const order = await migratorDb().order.findFirstOrThrow({
    where: { storeId: store.storeId },
    orderBy: { orderNumber: "desc" },
  });
  await makeOrderLive(order.id);
}

/** A store with `shape`'s data, created through the merchant, storefront and checkout services. */
async function populate(ctx: StoreContext, shape: Shape, label: string): Promise<Fixture> {
  const simple: { id: string; variantId: string }[] = [];
  for (let i = 0; i < shape.products; i += 1) {
    const { productId } = await createProduct(ctx, {
      title: `${label} product ${String(i + 1)}`,
      price: String(100 + i),
      tags: ["kitchen", `tag-${String(i % 4)}`],
      initialStock: 50,
      status: "ACTIVE",
    });
    const variantId = (await getProduct(ctx, productId)).variants[0]?.id ?? "";
    simple.push({ id: productId, variantId });
  }
  const { productId } = await createProduct(ctx, {
    title: `${label} options`,
    price: "500",
    status: "ACTIVE",
  });
  const [colours, sizes, finishes] = shape.optionValues;
  await changeProductOptions(ctx, productId, {
    options: [
      { name: "Colour", values: values("Colour", colours) },
      { name: "Size", values: values("Size", sizes) },
      { name: "Finish", values: values("Finish", finishes) },
    ],
  });
  const detail = await getProduct(ctx, productId);
  expect(detail.variants).toHaveLength(colours * sizes * finishes);

  const collectionIds: string[] = [];
  for (let c = 0; c < shape.collections; c += 1) {
    const { collectionId } = await createCollection(ctx, {
      title: `${label} collection ${String(c + 1)}`,
    });
    await addProductsToCollection(ctx, collectionId, {
      productIds: [productId, ...simple.map((p) => p.id)],
    });
    collectionIds.push(collectionId);
  }

  // Menus link to products and collections, so the chrome resolves them.
  const links = Array.from({ length: shape.menuLinks }, (_, i) =>
    i % 2 === 0
      ? { type: "product", id: simple[i % simple.length]?.id ?? productId }
      : { type: "collection", id: collectionIds[((i - 1) / 2) % collectionIds.length] ?? "" },
  );
  for (const handle of NAVIGATION_HANDLES) {
    await saveMenu(
      ctx,
      handle,
      {
        revision: 0,
        items: [
          { id: `${handle[0] ?? "m"}Home0000000`, label: "Home", link: { type: "home" } },
          ...links.map((link, i) => ({
            id: `${handle[0] ?? "m"}Link${String(i).padStart(7, "0")}`,
            label: `Link ${String(i + 1)}`,
            link,
          })),
        ],
      },
      STOREVIA_SITE,
    );
  }

  const scope = checkoutStore(ctx);
  const { zoneId } = await createShippingZone(ctx, { name: "India", countries: "IN" });
  await createShippingRate(ctx, zoneId, { name: "Standard", type: "FLAT", amount: "40" });
  await connectTestPayments(ctx);
  for (let n = 0; n < shape.orders; n += 1) {
    const lines = n === 0 ? shape.orderLines : 1;
    await placeOrder(
      scope,
      Array.from({ length: lines }, (_, i) => simple[(n + i) % simple.length]?.variantId ?? ""),
      n,
    );
  }
  const orders = await listOrders(ctx, {}, 50);
  const first = orders.items.find(
    (o) => o.number === Math.min(...orders.items.map((i) => i.number)),
  );

  let cartToken: string | null = null;
  for (let i = 0; i < shape.cartLines; i += 1) {
    const variantId = simple[i % simple.length]?.variantId ?? "";
    const r = await addToCart(
      { store: scope, token: cartToken, clientIp: null },
      { variantId, quantity: 1 },
    );
    cartToken = r.newToken ?? cartToken;
  }

  const collections = await listCollections(ctx);
  return {
    ctx,
    scope,
    productHandle: detail.handle,
    productId,
    collectionHandle: collections.find((c) => c.id === collectionIds[0])?.handle ?? "",
    cartToken: cartToken ?? "",
    orderId: first?.id ?? "",
  };
}

// --- The storefront's reads, as apps/storefront/src/lib/route-data.ts makes them ----

function usable(raw: unknown, kind: StoreviaPageKind): PageDocument | null {
  const result = validateDocument(upgradeDocument(raw), {
    registry: STOREVIA_REGISTRY,
    pageKind: kind,
  });
  return result.ok ? result.document : null;
}

type Route = "home" | "product" | "collection";
const KIND: Record<Route, Exclude<StoreviaPageKind, "STANDARD">> = {
  home: "HOME",
  product: "PRODUCT_TEMPLATE",
  collection: "COLLECTION_TEMPLATE",
};

function routeRead(f: Fixture, route: Route) {
  const kind = KIND[route];
  return readStorefront(f.scope, async (reader, site) => {
    const page = await site.page(kind);
    const document = (page ? usable(page.document, kind) : null) ?? STOREVIA_TEMPLATES[kind];
    const product = route === "product" ? await reader.product(f.productHandle) : null;
    const collection =
      route === "collection" ? await reader.collection(f.collectionHandle, 1) : null;
    const { data } = await resolveDocumentData([document], STOREVIA_REGISTRY, reader, site);
    return { product, collection, data };
  });
}

function chromeRead(f: Fixture) {
  return readStorefront(f.scope, async (reader, site) => {
    const [, menus] = await Promise.all([site.theme(), site.navigation(NAVIGATION_HANDLES)]);
    const main = usableNavigationItems(menus.get("main"), STOREVIA_REGISTRY.linkSchema);
    const footer = usableNavigationItems(menus.get("footer"), STOREVIA_REGISTRY.linkSchema);
    const { data } = await resolveDocumentData([], STOREVIA_REGISTRY, reader, site, [
      ...main.map((i) => i.link),
      ...footer.map((i) => i.link),
    ]);
    const fallback = menus.has("main") ? [] : await reader.navigationCollections();
    return { main, footer, data, fallback };
  });
}

/**
 * The cart page: one read per request serves the header's item count and
 * the cart itself (the storefront memoises it per request).
 */
async function cartRead(f: Fixture) {
  const store: CartStore = f.scope;
  const cart = await readCart(store, f.cartToken);
  return { count: cart.itemCount, cart };
}

let small: Fixture;
let large: Fixture;

beforeAll(async () => {
  await truncateAll();
  const a = await makeTenant("scale-small");
  const b = await makeTenant("scale-large", {
    plan: "enterprise",
    stores: Array.from({ length: 5 }, () => ({ currency: "INR" })),
  });
  small = await populate(storeOf(a), SMALL, "Small");
  large = await populate(storeOf(b), LARGE, "Large");
  // Four more populated stores in the same database: other tenants' rows
  // must not change what one store's pages cost.
  for (let i = 1; i < 5; i += 1) await populate(storeOf(b, i), SMALL, `Other ${String(i)}`);
}, 300_000);

afterAll(disconnectTestClients);

/** Counts `read` for both stores; returns the counts after checking what was read. */
async function compare<T>(
  read: (f: Fixture) => Promise<T>,
  check: (small: T, large: T) => void,
): Promise<{ small: number; large: number }> {
  // One read first: the first query of a fresh client does its own set-up.
  await read(small);
  const s = await countQueries(() => read(small));
  const l = await countQueries(() => read(large));
  check(s.result, l.result);
  return { small: s.queries.length, large: l.queries.length };
}

describe("storefront pages cost the same queries however large the store (no N+1)", () => {
  it("home: collections and latest products", async () => {
    const counts = await compare(
      (f) => routeRead(f, "home"),
      (s, l) => {
        expect(s.data.productLists.length).toBeGreaterThan(0);
        expect(l.data.productLists[0]?.[1]).toHaveLength(8);
        expect(l.data.collectionLists[0]?.[1]).toHaveLength(LARGE.collections);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(4);
  });

  it("product page: 4 or 12 variants", async () => {
    const counts = await compare(
      (f) => routeRead(f, "product"),
      (s, l) => {
        expect(s.product?.variants).toHaveLength(4);
        expect(l.product?.variants).toHaveLength(12);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(3);
  });

  it("collection page: 6 or 41 products", async () => {
    const counts = await compare(
      (f) => routeRead(f, "collection"),
      (s, l) => {
        expect(s.collection?.total).toBe(SMALL.products + 1);
        expect(l.collection?.total).toBe(LARGE.products + 1);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(4);
  });

  it("store chrome: theme and menus with 1 or 8 product and collection links", async () => {
    const counts = await compare(chromeRead, (s, l) => {
      expect(s.main).toHaveLength(SMALL.menuLinks + 1);
      expect(l.main).toHaveLength(LARGE.menuLinks + 1);
      expect(l.data.links.products.length + l.data.links.collections.length).toBe(LARGE.menuLinks);
    });
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(4);
  });

  it("cart page: 1 or 20 lines (header count and cart)", async () => {
    const counts = await compare(cartRead, (s, l) => {
      expect(s.cart.lines).toHaveLength(SMALL.cartLines);
      expect(l.cart.lines).toHaveLength(LARGE.cartLines);
      expect(l.count).toBe(LARGE.cartLines);
    });
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(3);
  });
});

describe("dashboard lists cost the same queries however large the store (no N+1)", () => {
  it("products list: 6 or 41 products", async () => {
    const counts = await compare(
      (f) => listProducts(f.ctx, { limit: 100 }),
      (s, l) => {
        expect(s.items).toHaveLength(SMALL.products + 1);
        expect(l.items).toHaveLength(LARGE.products + 1);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(6);
  });

  it("product editor: 4 or 12 variants", async () => {
    const counts = await compare(
      (f) => getProduct(f.ctx, f.productId),
      (s, l) => {
        expect(s.variants).toHaveLength(4);
        expect(l.variants).toHaveLength(12);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(16);
  });

  it("orders list: 1 or 8 orders", async () => {
    const counts = await compare(
      (f) => listOrders(f.ctx, {}),
      (s, l) => {
        expect(s.items).toHaveLength(SMALL.orders);
        expect(l.items).toHaveLength(LARGE.orders);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(3);
  });

  it("order detail: 1 or 4 lines", async () => {
    const counts = await compare(
      (f) => getOrder(f.ctx, f.orderId),
      (s, l) => {
        expect(s.lines).toHaveLength(SMALL.orderLines);
        expect(l.lines).toHaveLength(LARGE.orderLines);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(20);
  });

  it("customers list: 1 or 8 customers", async () => {
    const counts = await compare(
      (f) => listCustomers(f.ctx, {}),
      (s, l) => {
        expect(s.items).toHaveLength(SMALL.orders);
        expect(l.items).toHaveLength(LARGE.orders);
      },
    );
    expect(counts.large).toBe(counts.small);
    expect(counts.large).toBeLessThanOrEqual(2);
  });
});
