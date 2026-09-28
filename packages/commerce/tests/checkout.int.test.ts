// Checkout, payments and order creation (ADR-0031) end to end against the
// database, through the checkout role, with the Test Payment Provider's
// signed events going through the real webhook pipeline. Covers the money
// paths: server-side prices, the reviewed-quote hash, reservation of the
// last unit, discount final use, duplicate and concurrent confirmations,
// failure and expiry release, late capture, amount mismatch and tenancy.
import {
  countQueries,
  disconnectTestClients,
  migratorDb,
  truncateAll,
} from "@storevia/database/testing";
import {
  credentialsBinding,
  sealCredentials,
  TestPaymentProvider,
  type TestOutcome,
} from "@storevia/payments";
import { parseTypeId, toTypeId, uuidv7 } from "@storevia/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adjustInventory, createProduct, getProduct, updateVariants } from "../src";
import {
  applyDiscountCode,
  beginPayment,
  cancelPayment,
  getCheckout,
  ingestPaymentWebhook,
  readTestPayment,
  selectShippingRate,
  simulateTestPayment,
  startCheckout,
  sweepExpiredCheckouts,
  sweepExpiredPayments,
  updateAddress,
  updateContact,
  type CheckoutRequest,
  type CheckoutStore,
} from "../src/checkout";
import { addToCart } from "../src/storefront";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let a: Tenant;
let b: Tenant;
let storeA: CheckoutStore;
let storeB: CheckoutStore;
const variant: Record<string, string> = {};
const product: Record<string, string> = {};
const connection: Record<string, { id: string; secret: string }> = {};
let ipCounter = 0;

const RETURN_URL = "http://shop.test/checkout/return";
const provider = new TestPaymentProvider();

const storeOfTenant = (tenant: Tenant): CheckoutStore => {
  const s = storeOf(tenant);
  return {
    organisationId: s.organisationId,
    storeId: s.storeId,
    currency: "INR",
    name: "Test Store",
  };
};

/** A distinct client address per test, so rate limits never couple tests. */
const nextIp = () => {
  ipCounter += 1;
  return `198.51.100.${String(ipCounter % 250)}`;
};

async function makeProduct(tenant: Tenant, key: string, price: string, stock: number) {
  const ctx = storeOf(tenant);
  const { productId } = await createProduct(ctx, {
    title: key,
    price,
    initialStock: stock,
    status: "ACTIVE",
  });
  product[key] = productId;
  variant[key] = (await getProduct(ctx, productId)).variants[0]?.id ?? "";
}

async function connect(tenant: Tenant, key: string): Promise<void> {
  const s = storeOf(tenant);
  const id = uuidv7();
  const secret = `whsec_${key}_${"x".repeat(40)}`;
  const sealed = sealCredentials(
    credentialsBinding({ storeId: s.storeId, id, provider: "storevia-test" }),
    { webhookSecret: secret },
  );
  await migratorDb().paymentProviderConnection.create({
    data: {
      id,
      organisationId: s.organisationId,
      storeId: s.storeId,
      provider: "storevia-test",
      mode: "TEST",
      status: "ACTIVE",
      credentialsCiphertext: Buffer.from(sealed.ciphertext),
      keyVersion: sealed.keyVersion,
      credentialHint: "Test mode",
    },
  });
  connection[key] = { id, secret };
}

async function configure(tenant: Tenant): Promise<{ flat: string; free: string }> {
  const s = storeOf(tenant);
  const db = migratorDb();
  const base = { organisationId: s.organisationId, storeId: s.storeId };
  const zone = await db.shippingZone.create({ data: { ...base, name: "India" } });
  await db.shippingZoneCountry.create({
    data: { ...base, zoneId: zone.id, countryCode: "IN", regionCodes: [] },
  });
  const flat = await db.shippingRate.create({
    data: {
      ...base,
      zoneId: zone.id,
      name: "Standard",
      type: "FLAT",
      currency: "INR",
      amount: 5000n,
    },
  });
  const free = await db.shippingRate.create({
    data: {
      ...base,
      zoneId: zone.id,
      name: "Free over 2000",
      type: "PRICE_BASED",
      currency: "INR",
      amount: 0n,
      minSubtotalAmount: 200000n,
    },
  });
  await db.taxConfiguration.create({ data: { ...base, pricesIncludeTax: false } });
  await db.taxRate.create({
    data: { ...base, countryCode: "IN", name: "GST", ratePpm: 180_000 },
  });
  return { flat: flat.id, free: free.id };
}

