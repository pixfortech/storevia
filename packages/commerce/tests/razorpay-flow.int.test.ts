// Razorpay end to end, locally (M8): checkout → payment link on the
// provider → signed webhook → order → refund, with Razorpay's own
// signatures and response shapes (tests/razorpay-fake.ts). Covers the
// provider's retries and duplicate deliveries, a replay under a new event
// id, the shopper's return arriving before or after the webhook, a refund
// whose answer is lost, a declined refund and another store's event.
// Runs in CI with no credentials and moves no money; the same flow against
// Razorpay's test mode is packages/payments/scripts/razorpay-sandbox.ts.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  connectRazorpay,
  createProduct,
  createShippingRate,
  createShippingZone,
  getOrder,
  getPaymentSettings,
  getProduct,
  refundOrder,
  resolvePendingRefund,
} from "../src";
import {
  beginPayment,
  confirmPayment,
  getCheckout,
  ingestPaymentWebhook,
  selectShippingRate,
  startCheckout,
  updateAddress,
  updateContact,
  type CheckoutStore,
} from "../src/checkout";
import { addToCart } from "../src/storefront";
import { makeTenant, steppedUp, storeOf, type Tenant } from "./fixtures";
import { FakeRazorpay } from "./razorpay-fake";

const KEYS = {
  a: {
    keyId: "rzp_test_StoreAkey0001",
    keySecret: "store-a-key-secret-000000000001",
    webhookSecret: "store-a-webhook-secret-0001",
  },
  b: {
    keyId: "rzp_test_StoreBkey0002",
    keySecret: "store-b-key-secret-000000000002",
    webhookSecret: "store-b-webhook-secret-0002",
  },
};

// One fake per merchant account: each store's keys only work on its own.
const fakeA = new FakeRazorpay(KEYS.a.keyId, KEYS.a.keySecret);
let a: Tenant;
let b: Tenant;
let storeA: CheckoutStore;
let connectionA = "";
let connectionB = "";
let variantId = "";
let ip = 0;

async function connectionOf(tenant: Tenant): Promise<string> {
  const settings = await getPaymentSettings(storeOf(tenant));
  const path = settings.connections.find((c) => c.provider === "razorpay")?.webhookPath ?? "";
  return path.split("/").at(-1) ?? "";
}

/** A shopper reaches the provider: returns the checkout request and the link id. */
async function checkoutToProvider(quantity = 1) {
  ip += 1;
  const clientIp = `198.51.100.${String(ip % 250)}`;
  const cart = await addToCart({ store: storeA, token: null, clientIp }, { variantId, quantity });
  const { token } = await startCheckout({
    store: storeA,
    token: null,
    clientIp,
    cartToken: cart.newToken,
  });
  const req = { store: storeA, token, clientIp };
  await updateContact(req, { email: "shopper@example.test" });
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
  const view = await selectShippingRate(req, { rateId: priced?.shippingOptions[0]?.id });
  const started = await beginPayment(req, {
    pricingHash: view.pricingHash,
    returnUrl: "https://shop.example.test/checkout/return",
  });
  if (started.kind !== "redirect") throw new Error(`payment did not start (${started.kind})`);
  const linkId = new URL(started.url).pathname.split("/").at(-1) ?? "";
  return { req, linkId, total: view.total.amount };
}

const ordersFor = (linkId: string) =>
  migratorDb().order.findMany({
    where: { storeId: storeA.storeId, payments: { some: { providerPaymentId: linkId } } },
  });

