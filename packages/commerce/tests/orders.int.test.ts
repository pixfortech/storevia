// Merchant side of M6 (ADR-0031 §5–§8) against the database: store
// settings through the real services, orders placed through the real
// checkout, then fulfilment, cancellation and refunds with their bounds,
// races, stock effects, RBAC and tenancy.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cancelOrder,
  connectRazorpay,
  connectTestPayments,
  createDiscount,
  createProduct,
  createShippingRate,
  createShippingZone,
  createTaxRate,
  deleteDiscount,
  fulfilOrder,
  getCustomer,
  getOrder,
  getPaymentSettings,
  getProduct,
  getShippingSettings,
  getTaxSettings,
  listCustomers,
  listDiscounts,
  listLocations,
  listOrders,
  orderMetrics,
  refundOrder,
  resolvePendingRefund,
  setDiscountActive,
  updateCustomer,
  updateDiscount,
  updateTaxSettings,
} from "../src";
import {
  applyDiscountCode,
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
import { sendOrderNotifications } from "../src/orders/notifications";
import { platformReplyTo, type EmailMessage, type EmailSender } from "@storevia/email";
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
let storeA: CheckoutStore;
const variant: Record<string, string> = {};
let ip = 0;

async function makeProduct(tenant: Tenant, key: string, price: string, stock: number) {
  const ctx = storeOf(tenant);
  const { productId } = await createProduct(ctx, {
    title: key,
    price,
    initialStock: stock,
    status: "ACTIVE",
  });
  variant[key] = (await getProduct(ctx, productId)).variants[0]?.id ?? "";
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

/** Places a paid order through the real checkout; returns its public id. */
async function placeOrder(
  lines: readonly [string, number][],
  options: { email?: string; code?: string } = {},
): Promise<string> {
  ip += 1;
  const clientIp = `192.0.2.${String(ip % 250)}`;
  let cartToken: string | null = null;
  for (const [key, quantity] of lines) {
    const r = await addToCart(
      { store: storeA, token: cartToken, clientIp },
      { variantId: variant[key], quantity },
    );
    cartToken = r.newToken ?? cartToken;
  }
  const { token } = await startCheckout({ store: storeA, token: null, clientIp, cartToken });
  const req = { store: storeA, token, clientIp };
  await updateContact(req, { email: options.email ?? "shopper@example.test" });
  await updateAddress(req, {
    firstName: "Ravi",
    lastName: "Kumar",
    line1: "4 Park Street",
    city: "Kolkata",
    countryCode: "IN",
    region: "WB",
    postalCode: "700016",
  });
  if (options.code) await applyDiscountCode(req, { code: options.code });
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
    where: { storeId: storeA.storeId },
    orderBy: { orderNumber: "desc" },
  });
  // A live order (the Test Provider's are test orders): these tests read the sales figures.
  await makeOrderLive(order.id);
  return toTypeId("order", order.id);
}

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("ord-a");
  b = await makeTenant("ord-b");
  const s = storeOf(a);
  storeA = {
    organisationId: s.organisationId,
    storeId: s.storeId,
    currency: "INR",
    name: "Store A",
  };
  await makeProduct(a, "tee", "500", 20);
  await makeProduct(a, "cap", "300", 20);
  const { zoneId } = await createShippingZone(s, { name: "India", countries: "IN" });
  await createShippingRate(s, zoneId, { name: "Standard", type: "FLAT", amount: "40" });
  await createTaxRate(s, { name: "GST", countryCode: "IN", rate: "18" });
  await createDiscount(s, { code: "welcome5", type: "PERCENTAGE", value: "5" });
  await connectTestPayments(s);
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
});

afterAll(disconnectTestClients);