async function discount(
  tenant: Tenant,
  code: string,
  extra: { percentageBps?: number; usageLimit?: number } = {},
) {
  const s = storeOf(tenant);
  const base = { organisationId: s.organisationId, storeId: s.storeId };
  const d = await migratorDb().discount.create({
    data: {
      ...base,
      title: `${code} off`,
      type: "PERCENTAGE",
      method: "CODE",
      percentageBps: extra.percentageBps ?? 1000,
      startsAt: new Date(Date.now() - 60_000),
      usageLimit: extra.usageLimit ?? null,
    },
  });
  await migratorDb().discountCode.create({ data: { ...base, discountId: d.id, code } });
  return d.id;
}

const ADDRESS = {
  firstName: "Asha",
  lastName: "Rao",
  line1: "12 MG Road",
  city: "Bengaluru",
  regionCode: "KA",
  postalCode: "560001",
  countryCode: "IN",
  phone: "+91 98765 43210",
};

interface Shopper {
  readonly req: CheckoutRequest;
}

/** A shopper with `lines` in their cart and a started checkout. */
async function shopper(store: CheckoutStore, lines: readonly [string, number][]): Promise<Shopper> {
  const clientIp = nextIp();
  let cartToken: string | null = null;
  for (const [key, quantity] of lines) {
    const result = await addToCart(
      { store, token: cartToken, clientIp },
      { variantId: variant[key], quantity },
    );
    cartToken = result.newToken ?? cartToken;
  }
  const { token } = await startCheckout({ store, token: null, clientIp, cartToken });
  return { req: { store, token, clientIp } };
}

/** Contact, address and the cheapest applicable rate: ready to pay. */
async function ready(s: Shopper, email = "asha@example.test") {
  await updateContact(s.req, { email });
  const afterAddress = await updateAddress(s.req, ADDRESS);
  const rate = afterAddress.shippingOptions[0];
  if (!rate) throw new Error("no shipping option");
  return selectShippingRate(s.req, { rateId: rate.id });
}

async function pay(s: Shopper) {
  const view = await getCheckout(s.req);
  if (!view) throw new Error("no checkout");
  return beginPayment(s.req, { pricingHash: view.pricingHash, returnUrl: RETURN_URL });
}

const refOf = (url: string) => new URL(url).searchParams.get("ref") ?? "";

async function outcome(s: Shopper, url: string, result: TestOutcome) {
  await simulateTestPayment(s.req, refOf(url), result);
}

/** A signed event exactly as the test provider would send it. */
function signed(
  key: string,
  ref: string,
  result: TestOutcome,
  amount: bigint,
  currency = "INR",
): { body: Uint8Array; headers: Headers; connectionId: string } {
  const c = connection[key];
  if (!c) throw new Error("no connection");
  const event = provider.signedEvent(
    { webhookSecret: c.secret },
    { outcome: result, providerPaymentId: ref, amount, currency },
  );
  return {
    body: new TextEncoder().encode(event.body),
    headers: event.headers,
    connectionId: toTypeId("paymentConnection", c.id),
  };
}

async function level(key: string) {
  const item = await migratorDb().inventoryItem.findFirstOrThrow({
    where: { variantId: parseTypeId("variant", variant[key] ?? "") ?? "" },
    include: { levels: true },
  });
  return {
    available: item.levels.reduce((n, l) => n + l.available, 0),
    reserved: item.levels.reduce((n, l) => n + l.reserved, 0),
  };
}

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("co-a");
  b = await makeTenant("co-b");
  storeA = storeOfTenant(a);
  storeB = storeOfTenant(b);
  await makeProduct(a, "mug", "1000", 50);
  await makeProduct(a, "last", "500", 1);
  await makeProduct(a, "pricey", "2500", 10);
  await makeProduct(b, "other", "100", 5);
  await configure(a);
  await configure(b);
  await connect(a, "a");
  await connect(b, "b");
  await discount(a, "SAVE10");
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
});

afterAll(disconnectTestClients);

