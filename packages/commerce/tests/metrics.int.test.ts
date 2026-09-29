// Store home sales figures (orders/metrics.ts) against the database: orders
// placed through the real checkout, then cancelled, refunded and moved back
// in time, and read as the dashboard reads them: by store-timezone day,
// with the period before, under RBAC and tenancy.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cancelOrder,
  connectTestPayments,
  createProduct,
  createShippingRate,
  createShippingZone,
  getCustomer,
  getProduct,
  listCustomers,
  listOrders,
  orderMetrics,
  refundOrder,
  storeCustomerSummary,
  storeSalesSummary,
} from "../src";
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
import { addToCart } from "../src/storefront";
import {
  expectCode,
  makeOrderLive,
  makeTenant,
  memberContext,
  steppedUp,
  storeOf,
  type Tenant,
} from "./fixtures";

let a: Tenant;
let b: Tenant;
const shop: Record<"a" | "b", CheckoutStore> = {} as Record<"a" | "b", CheckoutStore>;
const variant: Record<string, string> = {};
const product: Record<string, string> = {};
let ip = 0;
const DAY = 86_400_000;

async function setUpStore(tenant: Tenant, key: "a" | "b") {
  const s = storeOf(tenant);
  shop[key] = {
    organisationId: s.organisationId,
    storeId: s.storeId,
    currency: "INR",
    name: `Store ${key}`,
  };
  for (const [name, price] of [
    ["tee", "500"],
    ["cap", "300"],
  ] as const) {
    const { productId } = await createProduct(s, {
      title: `${key} ${name}`,
      price,
      initialStock: 50,
      status: "ACTIVE",
    });
    product[`${key}:${name}`] = productId;
    variant[`${key}:${name}`] = (await getProduct(s, productId)).variants[0]?.id ?? "";
  }
  const { zoneId } = await createShippingZone(s, { name: "India", countries: "IN" });
  await createShippingRate(s, zoneId, { name: "Standard", type: "FLAT", amount: "40" });
  await connectTestPayments(s);
}

/**
 * Places a paid order through the real checkout; returns its public id.
 * The Test Provider's orders are test orders; unless `test` is set, the
 * order is made a live one so the sales figures have something to count.
 */
async function placeOrder(
  key: "a" | "b",
  lines: readonly [string, number][],
  email: string,
  options: { readonly test?: boolean } = {},
): Promise<string> {
  ip += 1;
  const store = shop[key];
  const clientIp = `192.0.2.${String(ip % 250)}`;
  let cartToken: string | null = null;
  for (const [name, quantity] of lines) {
    const r = await addToCart(
      { store, token: cartToken, clientIp },
      { variantId: variant[`${key}:${name}`], quantity },
    );
    cartToken = r.newToken ?? cartToken;
  }
  const { token } = await startCheckout({ store, token: null, clientIp, cartToken });
  const req = { store, token, clientIp };
  await updateContact(req, { email });
  await updateAddress(req, {
    firstName: "Ravi",
    lastName: "Kumar",
    line1: "4 Park Street",
    city: "Kolkata",
    countryCode: "IN",
    region: "WB",
    postalCode: "700016",
  });
  const priced = await getCheckout(req);
  const standard = priced?.shippingOptions.find((o) => o.name === "Standard");
  const view = await selectShippingRate(req, { rateId: standard?.id });
  const started = await beginPayment(req, {
    pricingHash: view.pricingHash,
    returnUrl: "http://shop.test/checkout/return",
  });
  if (started.kind !== "redirect")
    throw new Error(`payment did not start: ${JSON.stringify(started)}`);
  await simulateTestPayment(req, new URL(started.url).searchParams.get("ref") ?? "", "captured");
  const order = await migratorDb().order.findFirstOrThrow({
    where: { storeId: store.storeId },
    orderBy: { orderNumber: "desc" },
  });
  expect(order.testMode).toBe(true);
  if (!options.test) await makeOrderLive(order.id);
  return toTypeId("order", order.id);
}

/**
 * Moves an order, and the customer it created, `days` days into the past.
 * placedAt is immutable for every role (Order_snapshot_immutable), so the
 * table owner lifts that trigger for this one transaction only.
 */