beforeAll(async () => {
  await truncateAll();
  process.env["RAZORPAY_API_URL"] = await fakeA.start();
  a = await makeTenant("rzp-a");
  b = await makeTenant("rzp-b");
  const s = storeOf(a);
  storeA = { organisationId: s.organisationId, storeId: s.storeId, currency: "INR", name: "A" };
  const { productId } = await createProduct(s, {
    title: "Kettle",
    price: "1500",
    initialStock: 50,
    status: "ACTIVE",
  });
  variantId = (await getProduct(s, productId)).variants[0]?.id ?? "";
  const { zoneId } = await createShippingZone(s, { name: "India", countries: "IN" });
  await createShippingRate(s, zoneId, { name: "Standard", type: "FLAT", amount: "50" });
  await connectRazorpay(await steppedUp(s), KEYS.a);
  await connectRazorpay(await steppedUp(storeOf(b)), KEYS.b);
  connectionA = await connectionOf(a);
  connectionB = await connectionOf(b);
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
  fakeA.refundMode = "processed";
});

afterAll(async () => {
  await fakeA.stop();
  await disconnectTestClients();
});

describe("Razorpay checkout", () => {
  it("creates a payment link for the checkout total and takes the order from the signed webhook", async () => {
    const { linkId, total } = await checkoutToProvider(2);
    const link = fakeA.links.get(linkId);
    expect(link).toMatchObject({ status: "created", currency: "INR" });
    expect(String(link?.amount)).toBe(total);

    fakeA.pay(linkId);
    const delivery = fakeA.webhook(KEYS.a.webhookSecret, "payment_link.paid", linkId);
    expect(await ingestPaymentWebhook(connectionA, delivery.body, delivery.headers)).toEqual({
      status: 200,
      outcome: "processed",
    });
    const [order] = await ordersFor(linkId);
    expect(order).toMatchObject({ paymentStatus: "PAID", currency: "INR" });
    expect(order?.totalAmount.toString()).toBe(total);

    // Razorpay retries the same delivery: nothing changes.
    expect(await ingestPaymentWebhook(connectionA, delivery.body, delivery.headers)).toEqual({
      status: 200,
      outcome: "duplicate",
    });
    // The same captured delivery replayed under a new (unsigned) event id.
    const replay = new Headers(delivery.headers);
    replay.set("x-razorpay-event-id", "evt_ReplayedAgain01");
    expect(await ingestPaymentWebhook(connectionA, delivery.body, replay)).toEqual({
      status: 200,
      outcome: "duplicate",
    });
    // A tampered body fails Razorpay's signature.
    const tampered = new TextEncoder().encode(
      new TextDecoder()
        .decode(delivery.body)
        .replace(`"amount":${String(link?.amount)}`, '"amount":1'),
    );
    expect(await ingestPaymentWebhook(connectionA, tampered, delivery.headers)).toMatchObject({
      status: 401,
    });
    expect(await ordersFor(linkId)).toHaveLength(1);
  });

  it("the shopper's return and the webhook settle the same checkout once, in either order", async () => {
    // Return first: the provider is asked server-side, then the webhook is a no-op.
    const first = await checkoutToProvider();
    fakeA.pay(first.linkId);
    const view = await confirmPayment(first.req);
    expect(view?.stage).toBe("completed");
    expect(view?.order?.number).toBeGreaterThan(0);
    const late = fakeA.webhook(KEYS.a.webhookSecret, "payment_link.paid", first.linkId);
    const lateResult = await ingestPaymentWebhook(connectionA, late.body, late.headers);
    expect(lateResult.status).toBe(200);
    expect(await ordersFor(first.linkId)).toHaveLength(1);

    // Webhook first: the return finds the order already placed.
    const second = await checkoutToProvider();
    fakeA.pay(second.linkId);
    const early = fakeA.webhook(KEYS.a.webhookSecret, "payment_link.paid", second.linkId);
    expect((await ingestPaymentWebhook(connectionA, early.body, early.headers)).status).toBe(200);
    expect((await confirmPayment(second.req))?.stage).toBe("completed");
    expect(await ordersFor(second.linkId)).toHaveLength(1);
  });

  it("an unpaid return places nothing; an expired link releases the checkout", async () => {
    const { req, linkId } = await checkoutToProvider();
    const unpaid = await confirmPayment(req);
    expect(unpaid?.stage).toBe("paying");
    expect(unpaid?.order).toBeNull();
    const expired = fakeA.webhook(KEYS.a.webhookSecret, "payment_link.expired", linkId);
    expect((await ingestPaymentWebhook(connectionA, expired.body, expired.headers)).status).toBe(
      200,
    );
    expect(await ordersFor(linkId)).toHaveLength(0);
  });

  it("another store's connection never accepts this store's events", async () => {
    const { linkId } = await checkoutToProvider();
    fakeA.pay(linkId);
    // Signed with A's secret but sent to B's endpoint: B's secret refuses it.
    const toB = fakeA.webhook(KEYS.a.webhookSecret, "payment_link.paid", linkId);
    expect(await ingestPaymentWebhook(connectionB, toB.body, toB.headers)).toMatchObject({
      status: 401,
    });
    // Even signed with B's own secret, A's payment link places nothing in B.
    const forgedForB = fakeA.webhook(KEYS.b.webhookSecret, "payment_link.paid", linkId);
    expect(await ingestPaymentWebhook(connectionB, forgedForB.body, forgedForB.headers)).toEqual({
      status: 200,
      outcome: "ignored",
    });
    expect(await migratorDb().order.count({ where: { storeId: storeOf(b).storeId } })).toBe(0);
  });
});