describe("store settings", () => {
  it("shipping zones, rates and tax are configured through the services", async () => {
    const s = storeOf(a);
    const zones = await getShippingSettings(s);
    expect(zones).toMatchObject([
      {
        name: "India",
        countries: [{ countryCode: "IN" }],
        rates: [{ name: "Standard", amount: { amount: "4000" } }],
      },
    ]);
    await expectCode(createShippingZone(s, { name: "Dup", countries: "IN" }), "VALIDATION_FAILED");
    await expectCode(
      createShippingZone(s, { name: "Bad", countries: "India" }),
      "VALIDATION_FAILED",
    );
    const tax = await getTaxSettings(s);
    expect(tax.rates).toMatchObject([{ name: "GST", rate: "18", countryCode: "IN" }]);
    await expectCode(
      createTaxRate(s, { name: "X", countryCode: "IN", rate: "101" }),
      "VALIDATION_FAILED",
    );
    await updateTaxSettings(s, {
      pricesIncludeTax: "",
      chargeTaxOnShipping: "",
      taxRegistrationId: "29ABCDE1234F1Z5",
    });
    expect((await getTaxSettings(s)).taxRegistrationId).toBe("29ABCDE1234F1Z5");
  });

  it("discount codes: upper-cased, unique, bounded, and a used code is disabled rather than deleted", async () => {
    const s = storeOf(a);
    await expectCode(
      createDiscount(s, { code: "WELCOME5", type: "PERCENTAGE", value: "10" }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      createDiscount(s, { code: "BIG", type: "PERCENTAGE", value: "150" }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      createDiscount(s, { code: "has space", type: "PERCENTAGE", value: "5" }),
      "VALIDATION_FAILED",
    );
    const { discountId } = await createDiscount(s, {
      code: "flat100",
      type: "FIXED_AMOUNT",
      value: "100",
      usageLimit: "3",
    });
    const listed = (await listDiscounts(s)).find((d) => d.id === discountId);
    expect(listed).toMatchObject({
      code: "FLAT100",
      amount: { amount: "10000" },
      usageLimit: 3,
      state: "active",
    });
    await updateDiscount(s, discountId, { title: "Flat 100", value: "120", usageLimit: "5" });
    await setDiscountActive(s, discountId, false);
    expect((await listDiscounts(s)).find((d) => d.id === discountId)?.state).toBe("disabled");
    await deleteDiscount(s, discountId);
    expect((await listDiscounts(s)).some((d) => d.id === discountId)).toBe(false);
  });

  it("payment settings never expose credentials; Razorpay keys are validated and sealed", async () => {
    const settings = await getPaymentSettings(storeOf(a));
    expect(settings.connections).toMatchObject([
      { provider: "storevia-test", status: "ACTIVE", mode: "TEST", usable: true },
    ]);
    expect(JSON.stringify(settings)).not.toMatch(/secret|ciphertext/i);
    expect(settings.connections[0]?.webhookPath).toMatch(/^\/api\/webhooks\/payments\/payconn_/);

    const sb = storeOf(b);
    await expectCode(
      connectRazorpay(await steppedUp(sb), { keyId: "nope", keySecret: "x", webhookSecret: "y" }),
      "VALIDATION_FAILED",
    );
    await connectRazorpay(await steppedUp(sb), {
      keyId: "rzp_test_ABCDEFGH12345678",
      keySecret: "s3cr3t-key-secret-value-1234",
      webhookSecret: "whsec-value-at-least-long",
    });
    const rows = await migratorDb().paymentProviderConnection.findMany({
      where: { storeId: sb.storeId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "razorpay", mode: "TEST", status: "ACTIVE" });
    expect(rows[0]?.credentialHint).not.toContain("ABCDEFGH12345678");
    expect(Buffer.from(rows[0]?.credentialsCiphertext ?? []).toString("latin1")).not.toContain(
      "s3cr3t",
    );
  });
});

describe("orders", () => {
  it("lists and shows orders with their snapshots, searchable by number and email", async () => {
    const id = await placeOrder([["tee", 2]], { email: "list@example.test", code: "WELCOME5" });
    const s = storeOf(a);
    const listed = await listOrders(s, {});
    expect(listed.items[0]).toMatchObject({
      id,
      number: 1001,
      itemCount: 2,
      customerName: "Ravi Kumar",
    });
    expect((await listOrders(s, { q: "#1001" })).items).toHaveLength(1);
    expect((await listOrders(s, { q: "LIST@example" })).items).toHaveLength(1);
    expect((await listOrders(s, { q: "nobody" })).items).toHaveLength(0);
    const detail = await getOrder(s, id);
    expect(detail).toMatchObject({
      number: 1001,
      paymentStatus: "PAID",
      fulfilmentStatus: "UNFULFILLED",
      subtotal: { amount: "100000" },
      discountTotal: { amount: "5000" },
      shippingTotal: { amount: "4000" },
      canCancel: true,
      unfulfilledQuantity: 2,
      discounts: [{ code: "WELCOME5" }],
    });
    expect(detail.payments).toHaveLength(1);
    expect(detail.payments[0]).toMatchObject({ primary: true, refundable: detail.total });
    expect(detail.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["order.placed", "payment.captured"]),
    );
    // Another store can't see it.
    await expectCode(getOrder(storeOf(b), id), "NOT_FOUND");
    expect((await listOrders(storeOf(b), {})).items).toHaveLength(0);
  });

  it("RBAC: permissions, not role names, decide who reads and changes orders", async () => {
    const id = await placeOrder([["cap", 1]]);
    const s = storeOf(a);
    const viewer = await memberContext(a, "VIEWER", s);
    const support = await memberContext(a, "SUPPORT", s);
    const orders = await memberContext(a, "ORDER_MANAGER", s);
    await expectCode(listOrders(viewer, {}), "FORBIDDEN");
    await expectCode(getOrder(viewer, id), "FORBIDDEN");
    expect((await getOrder(support, id)).number).toBeGreaterThan(1000);
    await expectCode(fulfilOrder(support, id, {}), "FORBIDDEN");
    await expectCode(refundOrder(await steppedUp(support), id, { amount: "1" }), "FORBIDDEN");
    await expectCode(cancelOrder(support, id, {}), "FORBIDDEN");
    // A cancel with refund needs order.refund up front.
    await fulfilOrder(orders, id, {});
    expect((await getOrder(orders, id)).fulfilmentStatus).toBe("FULFILLED");
  });
});

describe("fulfilment", () => {
  it("partial then complete; never more than ordered; reserved stock ships out", async () => {
    const before = await level("tee");
    const id = await placeOrder([["tee", 3]]);
    const s = storeOf(a);
    expect(await level("tee")).toEqual({
      available: before.available - 3,
      reserved: before.reserved + 3,
    });
    const detail = await getOrder(s, id);
    const lineId = detail.lines[0]?.id;
    await fulfilOrder(s, id, {
      lines: [{ lineId, quantity: 1 }],
      trackingNumber: "TRK1",
      trackingUrl: "https://track.example/TRK1",
    });
    expect((await getOrder(s, id)).fulfilmentStatus).toBe("PARTIALLY_FULFILLED");
    expect(await level("tee")).toEqual({
      available: before.available - 3,
      reserved: before.reserved + 2,
    });
    await expect(fulfilOrder(s, id, { lines: [{ lineId, quantity: 3 }] })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Only 2 of tee are left to fulfil.",
    });
    await expectCode(
      fulfilOrder(s, id, { trackingUrl: "javascript:alert(1)" }),
      "VALIDATION_FAILED",
    );
    await fulfilOrder(s, id, { lines: [{ lineId, quantity: 2 }] });
    const done = await getOrder(s, id);
    expect(done).toMatchObject({
      fulfilmentStatus: "FULFILLED",
      unfulfilledQuantity: 0,
      canCancel: false,
    });
    expect(done.fulfilments).toHaveLength(2);
    expect(done.fulfilments[0]).toMatchObject({ trackingNumber: "TRK1" });
    expect(await level("tee")).toEqual({
      available: before.available - 3,
      reserved: before.reserved,
    });
    await expectCode(fulfilOrder(s, id, {}), "VALIDATION_FAILED");
    const orderId = parseTypeId("order", id) ?? "";
    expect(
      await migratorDb().orderNotification.count({ where: { orderId, kind: "ORDER_FULFILLED" } }),
    ).toBe(2);
  });

  it("two staff fulfilling the same last units at once: one succeeds", async () => {
    const id = await placeOrder([["cap", 2]]);
    const s = storeOf(a);
    const results = await Promise.allSettled([fulfilOrder(s, id, {}), fulfilOrder(s, id, {})]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const detail = await getOrder(s, id);
    expect(detail.lines[0]?.fulfilledQuantity).toBe(2);
    expect(detail.fulfilments).toHaveLength(1);
  });
});

describe("cancellation", () => {
  it("returns reserved stock, is idempotent, and can refund the payment", async () => {
    const before = await level("tee");
    const id = await placeOrder([["tee", 2]]);
    const s = storeOf(a);
    const result = await cancelOrder(await steppedUp(s), id, {
      reason: "Customer asked",
      refund: true,
    });
    expect(result).toMatchObject({ cancelled: true, refund: { status: "SUCCEEDED" } });
    expect(await level("tee")).toEqual(before);
    const detail = await getOrder(s, id);
    expect(detail).toMatchObject({
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
      cancelReason: "Customer asked",
    });
    expect(detail.refunded).toEqual(detail.total);
    // Again: nothing changes.
    expect(await cancelOrder(s, id, {})).toEqual({ cancelled: false, refund: null });
    expect(await level("tee")).toEqual(before);
    await expectCode(fulfilOrder(s, id, {}), "CONFLICT");
  });

  it("an order with fulfilled items can't be cancelled", async () => {
    const id = await placeOrder([["cap", 1]]);
    const s = storeOf(a);
    await fulfilOrder(s, id, {});
    await expectCode(cancelOrder(s, id, {}), "CONFLICT");
  });
});

describe("refunds", () => {
  it("moving money needs a recent password confirmation (M8, S5)", async () => {
    const id = await placeOrder([["tee", 1]]);
    const s = storeOf(a);
    await expect(refundOrder(s, id, { amount: "100" })).rejects.toMatchObject({
      code: "REAUTHENTICATION_REQUIRED",
      message: "Confirm your password before refunding a payment.",
    });
    await expectCode(cancelOrder(s, id, { refund: true }), "REAUTHENTICATION_REQUIRED");
    await expectCode(
      connectRazorpay(storeOf(b), {
        keyId: "rzp_test_ABCDEFGH12345678",
        keySecret: "s3cr3t-key-secret-value-1234",
        webhookSecret: "whsec-value-at-least-long",
      }),
      "REAUTHENTICATION_REQUIRED",
    );
    // Nothing moved.
    expect((await getOrder(s, id)).paymentStatus).toBe("PAID");
  });

  it("partial refunds are bounded by what was captured", async () => {
    const id = await placeOrder([["tee", 1]]);
    const s = storeOf(a);
    const detail = await getOrder(s, id);
    // 500.00 + 40.00 shipping + 18% GST on the goods (shipping isn't taxed).
    expect(detail.total.amount).toBe("63000");
    const first = await refundOrder(await steppedUp(s), id, {
      amount: "100",
      reason: "Damaged box",
    });
    expect(first.status).toBe("SUCCEEDED");
    expect((await getOrder(s, id)).paymentStatus).toBe("PARTIALLY_REFUNDED");
    await expect(refundOrder(await steppedUp(s), id, { amount: "1000" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { amount: expect.stringContaining("up to") as unknown },
    });
    await expectCode(refundOrder(await steppedUp(s), id, { amount: "0" }), "VALIDATION_FAILED");
    await expectCode(refundOrder(await steppedUp(s), id, { amount: "1.234" }), "VALIDATION_FAILED");
    const rest = await getOrder(s, id);
    const remaining = rest.payments[0]?.refundable.amount ?? "0";
    await refundOrder(await steppedUp(s), id, { amount: (Number(remaining) / 100).toFixed(2) });
    expect((await getOrder(s, id)).paymentStatus).toBe("REFUNDED");
    await expectCode(refundOrder(await steppedUp(s), id, { amount: "1" }), "VALIDATION_FAILED");
  });

  it("a refund the provider hasn't confirmed still counts against the bound", async () => {
    const id = await placeOrder([["cap", 1]]);
    const s = storeOf(a);
    const orderId = parseTypeId("order", id) ?? "";
    const payment = await migratorDb().payment.findFirstOrThrow({ where: { orderId } });
    // An earlier refund still waiting for the provider (e.g. a timeout on its call).
    await migratorDb().refund.create({
      data: {
        organisationId: payment.organisationId,
        storeId: payment.storeId,
        orderId,
        paymentId: payment.id,
        status: "PENDING",
        currency: payment.currency,
        amount: 10000n,
        idempotencyKey: `refund:pending-${orderId}`,
      },
    });
    const refundable = (await getOrder(s, id)).payments[0]?.refundable.amount;
    expect(refundable).toBe((payment.capturedAmount - 10000n).toString());
    const total = (Number(payment.capturedAmount) / 100).toFixed(2);
    await expect(refundOrder(await steppedUp(s), id, { amount: total })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("two refunds of the full amount at once: exactly one goes through", async () => {
    const id = await placeOrder([["cap", 1]]);
    const s = storeOf(a);
    const total = (await getOrder(s, id)).total.amount;
    const decimal = (Number(total) / 100).toFixed(2);
    const results = await Promise.allSettled([
      refundOrder(await steppedUp(s), id, { amount: decimal }),
      refundOrder(await steppedUp(s), id, { amount: decimal }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const payment = await migratorDb().payment.findFirstOrThrow({
      where: { orderId: parseTypeId("order", id) ?? "" },
    });
    expect(payment.refundedAmount).toBe(payment.capturedAmount);
  });

  it("a declined refund frees its amount again; restock applies to fulfilled units only", async () => {
    const before = await level("tee");
    const id = await placeOrder([["tee", 2]]);
    const s = storeOf(a);
    // The test provider declines amounts ending in 13 minor units.
    const declined = await refundOrder(await steppedUp(s), id, { amount: "0.13" });
    expect(declined).toMatchObject({ status: "FAILED" });
    const detail = await getOrder(s, id);
    expect(detail.payments[0]?.refundable).toEqual(detail.total);
    const lineId = detail.lines[0]?.id;
    const location = (await listLocations(s))[0]?.id;
    await expectCode(
      refundOrder(await steppedUp(s), id, {
        amount: "100",
        lines: [{ lineId, quantity: 1, restock: true }],
        locationId: location,
      }),
      "VALIDATION_FAILED",
    );
    await fulfilOrder(s, id, {});
    expect(await level("tee")).toEqual({
      available: before.available - 2,
      reserved: before.reserved,
    });
    const refunded = await refundOrder(await steppedUp(s), id, {
      amount: "500",
      lines: [{ lineId, quantity: 1, restock: true }],
      locationId: location,
    });
    expect(refunded.status).toBe("SUCCEEDED");
    expect(await level("tee")).toEqual({
      available: before.available - 1,
      reserved: before.reserved,
    });
    const after = await getOrder(s, id);
    expect(after.lines[0]).toMatchObject({ refundedQuantity: 1, restockable: 1 });
    // A pending refund the provider didn't confirm can be settled by staff; a settled one can't change.
    expect((await resolvePendingRefund(s, id, refunded.refundId, "failed")).status).toBe(
      "SUCCEEDED",
    );
  });
});

describe("customers", () => {
  it("one customer per email, case-insensitively; merchants keep notes and tags", async () => {
    await placeOrder([["cap", 1]], { email: "Repeat@Example.test" });
    await placeOrder([["cap", 1]], { email: "repeat@example.TEST" });
    const s = storeOf(a);
    const found = (await listCustomers(s, { q: "repeat@" })).items;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ orderCount: 2, name: "Ravi Kumar" });
    const id = found[0]?.id ?? "";
    await updateCustomer(s, id, { note: "VIP", tags: "wholesale, vip, vip" });
    expect(await getCustomer(s, id)).toMatchObject({ note: "VIP", tags: ["wholesale", "vip"] });
    expect((await getCustomer(s, id)).orders).toHaveLength(2);
    await expectCode(getCustomer(storeOf(b), id), "NOT_FOUND");
    const viewer = await memberContext(a, "VIEWER", s);
    await expectCode(listCustomers(viewer, {}), "FORBIDDEN");
  });

  it("the overview counts real orders", async () => {
    const metrics = await orderMetrics(storeOf(a));
    expect(metrics.ordersToday).toBeGreaterThan(5);
    expect(metrics.revenue30d?.currency).toBe("INR");
  });
});

describe("order emails", () => {
  it("sends each queued email once; a failing sender retries later and never touches the order", async () => {
    const sent: EmailMessage[] = [];
    const ok: EmailSender = {
      send: (m) => {
        sent.push(m);
        return Promise.resolve();
      },
    };
    for (let i = 0; i < 20; i++) {
      if ((await sendOrderNotifications(ok, 100)).sent === 0) break;
    }
    const templates = new Set(sent.map((m) => m.template));
    for (const t of ["order-confirmation", "order-fulfilled", "order-cancelled", "order-refund"]) {
      expect(templates.has(t)).toBe(true);
    }
    const confirmation = sent.find((m) => m.template === "order-confirmation");
    expect(confirmation?.subject).toMatch(/^Order #\d+ confirmed – Store /);
    // Replies go to the store (final pass, CO-3): no support or contact email
    // is set here, so every message carries Storevia's fallback address.
    expect(sent.every((m) => m.replyTo === platformReplyTo())).toBe(true);
    expect((await sendOrderNotifications(ok, 100)).sent).toBe(0);

    // With a support email set, replies reach the store.
    await migratorDb().store.update({
      where: { id: storeA.storeId },
      data: { supportEmail: "help@store-a.example", contactEmail: "hello@store-a.example" },
    });
    sent.length = 0;
    await placeOrder([["cap", 1]], { email: "reply@example.test" });
    for (let i = 0; i < 20; i++) {
      if ((await sendOrderNotifications(ok, 100)).sent === 0) break;
    }
    expect(sent.map((m) => m.replyTo)).toEqual(["help@store-a.example"]);
    // A value that could inject a header (never accepted by the settings
    // form) is dropped for the fallback, not sent.
    await migratorDb().store.update({
      where: { id: storeA.storeId },
      data: { supportEmail: "x@store-a.example\r\nBcc: y@example.test", contactEmail: null },
    });
    sent.length = 0;
    await placeOrder([["cap", 1]], { email: "reply2@example.test" });
    for (let i = 0; i < 20; i++) {
      if ((await sendOrderNotifications(ok, 100)).sent === 0) break;
    }
    expect(sent.map((m) => m.replyTo)).toEqual([platformReplyTo()]);
    await migratorDb().store.update({
      where: { id: storeA.storeId },
      data: { supportEmail: null, contactEmail: null },
    });

    const id = await placeOrder([["cap", 1]], { email: "retry@example.test" });
    const failing: EmailSender = { send: () => Promise.reject(new Error("smtp down")) };
    expect(await sendOrderNotifications(failing, 100)).toMatchObject({ retrying: 1, sent: 0 });
    const orderId = parseTypeId("order", id) ?? "";
    const row = await migratorDb().orderNotification.findFirstOrThrow({ where: { orderId } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastError: "Error" });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect((await getOrder(storeOf(a), id)).paymentStatus).toBe("PAID");
    // Nothing is due yet, so nothing is sent twice.
    expect((await sendOrderNotifications(ok, 100)).sent).toBe(0);
  });
});