async function backdate(orderPublicId: string, days: number) {
  const id = parseTypeId("order", orderPublicId) ?? "";
  const when = new Date(Date.now() - days * DAY);
  await migratorDb().$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE "Order" DISABLE TRIGGER "Order_snapshot_immutable"`;
    const order = await tx.order.update({ where: { id }, data: { placedAt: when } });
    await tx.$executeRaw`ALTER TABLE "Order" ENABLE TRIGGER "Order_snapshot_immutable"`;
    if (order.customerId) {
      await tx.customer.update({ where: { id: order.customerId }, data: { createdAt: when } });
    }
  });
}

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("met-a");
  b = await makeTenant("met-b");
  await setUpStore(a, "a");
  await setUpStore(b, "b");
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
});

afterAll(disconnectTestClients);

describe("a store with no orders", () => {
  it("reads as honest zeros, every day present", async () => {
    const summary = await storeSalesSummary(storeOf(a), { days: 7 });
    expect(summary).toMatchObject({
      days: 7,
      timezone: "Asia/Kolkata",
      currency: "INR",
      current: { revenue: { amount: "0", currency: "INR" }, orders: 0 },
      previous: { revenue: { amount: "0", currency: "INR" }, orders: 0 },
      topProducts: [],
    });
    expect(summary.current.daily).toHaveLength(7);
    expect(summary.previous.daily).toHaveLength(7);
    expect(summary.current.daily.every((d) => d.revenue === "0" && d.orders === 0)).toBe(true);
    const customers = await storeCustomerSummary(storeOf(a), { days: 7 });
    expect(customers.current.newCustomers).toBe(0);
    expect(customers.current.daily).toHaveLength(7);
  });
});

describe("sales figures", () => {
  // Store A: tee 500.00, cap 300.00, flat 40.00 shipping, no tax.
  //  o1 today      tee ×2  → 1040.00
  //  o2 today      cap ×1  →  340.00, 100.00 refunded → 240.00
  //  o3 today      tee ×1  →  cancelled and refunded: counts for nothing
  //  o4 3 days ago cap ×3  →  940.00; the same customer orders again today,
  //                            and cancels
  //  o5 10 days ago tee ×1 →  540.00: the period before, for a 7-day period
  // Store B: one order today, tee ×5; store A never sees it.
  beforeAll(async () => {
    await placeOrder("a", [["tee", 2]], "one@example.test");
    const o2 = await placeOrder("a", [["cap", 1]], "two@example.test");
    await refundOrder(await steppedUp(storeOf(a)), o2, { amount: "100" });
    const o3 = await placeOrder("a", [["tee", 1]], "three@example.test");
    await cancelOrder(await steppedUp(storeOf(a)), o3, { reason: "Changed mind", refund: true });
    const o4 = await placeOrder("a", [["cap", 3]], "four@example.test");
    await backdate(o4, 3);
    // A returning customer orders again today: no new customer record. The
    // order is cancelled, so it adds nothing to the sales figures either.
    const again = await placeOrder("a", [["cap", 1]], "four@example.test");
    await cancelOrder(await steppedUp(storeOf(a)), again, { refund: true });
    const o5 = await placeOrder("a", [["tee", 1]], "five@example.test");
    await backdate(o5, 10);
    await placeOrder("b", [["tee", 5]], "b-shopper@example.test");
  });

  it("revenue is order totals less refunds, without cancelled orders, day by day", async () => {
    const summary = await storeSalesSummary(storeOf(a), { days: 7 });
    expect(summary.current.revenue).toEqual({
      amount: String(104000 + 24000 + 94000),
      currency: "INR",
    });
    expect(summary.current.orders).toBe(3);
    expect(summary.previous.revenue).toEqual({ amount: "54000", currency: "INR" });
    expect(summary.previous.orders).toBe(1);

    const daily = summary.current.daily;
    expect(daily).toHaveLength(7);
    // Oldest first, consecutive days ending today (in the store's timezone).
    for (let i = 1; i < daily.length; i += 1) {
      const prev = Date.parse(`${daily[i - 1]?.date ?? ""}T00:00:00Z`);
      expect(Date.parse(`${daily[i]?.date ?? ""}T00:00:00Z`) - prev).toBe(DAY);
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    expect(daily.at(-1)).toEqual({ date: today, revenue: String(104000 + 24000), orders: 2 });
    expect(daily.at(-4)).toEqual({ date: shift(today, -3), revenue: "94000", orders: 1 });
    // Missing days are zero, not absent.
    expect(daily.filter((d) => d.orders === 0)).toHaveLength(5);
    expect(summary.previous.daily.at(-4)).toMatchObject({ revenue: "54000", orders: 1 });
    expect(summary.previous.daily.at(-1)?.date).toBe(daily[0] ? shift(daily[0].date, -1) : "");
  });

  it("a longer period takes in the older order", async () => {
    const summary = await storeSalesSummary(storeOf(a), { days: 30 });
    expect(summary.current.orders).toBe(4);
    expect(summary.current.revenue.amount).toBe(String(104000 + 24000 + 94000 + 54000));
    expect(summary.current.daily).toHaveLength(30);
    expect(summary.previous.orders).toBe(0);
  });

  it("ranks best sellers by units sold, cancelled orders excluded", async () => {
    const summary = await storeSalesSummary(storeOf(a), { days: 7 });
    expect(summary.topProducts).toEqual([
      { productId: product["a:cap"], title: "a cap", units: 4 },
      { productId: product["a:tee"], title: "a tee", units: 2 },
    ]);
  });

  it("counts customers created in the period", async () => {
    const customers = await storeCustomerSummary(storeOf(a), { days: 7 });
    // one, two, three (their order was cancelled, but they are a customer)
    // and four (three days ago; their second order made no new record).
    expect(customers.current.newCustomers).toBe(4);
    expect(customers.current.daily.at(-1)?.count).toBe(3);
    expect(customers.current.daily.at(-4)?.count).toBe(1);
    expect(customers.previous.newCustomers).toBe(1);
  });

  it("clamps the period to whole days within bounds", async () => {
    expect((await storeSalesSummary(storeOf(a), { days: 0 })).days).toBe(1);
    expect((await storeSalesSummary(storeOf(a), { days: 2.7 })).current.daily).toHaveLength(2);
    expect((await storeSalesSummary(storeOf(a), { days: 10_000 })).days).toBe(366);
    expect((await storeSalesSummary(storeOf(a), { days: Number.NaN })).days).toBe(30);
  });

  it("tenancy: each store sees only its own orders and customers", async () => {
    const other = await storeSalesSummary(storeOf(b), { days: 7 });
    expect(other.current.orders).toBe(1);
    expect(other.current.revenue.amount).toBe("254000");
    expect(other.previous.orders).toBe(0);
    expect(other.topProducts).toEqual([{ productId: product["b:tee"], title: "b tee", units: 5 }]);
    expect((await storeCustomerSummary(storeOf(b), { days: 7 })).current.newCustomers).toBe(1);
    // And store A's figures never include store B's order.
    const mine = await storeSalesSummary(storeOf(a), { days: 7 });
    expect(mine.topProducts.some((p) => p.title.startsWith("b "))).toBe(false);
    // An organisation context has no store to read.
    await expectCode(storeSalesSummary(a.org, { days: 7 }), "NOT_FOUND");
  });

  it("RBAC: order.read for sales, customer.read for customers", async () => {
    const s = storeOf(a);
    const designer = await memberContext(a, "DESIGNER", s);
    const marketing = await memberContext(a, "MARKETING", s);
    const support = await memberContext(a, "SUPPORT", s);
    await expectCode(storeSalesSummary(designer, { days: 7 }), "FORBIDDEN");
    await expectCode(storeCustomerSummary(designer, { days: 7 }), "FORBIDDEN");
    // Marketing reads customers but not orders.
    await expectCode(storeSalesSummary(marketing, { days: 7 }), "FORBIDDEN");
    expect((await storeCustomerSummary(marketing, { days: 7 })).current.newCustomers).toBe(4);
    expect((await storeSalesSummary(support, { days: 7 })).current.orders).toBe(3);
  });
});

describe("test orders (final pass, CO-1) and the one revenue definition (N)", () => {
  // Added to store A on top of the orders above, all today:
  //  t1 tee ×3 by a new shopper, paid through the Test Provider → 1540.00
  //  t2 cap ×2 by "one@example.test" (a live customer), test    →  640.00
  // None of it may reach revenue, order counts, best sellers, new customers
  // or a customer's total.
  let t1 = "";
  let before: Awaited<ReturnType<typeof storeSalesSummary>>;
  let customersBefore: number;
  beforeAll(async () => {
    before = await storeSalesSummary(storeOf(a), { days: 7 });
    customersBefore = (await storeCustomerSummary(storeOf(a), { days: 7 })).current.newCustomers;
    t1 = await placeOrder("a", [["tee", 3]], "tester@example.test", { test: true });
    await placeOrder("a", [["cap", 2]], "one@example.test", { test: true });
  });

  it("the order records that it was paid through a test connection, and it can't be changed", async () => {
    const id = parseTypeId("order", t1) ?? "";
    expect((await migratorDb().order.findUniqueOrThrow({ where: { id } })).testMode).toBe(true);
    await expect(
      migratorDb().order.update({ where: { id }, data: { testMode: false } }),
    ).rejects.toThrow();
  });

  it("sales figures leave test orders out entirely", async () => {
    const after = await storeSalesSummary(storeOf(a), { days: 7 });
    expect(after.current.revenue).toEqual(before.current.revenue);
    expect(after.current.orders).toBe(before.current.orders);
    expect(after.current.daily).toEqual(before.current.daily);
    expect(after.topProducts).toEqual(before.topProducts);
    // The shopper whose only order is a test order is not a new customer.
    const customers = await storeCustomerSummary(storeOf(a), { days: 7 });
    expect(customers.current.newCustomers).toBe(customersBefore);
  });

  it("the orders page's numbers use the same definition as the home's", async () => {
    const metrics = await orderMetrics(storeOf(a));
    const month = await storeSalesSummary(storeOf(a), { days: 30 });
    const week = await storeSalesSummary(storeOf(a), { days: 7 });
    expect(metrics.revenue30d).toEqual(month.current.revenue);
    expect(metrics.orders30d).toBe(month.current.orders);
    expect(metrics.ordersToday).toBe(week.current.daily.at(-1)?.orders);
    // o1, o2 (a partial refund), o4 and o5 are live and unfulfilled; the
    // test orders need no shipping.
    expect(metrics.unfulfilled).toBe(4);
    expect(metrics.testOrders).toBe(2);
  });

  it("lists hide test orders except under their own filter", async () => {
    const s = storeOf(a);
    const all = await listOrders(s);
    expect(all.items.some((o) => o.testMode)).toBe(false);
    expect(all.items.some((o) => o.id === t1)).toBe(false);
    expect(all.counts.test).toBe(2);
    for (const status of ["open", "unfulfilled", "unpaid", "cancelled", "completed"]) {
      const list = await listOrders(s, { status });
      expect(list.items.some((o) => o.testMode)).toBe(false);
    }
    const test = await listOrders(s, { status: "test" });
    expect(test.items).toHaveLength(2);
    expect(test.items.every((o) => o.testMode)).toBe(true);
    // A search still finds one, marked.
    const number = test.items.find((o) => o.id === t1)?.number ?? 0;
    const found = await listOrders(s, { q: `#${String(number)}` });
    expect(found.items).toEqual([expect.objectContaining({ id: t1, testMode: true })]);
  });

  it("a customer's total leaves their test orders out", async () => {
    const s = storeOf(a);
    const list = await listCustomers(s, { q: "one@example.test" });
    const one = list.items.find((c) => c.email === "one@example.test");
    expect(one?.totalSpent).toEqual({ amount: "104000", currency: "INR" });
    expect(one?.orderCount).toBe(1);
    const detail = await getCustomer(s, one?.id);
    expect(detail.orders.map((o) => o.testMode).sort()).toEqual([false, true]);
  });
});

function shift(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
}