describe("Razorpay refunds", () => {
  async function paidOrder(): Promise<string> {
    const { linkId } = await checkoutToProvider();
    fakeA.pay(linkId);
    const paid = fakeA.webhook(KEYS.a.webhookSecret, "payment_link.paid", linkId);
    await ingestPaymentWebhook(connectionA, paid.body, paid.headers);
    const [order] = await ordersFor(linkId);
    if (!order) throw new Error("order was not placed");
    return toTypeId("order", order.id);
  }

  it("refunds through Razorpay with the refund id as its idempotency key", async () => {
    const orderId = await paidOrder();
    const s = await steppedUp(storeOf(a));
    const outcome = await refundOrder(s, orderId, { amount: "200", reason: "Dented lid" });
    expect(outcome.status).toBe("SUCCEEDED");
    const call = fakeA.refundCalls.at(-1);
    expect(call).toMatchObject({
      amount: 20000,
      authorised: true,
      idempotencyKey: outcome.refundId,
    });
    const refund = await migratorDb().refund.findUniqueOrThrow({
      where: { id: parseTypeId("refund", outcome.refundId) ?? "" },
    });
    expect(refund.providerRefundId).toMatch(/^rfnd_/);
    expect((await getOrder(s, orderId)).paymentStatus).toBe("PARTIALLY_REFUNDED");
  });

  it("a refund whose answer is lost stays pending, moves no money, and is settled by the merchant", async () => {
    const orderId = await paidOrder();
    const s = await steppedUp(storeOf(a));
    fakeA.refundMode = "drop-connection";
    const outcome = await refundOrder(s, orderId, { amount: "100" });
    expect(outcome.status).toBe("PENDING");
    expect(outcome.message).toMatch(/didn't confirm/);
    expect((await getOrder(s, orderId)).paymentStatus).toBe("PAID");
    // Razorpay made it (the merchant checks their dashboard) → mark it refunded.
    const settled = await resolvePendingRefund(s, orderId, outcome.refundId, "succeeded");
    expect(settled.status).toBe("SUCCEEDED");
    expect((await getOrder(s, orderId)).paymentStatus).toBe("PARTIALLY_REFUNDED");
  });

  it("a declined refund fails and the order keeps its money", async () => {
    const orderId = await paidOrder();
    const s = await steppedUp(storeOf(a));
    fakeA.refundMode = "decline";
    const outcome = await refundOrder(s, orderId, { amount: "100" });
    expect(outcome.status).toBe("FAILED");
    expect((await getOrder(s, orderId)).paymentStatus).toBe("PAID");
  });
});