describe("checkout foundation", () => {
  it("starts from the cart, prices on the server and lists what is missing", async () => {
    const s = await shopper(storeA, [["mug", 2]]);
    const view = await getCheckout(s.req);
    expect(view).toMatchObject({
      stage: "open",
      subtotal: { amount: "200000", currency: "INR" },
      problems: expect.arrayContaining(["EMAIL", "ADDRESS"]) as unknown,
      paymentsAvailable: true,
    });
    const stored = await migratorDb().checkout.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).not.toBe(s.req.token);
  });

  it("an empty or foreign cart can't start a checkout", async () => {
    await expectCode(
      startCheckout({ store: storeA, token: null, clientIp: nextIp(), cartToken: null }),
      "CONFLICT",
    );
    // A cart of store B presented to store A is "empty".
    const { newToken } = await addToCart(
      { store: { ...storeB }, token: null, clientIp: nextIp() },
      { variantId: variant["other"], quantity: 1 },
    );
    await expectCode(
      startCheckout({ store: storeA, token: null, clientIp: nextIp(), cartToken: newToken }),
      "CONFLICT",
    );
  });

  it("validates contact and address input with field errors", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    await expect(updateContact(s.req, { email: "not-an-email" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { email: expect.any(String) as unknown },
    });
    await expect(
      updateAddress(s.req, { ...ADDRESS, line1: "", countryCode: "India" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: {
        line1: expect.any(String) as unknown,
        countryCode: expect.any(String) as unknown,
      },
    });
  });

  it("checks both addresses together and saves a separate billing address on its own", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    await updateContact(s.req, { email: "asha@example.test" });
    // Shipping and billing errors come back together, keyed by field.
    await expect(
      updateAddress(s.req, {
        ...ADDRESS,
        city: "",
        billingSameAsShipping: "off",
        billing_firstName: "Accounts",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: {
        city: expect.any(String) as unknown,
        billing_lastName: expect.any(String) as unknown,
        billing_line1: expect.any(String) as unknown,
        billing_city: expect.any(String) as unknown,
      },
    });
    const billing = {
      billing_firstName: "Accounts",
      billing_lastName: "Team",
      billing_line1: "1 Office Road",
      billing_city: "Pune",
      billing_countryCode: "IN",
    };
    const separate = await updateAddress(s.req, {
      ...ADDRESS,
      ...billing,
      billingSameAsShipping: "off",
    });
    expect(separate.shippingAddress).toMatchObject({ line1: "12 MG Road", city: "Bengaluru" });
    expect(separate.billingAddress).toMatchObject({ line1: "1 Office Road", city: "Pune" });
    // Ticked, the billing fields are ignored and billing equals shipping.
    const same = await updateAddress(s.req, {
      ...ADDRESS,
      ...billing,
      billingSameAsShipping: "on",
    });
    expect(same.billingAddress).toEqual(same.shippingAddress);
  });

  it("an address change clears a chosen method that no longer applies", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    const view = await ready(s);
    expect(view.shipping).not.toBeNull();
    const stored = () =>
      migratorDb().checkout.findFirstOrThrow({
        where: { storeId: storeA.storeId, email: "asha@example.test", status: "OPEN" },
        orderBy: { createdAt: "desc" },
        select: { shippingRateId: true },
      });
    // The same country: the method still applies and stays chosen.
    const moved = await updateAddress(s.req, { ...ADDRESS, city: "Mysuru" });
    expect(moved.shipping?.name).toBe(view.shipping?.name);
    // Nowhere the store ships: no options, and the choice is cleared...
    const abroad = await updateAddress(s.req, { ...ADDRESS, countryCode: "US", regionCode: "" });
    expect(abroad.shippingOptions).toEqual([]);
    expect(abroad.shipping).toBeNull();
    expect(abroad.problems).toContain("SHIPPING_UNAVAILABLE");
    expect((await stored()).shippingRateId).toBeNull();
    // ...so coming back doesn't silently re-select it.
    const back = await updateAddress(s.req, ADDRESS);
    expect(back.shipping).toBeNull();
    expect(back.problems).toContain("SHIPPING");
    expect(back.shippingTotal.amount).toBe("0");
  });

  it("shipping, tax and discount are computed from the store's configuration", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    const view = await ready(s);
    // 1000.00 + 50.00 shipping + 18% GST on the goods.
    expect(view).toMatchObject({
      subtotal: { amount: "100000" },
      shippingTotal: { amount: "5000" },
      taxTotal: { amount: "18000" },
      total: { amount: "123000" },
      problems: [],
    });
    const discounted = await applyDiscountCode(s.req, { code: " save10 " });
    expect(discounted).toMatchObject({
      discountTotal: { amount: "10000" },
      taxTotal: { amount: "16200" },
      total: { amount: "111200" },
    });
    await expect(applyDiscountCode(s.req, { code: "NOPE" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    // The valid code stays applied after a rejected one.
    expect((await getCheckout(s.req))?.discount?.code).toBe("SAVE10");
    // A rate that doesn't apply (free shipping needs 2000) is refused.
    const free = await migratorDb().shippingRate.findFirstOrThrow({
      where: { storeId: storeA.storeId, name: "Free over 2000" },
    });
    await expectCode(
      selectShippingRate(s.req, { rateId: toTypeId("shippingRate", free.id) }),
      "VALIDATION_FAILED",
    );
  });

  it("another store, or no token, never reaches a checkout", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    expect(await getCheckout({ ...s.req, store: storeB })).toBeNull();
    expect(await getCheckout({ ...s.req, token: null })).toBeNull();
    expect(await getCheckout({ ...s.req, token: "x".repeat(43) })).toBeNull();
  });
});

describe("query budget", () => {
  it("pricing a checkout costs the same queries for 1 or 8 lines (no N+1)", async () => {
    for (let i = 0; i < 7; i++) await makeProduct(a, `budget-${String(i)}`, "100", 50);
    const one = await shopper(storeA, [["mug", 1]]);
    const many = await shopper(storeA, [
      ["mug", 1],
      ...Array.from({ length: 7 }, (_, i) => [`budget-${String(i)}`, 1] as [string, number]),
    ]);
    await ready(one);
    await ready(many);
    const small = await countQueries(() => getCheckout(one.req));
    const large = await countQueries(() => getCheckout(many.req));
    expect(large.result?.lines).toHaveLength(8);
    expect(large.queries.length).toBe(small.queries.length);
    expect(small.queries.length).toBeLessThanOrEqual(16);
  });
});

describe("paying and creating the order", () => {
  it("happy path: reserve, pay through a signed event, one immutable order", async () => {
    const before = await level("mug");
    const s = await shopper(storeA, [["mug", 2]]);
    const readied = await ready(s, "Buyer@Example.test");
    // 2000.00 qualifies for free shipping, the cheapest option.
    expect(readied.shipping).toMatchObject({ name: "Free over 2000" });
    const discounted = await applyDiscountCode(s.req, { code: "SAVE10" });
    // The discount takes the order under the threshold: the free rate no longer applies.
    expect(discounted.problems).toEqual(["SHIPPING"]);
    const standard = discounted.shippingOptions.find((o) => o.name === "Standard");
    await selectShippingRate(s.req, { rateId: standard?.id });
    const started = await pay(s);
    expect(started).toEqual({ kind: "redirect", url: expect.any(String) as unknown });
    if (started.kind !== "redirect") return;
    expect(started.url).toMatch(/^http:\/\/shop\.test\/checkout\/test-payment\?ref=tp_/);

    // Reserved before any money: available −2, reserved +2; one discount use taken.
    expect(await level("mug")).toEqual({
      available: before.available - 2,
      reserved: before.reserved + 2,
    });
    const paying = await getCheckout(s.req);
    expect(paying).toMatchObject({ stage: "paying", paymentRedirectUrl: started.url });
    // Details can't change while paying.
    await expectCode(updateContact(s.req, { email: "x@example.test" }), "CONFLICT");

    expect(await readTestPayment(s.req, refOf(started.url))).toMatchObject({
      amount: { amount: "217400", currency: "INR" },
    });
    await outcome(s, started.url, "captured");

    const done = await getCheckout(s.req);
    expect(done).toMatchObject({ stage: "completed", order: { number: 1001 } });
    const db = migratorDb();
    const order = await db.order.findFirstOrThrow({
      where: { storeId: storeA.storeId, orderNumber: 1001 },
      include: {
        lines: true,
        addresses: true,
        discounts: true,
        shippingLines: true,
        taxLines: true,
      },
    });
    expect(order).toMatchObject({
      status: "OPEN",
      paymentStatus: "PAID",
      fulfilmentStatus: "UNFULFILLED",
      currency: "INR",
      subtotalAmount: 200000n,
      discountAmount: 20000n,
      shippingAmount: 5000n,
      taxAmount: 32400n,
      totalAmount: 217400n,
      stockShortage: false,
    });
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({
      quantity: 2,
      unitPriceAmount: 100000n,
      discountAmount: 20000n,
    });
    expect(order.addresses.map((x) => x.type).sort()).toEqual(["BILLING", "SHIPPING"]);
    expect(order.discounts[0]).toMatchObject({ code: "SAVE10", amount: 20000n });
    expect(order.shippingLines[0]).toMatchObject({ title: "Standard", amount: 5000n });
    expect(order.taxLines[0]).toMatchObject({ title: "GST", amount: 32400n });

    // Stock stays reserved for the order; the reservation belongs to its line.
    expect(await level("mug")).toEqual({
      available: before.available - 2,
      reserved: before.reserved + 2,
    });
    const reservation = await db.inventoryReservation.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(reservation).toMatchObject({ status: "CONVERTED", orderLineId: order.lines[0]?.id });

    // Customer by email (case-insensitive), redemption, payment link, cart, notification, events.
    const customer = await db.customer.findFirstOrThrow({ where: { id: order.customerId ?? "" } });
    expect(customer).toMatchObject({ firstName: "Asha", lastName: "Rao" });
    const d = await db.discount.findFirstOrThrow({ where: { storeId: storeA.storeId } });
    expect(d.usageCount).toBe(1);
    expect(
      await db.discountRedemption.findFirstOrThrow({ where: { orderId: order.id } }),
    ).toMatchObject({
      status: "REDEEMED",
      customerId: customer.id,
    });
    expect(await db.payment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({
      status: "CAPTURED",
      capturedAmount: 217400n,
    });
    const checkout = await db.checkout.findFirstOrThrow({ where: { completedOrderId: order.id } });
    expect((await db.cart.findUniqueOrThrow({ where: { id: checkout.cartId } })).status).toBe(
      "CONVERTED",
    );
    expect(await db.orderNotification.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      (await db.outboxEvent.findMany({ where: { entityId: order.id } })).map((e) => e.type).sort(),
    ).toEqual(["order.created", "order.paid"]);

    // Snapshots are immutable, even for the migrator.
    // (Fields no CHECK constrains, so only the immutability trigger refuses them.)
    await expect(
      db.order.update({ where: { id: order.id }, data: { email: "changed@example.test" } }),
    ).rejects.toThrow(/immutable|can't change|cannot/i);
    await expect(
      db.orderLine.update({
        where: { id: order.lines[0]?.id ?? "" },
        data: { productTitle: "Something else" },
      }),
    ).rejects.toThrow();
    // A payment can never be refunded beyond what it captured.
    const paid = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(
      db.payment.update({
        where: { id: paid.id },
        data: { refundedAmount: paid.capturedAmount + 1n },
      }),
    ).rejects.toThrow();

    // A second order from the same customer email reuses the customer.
    const again = await shopper(storeA, [["mug", 1]]);
    await ready(again, "buyer@example.test");
    const second = await pay(again);
    if (second.kind !== "redirect") throw new Error("expected redirect");
    await outcome(again, second.url, "captured");
    const next = await db.order.findFirstOrThrow({
      where: { storeId: storeA.storeId, orderNumber: 1002 },
    });
    expect(next.customerId).toBe(customer.id);
  });

  it("refuses to charge a quote the shopper didn't review", async () => {
    const s = await shopper(storeA, [["pricey", 1]]);
    const reviewed = await ready(s);
    await updateVariants(storeOf(a), product["pricey"] ?? "", {
      variants: [{ variantId: variant["pricey"], price: "2600" }],
    });
    const payments = await migratorDb().payment.count();
    const result = await beginPayment(s.req, {
      pricingHash: reviewed.pricingHash,
      returnUrl: RETURN_URL,
    });
    expect(result).toEqual({ kind: "changed", change: "PRICE_CHANGED" });
    expect(await migratorDb().payment.count()).toBe(payments);
    // Reviewing the new quote lets it through.
    expect((await pay(s)).kind).toBe("redirect");
  });

  it("a declined payment releases stock and the discount use, and the checkout reopens", async () => {
    const before = await level("mug");
    const usesBefore = (
      await migratorDb().discount.findFirstOrThrow({ where: { storeId: storeA.storeId } })
    ).usageCount;
    const s = await shopper(storeA, [["mug", 1]]);
    await ready(s);
    await applyDiscountCode(s.req, { code: "SAVE10" });
    const started = await pay(s);
    if (started.kind !== "redirect") throw new Error("expected redirect");
    await outcome(s, started.url, "failed");
    expect(await level("mug")).toEqual(before);
    expect(
      (await migratorDb().discount.findFirstOrThrow({ where: { storeId: storeA.storeId } }))
        .usageCount,
    ).toBe(usesBefore);
    const view = await getCheckout(s.req);
    expect(view).toMatchObject({ stage: "open", lastPaymentProblem: "DECLINED" });
    // And the shopper can try again.
    const retry = await pay(s);
    expect(retry.kind).toBe("redirect");
    if (retry.kind === "redirect") await outcome(s, retry.url, "cancelled");
    expect((await getCheckout(s.req))?.lastPaymentProblem).toBe("CANCELLED");
  });

  it("the shopper can cancel an attempt in flight to change their details", async () => {
    const before = await level("mug");
    const s = await shopper(storeA, [["mug", 1]]);
    await ready(s);
    const started = await pay(s);
    expect(started.kind).toBe("redirect");
    // Paying twice returns the same attempt.
    expect(await pay(s)).toEqual(started);
    const view = await cancelPayment(s.req);
    expect(view.stage).toBe("open");
    expect(await level("mug")).toEqual(before);
    await updateContact(s.req, { email: "changed@example.test" });
  });
});

describe("idempotency and concurrency", () => {
  it("duplicate and concurrent capture events create one order", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    await ready(s);
    const started = await pay(s);
    if (started.kind !== "redirect") throw new Error("expected redirect");
    const payment = await migratorDb().payment.findFirstOrThrow({
      where: { providerPaymentId: refOf(started.url) },
    });
    const one = signed("a", refOf(started.url), "captured", payment.amount);
    const two = signed("a", refOf(started.url), "captured", payment.amount);
    const results = await Promise.all([
      ingestPaymentWebhook(one.connectionId, one.body, one.headers),
      ingestPaymentWebhook(two.connectionId, two.body, two.headers),
      ingestPaymentWebhook(one.connectionId, one.body, one.headers),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.map((r) => r.outcome).sort()).toEqual(["duplicate", "processed", "processed"]);
    const orders = await migratorDb().order.findMany({
      where: { payments: { some: { id: payment.id } } },
    });
    expect(orders).toHaveLength(1);
    expect(
      await migratorDb().orderNotification.count({ where: { orderId: orders[0]?.id ?? "" } }),
    ).toBe(1);
    const eventIds = [one, two].map((e) => e.headers.get("x-storevia-test-event-id") ?? "");
    expect(
      await migratorDb().paymentWebhookEvent.count({
        where: { storeId: storeA.storeId, providerEventId: { in: eventIds } },
      }),
    ).toBe(2);
    // A failure notice after the capture changes nothing.
    const late = signed("a", refOf(started.url), "failed", payment.amount);
    expect(await ingestPaymentWebhook(late.connectionId, late.body, late.headers)).toMatchObject({
      status: 200,
    });
    expect(
      (await migratorDb().payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe("CAPTURED");
  });

  it("two shoppers racing for the last unit: exactly one gets to pay", async () => {
    const one = await shopper(storeA, [["last", 1]]);
    const two = await shopper(storeA, [["last", 1]]);
    await ready(one);
    await ready(two);
    const payments = await migratorDb().payment.count();
    // Both shoppers review first; then both press "pay" at once.
    const [v1, v2] = [await getCheckout(one.req), await getCheckout(two.req)];
    const results = await Promise.all([
      beginPayment(one.req, { pricingHash: v1?.pricingHash, returnUrl: RETURN_URL }),
      beginPayment(two.req, { pricingHash: v2?.pricingHash, returnUrl: RETURN_URL }),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(["changed", "redirect"]);
    expect(results.find((r) => r.kind === "changed")).toEqual({
      kind: "changed",
      change: "ITEM_UNAVAILABLE",
    });
    expect(await level("last")).toEqual({ available: 0, reserved: 1 });
    // The loser's attempt left nothing behind.
    expect(await migratorDb().payment.count()).toBe(payments + 1);
  });

  it("the cart doesn't reserve: two carts hold the last 2, the first to pay gets them", async () => {
    await makeProduct(a, "pair", "400", 2);
    // Both carts accept 2: the cart checks stock, it doesn't hold it.
    const one = await shopper(storeA, [["pair", 2]]);
    const two = await shopper(storeA, [["pair", 2]]);
    await ready(one);
    await ready(two);
    // Both review; A pays first and reserves the stock.
    const reviewed = await getCheckout(two.req);
    const first = await pay(one);
    expect(first.kind).toBe("redirect");
    expect(await level("pair")).toEqual({ available: 0, reserved: 2 });
    // B can't oversell: paying for what it reviewed is refused, and its line is sold out.
    expect(
      await beginPayment(two.req, { pricingHash: reviewed?.pricingHash, returnUrl: RETURN_URL }),
    ).toEqual({ kind: "changed", change: "ITEM_UNAVAILABLE" });
    const after = await getCheckout(two.req);
    expect(after?.unavailable).toEqual([
      expect.objectContaining({ quantity: 2, reason: "SOLD_OUT" }) as unknown,
    ]);
    expect(await level("pair")).toEqual({ available: 0, reserved: 2 });
  });

  it("a line above what stock can supply is LOW_STOCK and can't be paid", async () => {
    await makeProduct(a, "trio", "300", 3);
    const s = await shopper(storeA, [["trio", 3]]);
    await ready(s);
    await adjustInventory(storeOf(a), {
      variantId: variant["trio"],
      delta: -1,
      reason: "CORRECTION",
    });
    const view = await getCheckout(s.req);
    expect(view?.unavailable).toEqual([
      expect.objectContaining({ quantity: 3, reason: "LOW_STOCK", available: 2 }) as unknown,
    ]);
    expect(view?.problems).toContain("UNAVAILABLE");
    expect(await pay(s)).toMatchObject({ kind: "changed" });
    // A cart in that state can't start a new checkout either: it is fixed in the cart first.
    const clientIp = nextIp();
    const { newToken } = await addToCart(
      { store: storeA, token: null, clientIp },
      { variantId: variant["trio"], quantity: 2 },
    );
    await adjustInventory(storeOf(a), {
      variantId: variant["trio"],
      delta: -1,
      reason: "CORRECTION",
    });
    await expectCode(
      startCheckout({ store: storeA, token: null, clientIp, cartToken: newToken }),
      "CONFLICT",
    );
  });

  it("two shoppers racing for a discount's final use: exactly one gets it", async () => {
    await discount(a, "LASTONE", { usageLimit: 1 });
    const one = await shopper(storeA, [["mug", 1]]);
    const two = await shopper(storeA, [["mug", 1]]);
    for (const s of [one, two]) {
      await ready(s);
      await applyDiscountCode(s.req, { code: "LASTONE" });
    }
    // Both shoppers review first; then both press "pay" at once.
    const [v1, v2] = [await getCheckout(one.req), await getCheckout(two.req)];
    const results = await Promise.all([
      beginPayment(one.req, { pricingHash: v1?.pricingHash, returnUrl: RETURN_URL }),
      beginPayment(two.req, { pricingHash: v2?.pricingHash, returnUrl: RETURN_URL }),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(["changed", "redirect"]);
    expect(results.find((r) => r.kind === "changed")).toEqual({
      kind: "changed",
      change: "DISCOUNT_CHANGED",
    });
    const d = await migratorDb().discount.findFirstOrThrow({ where: { title: "LASTONE off" } });
    expect(d.usageCount).toBe(1);
  });
});

describe("webhook verification", () => {
  it("refuses unsigned, tampered, stale and other-store deliveries", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    await ready(s);
    const started = await pay(s);
    if (started.kind !== "redirect") throw new Error("expected redirect");
    const ref = refOf(started.url);
    const good = signed("a", ref, "captured", 1n);

    const unsigned = new Headers(good.headers);
    unsigned.delete("x-storevia-test-signature");
    expect(await ingestPaymentWebhook(good.connectionId, good.body, unsigned)).toMatchObject({
      status: 401,
    });

    const tampered = new TextEncoder().encode(
      new TextDecoder().decode(good.body).replace('"amount":"1"', '"amount":"99"'),
    );
    expect(await ingestPaymentWebhook(good.connectionId, tampered, good.headers)).toMatchObject({
      status: 401,
    });

    // Signed with store B's secret, delivered to store A's endpoint.
    const foreign = signed("b", ref, "captured", 1n);
    expect(
      await ingestPaymentWebhook(good.connectionId, foreign.body, foreign.headers),
    ).toMatchObject({
      status: 401,
    });
    // Store A's event delivered to store B's endpoint: B's secret doesn't verify it.
    expect(await ingestPaymentWebhook(foreign.connectionId, good.body, good.headers)).toMatchObject(
      {
        status: 401,
      },
    );
    // A properly signed event for store B naming store A's payment finds nothing in store B.
    expect(
      await ingestPaymentWebhook(foreign.connectionId, foreign.body, foreign.headers),
    ).toMatchObject({
      status: 200,
      outcome: "ignored",
    });
    expect(await ingestPaymentWebhook("payconn_garbage", good.body, good.headers)).toMatchObject({
      status: 404,
    });
    // Nothing moved.
    expect((await getCheckout(s.req))?.stage).toBe("paying");
  });

  it("a capture for a different amount fails the attempt and creates no order", async () => {
    const before = await level("mug");
    const s = await shopper(storeA, [["mug", 1]]);
    await ready(s);
    const started = await pay(s);
    if (started.kind !== "redirect") throw new Error("expected redirect");
    const wrong = signed("a", refOf(started.url), "captured", 1n);
    expect(await ingestPaymentWebhook(wrong.connectionId, wrong.body, wrong.headers)).toMatchObject(
      {
        status: 200,
        outcome: "processed",
      },
    );
    const payment = await migratorDb().payment.findFirstOrThrow({
      where: { providerPaymentId: refOf(started.url) },
    });
    expect(payment).toMatchObject({
      status: "FAILED",
      failureCode: "AMOUNT_MISMATCH",
      orderId: null,
    });
    expect(await level("mug")).toEqual(before);
    expect((await getCheckout(s.req))?.stage).toBe("open");
  });
});

describe("expiry", () => {
  it("an expired attempt is released; a capture arriving afterwards still becomes an order", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    await ready(s);
    const started = await pay(s);
    if (started.kind !== "redirect") throw new Error("expected redirect");
    const before = await level("mug");
    await migratorDb().payment.updateMany({
      where: { providerPaymentId: refOf(started.url) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const swept = await sweepExpiredPayments();
    expect(swept.released).toBeGreaterThanOrEqual(1);
    expect(await level("mug")).toEqual({
      available: before.available + 1,
      reserved: before.reserved - 1,
    });
    expect((await getCheckout(s.req))?.stage).toBe("open");

    // The money arrives late: the order is still created, stock claimed again.
    const payment = await migratorDb().payment.findFirstOrThrow({
      where: { providerPaymentId: refOf(started.url) },
    });
    expect(payment.status).toBe("CANCELLED");
    const late = signed("a", refOf(started.url), "captured", payment.amount);
    await ingestPaymentWebhook(late.connectionId, late.body, late.headers);
    const view = await getCheckout(s.req);
    expect(view?.stage).toBe("completed");
    expect(await level("mug")).toEqual(before);
    const order = await migratorDb().order.findFirstOrThrow({
      where: { payments: { some: { id: payment.id } } },
    });
    expect(order.stockShortage).toBe(false);
  });

  it("a late capture when the stock has gone flags the order instead of losing it", async () => {
    await makeProduct(a, "scarce", "300", 1);
    const s = await shopper(storeA, [["scarce", 1]]);
    await ready(s);
    const started = await pay(s);
    if (started.kind !== "redirect") throw new Error("expected redirect");
    await migratorDb().payment.updateMany({
      where: { providerPaymentId: refOf(started.url) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await sweepExpiredPayments();
    // Someone else buys the unit meanwhile.
    const other = await shopper(storeA, [["scarce", 1]]);
    await ready(other);
    const theirs = await pay(other);
    if (theirs.kind !== "redirect") throw new Error("expected redirect");
    await outcome(other, theirs.url, "captured");

    const payment = await migratorDb().payment.findFirstOrThrow({
      where: { providerPaymentId: refOf(started.url) },
    });
    const late = signed("a", refOf(started.url), "captured", payment.amount);
    await ingestPaymentWebhook(late.connectionId, late.body, late.headers);
    const order = await migratorDb().order.findFirstOrThrow({
      where: { payments: { some: { id: payment.id } } },
      include: { events: true },
    });
    expect(order.stockShortage).toBe(true);
    expect(order.events.map((e) => e.type)).toContain("inventory.shortage");
    expect(await level("scarce")).toEqual({ available: -1, reserved: 2 });
  });

  it("open checkouts past their expiry become EXPIRED and accept no changes", async () => {
    const s = await shopper(storeA, [["mug", 1]]);
    await migratorDb().checkout.updateMany({
      where: { status: "OPEN" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await sweepExpiredCheckouts()).toBeGreaterThanOrEqual(1);
    expect((await getCheckout(s.req))?.stage).toBe("expired");
    await expectCode(updateContact(s.req, { email: "late@example.test" }), "CONFLICT");
  });
});
