// Order operations after payment (post-M7) against the database: the
// fulfilment journey (shipping and local delivery), tracking edits,
// delivered and complete, archive, the dev/test-only demo delete, the
// shopper's order link and messages, and the staff notifications they
// raise, with the permission, tenancy and abuse cases around each.
import { withCheckout } from "@storevia/database/checkout";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { withTenant } from "@storevia/database";
import type { EmailMessage, EmailSender } from "@storevia/email";
import { MEMBER_ROLES, permissionsFor } from "@storevia/tenancy";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cancelOrder,
  completeOrder,
  connectTestPayments,
  createProduct,
  createShippingRate,
  createShippingZone,
  deleteDemoOrder,
  fulfilOrder,
  getOrder,
  getProduct,
  listOrders,
  markFulfilmentDelivered,
  markStaffNotificationsRead,
  orderMessages,
  replyToOrderMessage,
  resetCustomerOrderLink,
  setOrderArchived,
  staffNotifications,
  unreadStaffNotifications,
  updateFulfilment,
  updateOrderNote,
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
import {
  hashOrderAccessToken,
  orderAccessToken,
  verifiedOrderAccessHash,
} from "../src/orders/access";
import { getCustomerOrder, sendCustomerOrderMessage } from "../src/orders/customer";
import { notifyStaffOfCustomerMessages, notifyStaffOfNewOrders } from "../src/orders/messages";
import { sendOrderNotifications } from "../src/orders/notifications";
import { addToCart } from "../src/storefront";
import {
  expectCode,
  makeOrderLive,
  makeTenant,
  memberContext,
  storeOf,
  type Tenant,
} from "./fixtures";

let a: Tenant;
let b: Tenant;
let storeA: CheckoutStore;
let storeB: CheckoutStore;
const variant: Record<string, string> = {};
let ip = 0;

const checkoutStoreOf = (tenant: Tenant, name: string): CheckoutStore => {
  const s = storeOf(tenant);
  return { organisationId: s.organisationId, storeId: s.storeId, currency: "INR", name };
};

async function makeProduct(tenant: Tenant, key: string) {
  const ctx = storeOf(tenant);
  const { productId } = await createProduct(ctx, {
    title: key,
    price: "500",
    initialStock: 100,
    status: "ACTIVE",
  });
  variant[key] = (await getProduct(ctx, productId)).variants[0]?.id ?? "";
}

/** A paid order through the real checkout: its public id and the shopper's order link token. */
async function placeOrder(
  store: CheckoutStore,
  key: string,
  quantity = 1,
  options: { readonly test?: boolean } = {},
): Promise<{ id: string; token: string }> {
  ip += 1;
  const clientIp = `198.51.100.${String(ip % 250)}`;
  const r = await addToCart(
    { store, token: null, clientIp },
    { variantId: variant[key], quantity },
  );
  const { token } = await startCheckout({ store, token: null, clientIp, cartToken: r.newToken });
  const req = { store, token, clientIp };
  await updateContact(req, { email: "shopper@example.test" });
  await updateAddress(req, {
    firstName: "Asha",
    lastName: "Rao",
    line1: "12 MG Road",
    city: "Bengaluru",
    countryCode: "IN",
    region: "KA",
    postalCode: "560001",
  });
  const priced = await getCheckout(req);
  const rate = priced?.shippingOptions.find((o) => o.name === "Standard");
  const view = await selectShippingRate(req, { rateId: rate?.id });
  const started = await beginPayment(req, {
    pricingHash: view.pricingHash,
    returnUrl: "http://shop.test/checkout/return",
  });
  if (started.kind !== "redirect") throw new Error("payment did not start");
  await simulateTestPayment(req, new URL(started.url).searchParams.get("ref") ?? "", "captured");
  const done = await getCheckout(req);
  const path = done?.order?.accessPath ?? "";
  expect(path).toMatch(/^\/orders\/view\/[A-Za-z0-9_-]{65}$/);
  const order = await migratorDb().order.findFirstOrThrow({
    where: { storeId: store.storeId },
    orderBy: { orderNumber: "desc" },
  });
  // Live unless asked: these tests read the default order lists.
  if (!options.test) await makeOrderLive(order.id);
  return { id: toTypeId("order", order.id), token: path.slice("/orders/view/".length) };
}

const internal = (id: string) => parseTypeId("order", id) ?? "";

async function events(orderPublicId: string): Promise<string[]> {
  const rows = await migratorDb().orderEvent.findMany({
    where: { orderId: internal(orderPublicId) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((e) => e.type);
}

const scopeA = () => ({ organisationId: storeA.organisationId, storeId: storeA.storeId });

beforeAll(async () => {
  await truncateAll();
  // Store 1 is where a store-limited member works instead.
  a = await makeTenant("ops-a", { stores: [{ currency: "INR" }, { currency: "INR" }] });
  b = await makeTenant("ops-b");
  storeA = checkoutStoreOf(a, "Store A");
  storeB = checkoutStoreOf(b, "Store B");
  for (const [tenant, key] of [
    [a, "lamp"],
    [b, "vase"],
  ] as const) {
    await makeProduct(tenant, key);
    const s = storeOf(tenant);
    const { zoneId } = await createShippingZone(s, { name: "India", countries: "IN" });
    await createShippingRate(s, zoneId, { name: "Standard", type: "FLAT", amount: "40" });
    await connectTestPayments(s);
  }
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
});

afterAll(disconnectTestClients);

describe("fulfilment journey", () => {
  it("shipping: ready → shipped with tracking → edit tracking → in transit → delivered → complete", async () => {
    const s = storeOf(a);
    const { id, token } = await placeOrder(storeA, "lamp", 2);
    await fulfilOrder(s, id, { method: "SHIPPING", status: "READY" });
    let order = await getOrder(s, id);
    const f = order.fulfilments[0];
    expect(f).toMatchObject({ method: "SHIPPING", shipmentStatus: "READY", shippedAt: null });
    // Packed isn't sent: no "on its way" email, no delivery assumed.
    expect(order).toMatchObject({ fulfilmentStatus: "FULFILLED", deliveryStatus: "READY" });
    expect(
      await migratorDb().orderNotification.count({
        where: { orderId: internal(id), kind: "ORDER_FULFILLED" },
      }),
    ).toBe(0);
    // Not complete while it isn't delivered.
    expect(order.completionBlockers).toEqual(["Not every fulfilment is delivered."]);
    await expectCode(completeOrder(s, id), "CONFLICT");

    await updateFulfilment(s, id, f?.id, {
      status: "SHIPPED",
      trackingCompany: "Delhivery",
      trackingNumber: "DLV123",
      trackingUrl: "https://www.delhivery.com/track/package/DLV123",
    });
    order = await getOrder(s, id);
    expect(order.fulfilments[0]).toMatchObject({
      shipmentStatus: "SHIPPED",
      trackingCompany: "Delhivery",
      trackingNumber: "DLV123",
    });
    expect(order.fulfilments[0]?.shippedAt).toBeInstanceOf(Date);
    expect(order.deliveryStatus).toBe("IN_TRANSIT");
    expect(
      await migratorDb().orderNotification.count({
        where: { orderId: internal(id), kind: "ORDER_FULFILLED" },
      }),
    ).toBe(1);

    // Replace, validate and remove tracking.
    await expectCode(
      updateFulfilment(s, id, f?.id, { trackingUrl: "javascript:alert(1)" }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      updateFulfilment(s, id, f?.id, { trackingUrl: "ftp://example.test/x" }),
      "VALIDATION_FAILED",
    );
    await updateFulfilment(s, id, f?.id, {
      trackingNumber: "DLV999",
      trackingUrl: "https://www.delhivery.com/track/package/DLV999",
    });
    expect((await getOrder(s, id)).fulfilments[0]).toMatchObject({
      trackingCompany: "Delhivery",
      trackingNumber: "DLV999",
    });
    // A tracking change doesn't send a second "on its way" email.
    expect(
      await migratorDb().orderNotification.count({
        where: { orderId: internal(id), kind: "ORDER_FULFILLED" },
      }),
    ).toBe(1);

    await updateFulfilment(s, id, f?.id, { status: "IN_TRANSIT" });
    await markFulfilmentDelivered(s, id, f?.id);
    order = await getOrder(s, id);
    expect(order.fulfilments[0]?.deliveredAt).toBeInstanceOf(Date);
    expect(order).toMatchObject({ deliveryStatus: "DELIVERED", completionBlockers: [] });

    await completeOrder(s, id);
    order = await getOrder(s, id);
    expect(order).toMatchObject({ state: "COMPLETED", canCancel: false });
    expect(await events(id)).toEqual(
      expect.arrayContaining([
        "fulfilment.created",
        "fulfilment.shipped",
        "fulfilment.tracking_updated",
        "fulfilment.in_transit",
        "fulfilment.delivered",
        "order.completed",
      ]),
    );
    // Complete: tracking can still be corrected, the journey can't move.
    await updateFulfilment(s, id, f?.id, { trackingNumber: "DLV1000" });
    await expectCode(updateFulfilment(s, id, f?.id, { status: "IN_TRANSIT" }), "CONFLICT");
    await expectCode(cancelOrder(s, id, {}), "CONFLICT");
    // Completing twice is a no-op.
    await completeOrder(s, id);

    // The shopper sees the same journey, without internal details.
    const view = await getCustomerOrder(scopeA(), token);
    expect(view?.state).toBe("COMPLETED");
    expect(view?.shipments[0]).toMatchObject({
      method: "SHIPPING",
      status: "DELIVERED",
      carrier: "Delhivery",
      trackingNumber: "DLV1000",
    });
    expect(view?.timeline.map((t) => t.kind)).toEqual(
      expect.arrayContaining(["placed", "paid", "shipped", "in_transit", "delivered", "completed"]),
    );

    const audit = await migratorDb().auditLog.findMany({
      where: { entityId: internal(id) },
      select: { action: true },
    });
    expect(audit.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        "order.fulfilment_updated",
        "order.fulfilment_delivered",
        "order.completed",
      ]),
    );
  });

  it("local delivery: ready → out for delivery → delivered → complete; carrier steps refused", async () => {
    const s = storeOf(a);
    const { id, token } = await placeOrder(storeA, "lamp");
    await fulfilOrder(s, id, { method: "LOCAL_DELIVERY" });
    const f = (await getOrder(s, id)).fulfilments[0];
    expect(f).toMatchObject({ method: "LOCAL_DELIVERY", shipmentStatus: "READY" });
    await expectCode(updateFulfilment(s, id, f?.id, { status: "SHIPPED" }), "VALIDATION_FAILED");
    await expectCode(
      fulfilOrder(s, (await placeOrder(storeA, "lamp")).id, {
        method: "LOCAL_DELIVERY",
        status: "IN_TRANSIT",
      }),
      "VALIDATION_FAILED",
    );
    await updateFulfilment(s, id, f?.id, { status: "OUT_FOR_DELIVERY" });
    expect((await getOrder(s, id)).deliveryStatus).toBe("IN_TRANSIT");
    await updateFulfilment(s, id, f?.id, { status: "DELIVERED" });
    await completeOrder(s, id);
    expect((await getOrder(s, id)).state).toBe("COMPLETED");
    const view = await getCustomerOrder(scopeA(), token);
    expect(view?.timeline.map((t) => t.kind)).toEqual(
      expect.arrayContaining(["out_for_delivery", "delivered", "completed"]),
    );
  });

  it("dates: never in the future, never before the order; delivered can't precede shipped", async () => {
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp");
    await fulfilOrder(s, id, {});
    const f = (await getOrder(s, id)).fulfilments[0];
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await expectCode(
      updateFulfilment(s, id, f?.id, { status: "DELIVERED", deliveredAt: tomorrow }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      updateFulfilment(s, id, f?.id, { shippedAt: "2001-01-01T00:00:00Z" }),
      "VALIDATION_FAILED",
    );
    const shipped = (await getOrder(s, id)).fulfilments[0]?.shippedAt ?? new Date();
    await expectCode(
      updateFulfilment(s, id, f?.id, {
        status: "DELIVERED",
        deliveredAt: new Date(shipped.getTime() - 60_000).toISOString(),
      }),
      "VALIDATION_FAILED",
    );
    // The database holds the same line: delivered ⇔ deliveredAt.
    await expect(
      migratorDb().$executeRaw`
        UPDATE "Fulfilment" SET "shipmentStatus" = 'DELIVERED', "deliveredAt" = NULL
        WHERE id = ${parseTypeId("fulfilment", f?.id ?? "")}::uuid`,
    ).rejects.toThrow();
  });

  it("completing early needs an explicit override with a reason, and is audited", async () => {
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp", 2);
    const lineId = (await getOrder(s, id)).lines[0]?.id;
    await fulfilOrder(s, id, { lines: [{ lineId, quantity: 1 }] });
    expect((await getOrder(s, id)).completionBlockers).toContain("Not every item is fulfilled.");
    await expectCode(completeOrder(s, id), "CONFLICT");
    await expectCode(completeOrder(s, id, { override: true }), "VALIDATION_FAILED");
    await completeOrder(s, id, { override: true, reason: "Customer collected the rest in store" });
    expect((await getOrder(s, id)).state).toBe("COMPLETED");
    // Nothing more can be fulfilled on a complete order.
    await expectCode(fulfilOrder(s, id, {}), "CONFLICT");
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { entityId: internal(id), action: "order.completed" },
    });
    expect(audit.metadata).toMatchObject({
      action: "override",
      reason: "Customer collected the rest in store",
    });
  });

  it("a cancelled order can't be completed", async () => {
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp");
    await cancelOrder(s, id, {});
    await expectCode(completeOrder(s, id, { override: true, reason: "x" }), "CONFLICT");
  });

  it("permissions and tenancy: support can't edit fulfilment; another store's ids are not found", async () => {
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp");
    await fulfilOrder(s, id, {});
    const f = (await getOrder(s, id)).fulfilments[0]?.id;
    const support = await memberContext(a, "SUPPORT", s);
    await expectCode(updateFulfilment(support, id, f, { status: "DELIVERED" }), "FORBIDDEN");
    await expectCode(completeOrder(support, id), "FORBIDDEN");
    await expectCode(setOrderArchived(support, id, true), "FORBIDDEN");
    // Store B's owner, with store A's ids: invisible.
    await expectCode(updateFulfilment(storeOf(b), id, f, { status: "DELIVERED" }), "NOT_FOUND");
    await expectCode(markFulfilmentDelivered(storeOf(b), id, f), "NOT_FOUND");
    // A fulfilment of another order in the same store: not this order's.
    const other = await placeOrder(storeA, "lamp");
    await expectCode(updateFulfilment(s, other.id, f, { status: "DELIVERED" }), "NOT_FOUND");
    expect((await getOrder(s, id)).fulfilments[0]?.shipmentStatus).toBe("SHIPPED");
  });
});

describe("archive and deletion", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env["STOREVIA_ENV"] = env["STOREVIA_ENV"];
    delete process.env["DEMO_ORDER_DELETION_ENABLED"];
  });

  it("archived orders leave the default list, stay searchable and in reports, and can be restored", async () => {
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp");
    const number = (await getOrder(s, id)).number;
    const before = await listOrders(s, { status: "all" });
    await setOrderArchived(s, id, true);
    const all = await listOrders(s, { status: "all" });
    expect(all.items.some((o) => o.id === id)).toBe(false);
    expect(all.counts.all).toBe(before.counts.all - 1);
    expect(all.counts.archived).toBe(before.counts.archived + 1);
    const archived = await listOrders(s, { status: "archived" });
    expect(archived.items.find((o) => o.id === id)).toMatchObject({ archived: true });
    // Searching still finds it.
    const found = await listOrders(s, { status: "all", q: String(number) });
    expect(found.items.map((o) => o.id)).toContain(id);
    // Nothing is removed.
    const detail = await getOrder(s, id);
    expect(detail.archivedAt).toBeInstanceOf(Date);
    expect(detail.payments.length).toBeGreaterThan(0);
    await setOrderArchived(s, id, false);
    expect((await listOrders(s, { status: "all" })).items.map((o) => o.id)).toContain(id);
    expect(await events(id)).toEqual(
      expect.arrayContaining(["order.archived", "order.unarchived"]),
    );
  });

  it("real orders can't be deleted: the app role has no DELETE and the history is append-only", async () => {
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp");
    await expect(
      withTenant(
        { ...scopeA(), userId: s.userId },
        (tx) => tx.$executeRaw`DELETE FROM "Order" WHERE id = ${internal(id)}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(
        { ...scopeA(), userId: s.userId },
        (tx) => tx.$executeRaw`DELETE FROM "OrderEvent" WHERE "orderId" = ${internal(id)}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it("demo deletion is off outside development and test unless operations enable it", async () => {
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp");
    const number = (await getOrder(s, id)).number;
    process.env["STOREVIA_ENV"] = "production";
    await expectCode(deleteDemoOrder(s, id, { confirm: `#${String(number)}` }), "CONFLICT");
    process.env["STOREVIA_ENV"] = "staging";
    await expectCode(deleteDemoOrder(s, id, { confirm: `#${String(number)}` }), "CONFLICT");
    // The operations-only switch.
    process.env["DEMO_ORDER_DELETION_ENABLED"] = "true";
    await expectCode(deleteDemoOrder(s, id, { confirm: "#1" }), "VALIDATION_FAILED");
    const support = await memberContext(a, "SUPPORT", s);
    await expectCode(deleteDemoOrder(support, id, { confirm: `#${String(number)}` }), "FORBIDDEN");
    const held = async () =>
      (await migratorDb().inventoryLevel.findMany({ where: { storeId: storeA.storeId } })).reduce(
        (n, l) => n + l.reserved,
        0,
      );
    const reservedBefore = await held();
    await deleteDemoOrder(s, id, { confirm: `#${String(number)}` });
    expect(await migratorDb().order.count({ where: { id: internal(id) } })).toBe(0);
    // Its reserved unit went back on sale.
    expect(await held()).toBe(reservedBefore - 1);
    expect(await migratorDb().orderEvent.count({ where: { orderId: internal(id) } })).toBe(0);
    // The payment row stays (detached), and the deletion is audited.
    expect(
      await migratorDb().auditLog.count({
        where: { entityId: internal(id), action: "order.demo_deleted" },
      }),
    ).toBe(1);
  });

  it("an order that took a live payment is refused, by the service and by the database", async () => {
    process.env["STOREVIA_ENV"] = "test";
    const s = storeOf(a);
    const { id } = await placeOrder(storeA, "lamp");
    const number = (await getOrder(s, id)).number;
    const payment = await migratorDb().payment.findFirstOrThrow({
      where: { orderId: internal(id) },
    });
    const db = migratorDb();
    const original = await db.paymentProviderConnection.findUniqueOrThrow({
      where: { id: payment.connectionId },
    });
    // Pretend the connection took this payment live.
    await db.$executeRaw`UPDATE "PaymentProviderConnection" SET provider = 'razorpay', mode = 'LIVE'
      WHERE id = ${payment.connectionId}::uuid`;
    try {
      await expect(deleteDemoOrder(s, id, { confirm: `#${String(number)}` })).rejects.toThrow(
        /live payment/,
      );
      await expectCode(deleteDemoOrder(s, id, { confirm: `#${String(number)}` }), "CONFLICT");
      await expect(
        withTenant(
          { ...scopeA(), userId: s.userId },
          (tx) => tx.$queryRaw`SELECT app_purge_demo_order(${internal(id)}::uuid)`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.$executeRaw`UPDATE "PaymentProviderConnection"
        SET provider = ${original.provider}, mode = ${original.mode}::"PaymentProviderMode"
        WHERE id = ${payment.connectionId}::uuid`;
    }
    expect(await db.order.count({ where: { id: internal(id) } })).toBe(1);
  });

  it("the purge function only reaches the caller's own store", async () => {
    process.env["STOREVIA_ENV"] = "test";
    const { id } = await placeOrder(storeA, "lamp");
    const owner = storeOf(b);
    const rows = await withTenant(
      { organisationId: owner.organisationId, storeId: owner.storeId, userId: owner.userId },
      (tx) =>
        tx.$queryRaw<{ ok: boolean }[]>`SELECT app_purge_demo_order(${internal(id)}::uuid) AS ok`,
    );
    expect(rows[0]?.ok).toBe(false);
    expect(await migratorDb().order.count({ where: { id: internal(id) } })).toBe(1);
  });
});

describe("the shopper's order link", () => {
  it("staff can reset a leaked link: the old one dies, a new one is emailed (M8, S4)", async () => {
    const s = storeOf(a);
    const { id, token } = await placeOrder(storeA, "lamp");
    expect(await getCustomerOrder(scopeA(), token)).not.toBeNull();

    // A viewer can't; order.manage can.
    const viewer = await memberContext(a, "VIEWER", s);
    await expectCode(resetCustomerOrderLink(viewer, id), "FORBIDDEN");
    expect(await resetCustomerOrderLink(s, id)).toEqual({ revoked: 1, emailed: true });

    expect(await getCustomerOrder(scopeA(), token)).toBeNull();
    const live = await migratorDb().orderCustomerAccess.findFirstOrThrow({
      where: { orderId: internal(id), revokedAt: null },
    });
    const fresh = orderAccessToken(live.id);
    expect(fresh).not.toBe(token);
    expect(await getCustomerOrder(scopeA(), fresh)).not.toBeNull();
    // A fresh confirmation carries the new link.
    expect(
      await migratorDb().orderNotification.count({
        where: { orderId: internal(id), dedupeKey: `link-reset:${live.id}` },
      }),
    ).toBe(1);
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "order.customer_link_reset", entityId: internal(id) },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(fresh);
    // The shopper's timeline shows nothing of it.
    const view = await getCustomerOrder(scopeA(), fresh);
    expect(
      JSON.stringify(view, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
    ).not.toMatch(/reset/i);
  });

  it("a secret rotation keeps links working while the previous secret is kept", () => {
    const id = "0190f2a4-0000-7000-8000-00000000e001";
    const oldEnv = { STOREVIA_ENV: "production", ORDER_ACCESS_SECRET: "o".repeat(40) };
    const token = orderAccessToken(id, oldEnv);
    const rotated = { STOREVIA_ENV: "production", ORDER_ACCESS_SECRET: "n".repeat(40) };
    expect(verifiedOrderAccessHash(token, rotated)).toBeNull();
    expect(
      verifiedOrderAccessHash(token, { ...rotated, ORDER_ACCESS_SECRET_PREVIOUS: "o".repeat(40) }),
    ).toBe(hashOrderAccessToken(token));
    // A short "previous" secret is ignored, never a way in.
    expect(
      verifiedOrderAccessHash(token, { ...rotated, ORDER_ACCESS_SECRET_PREVIOUS: "o" }),
    ).toBeNull();
  });

  it("opens exactly one order of one store, and only with a genuine, live token", async () => {
    const s = storeOf(a);
    const { id, token } = await placeOrder(storeA, "lamp");
    await updateOrderNote(s, id, { note: "VIP — staff eyes only" });
    const view = await getCustomerOrder(scopeA(), token);
    expect(view?.number).toBe((await getOrder(s, id)).number);
    // A customer-safe subset: no ids, staff notes, provider data or names.
    const json = JSON.stringify(view, (_k, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(json).not.toContain(internal(id));
    expect(json).not.toContain("VIP");
    expect(json).not.toContain("storevia-test");
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);

    const number = String(view?.number);
    // Guessing: an order number, an email, a forged token, a truncated one.
    expect(await getCustomerOrder(scopeA(), number)).toBeNull();
    expect(await getCustomerOrder(scopeA(), "shopper@example.test")).toBeNull();
    const last = token.at(-1) === "A" ? "B" : "A";
    expect(await getCustomerOrder(scopeA(), token.slice(0, -1) + last)).toBeNull();
    expect(await getCustomerOrder(scopeA(), token.slice(0, 64))).toBeNull();
    // A well-formed token signed with another secret.
    const forged = token.slice(0, 22) + "A".repeat(43);
    expect(await getCustomerOrder(scopeA(), forged)).toBeNull();
    // Store A's token on store B.
    expect(
      await getCustomerOrder(
        { organisationId: storeB.organisationId, storeId: storeB.storeId },
        token,
      ),
    ).toBeNull();
    // Another order's token opens that order, not this one.
    const other = await placeOrder(storeA, "lamp");
    expect((await getCustomerOrder(scopeA(), other.token))?.number).not.toBe(view?.number);

    // Expired, then revoked.
    const hash = hashOrderAccessToken(token);
    await migratorDb().$executeRaw`UPDATE "OrderCustomerAccess"
      SET "createdAt" = now() - interval '2 days', "expiresAt" = now() - interval '1 minute'
      WHERE "tokenHash" = ${hash}`;
    expect(await getCustomerOrder(scopeA(), token)).toBeNull();
    await migratorDb().$executeRaw`UPDATE "OrderCustomerAccess"
      SET "expiresAt" = now() + interval '1 day', "revokedAt" = now() WHERE "tokenHash" = ${hash}`;
    expect(await getCustomerOrder(scopeA(), token)).toBeNull();
    expect(await sendCustomerOrderMessage(scopeA(), token, "hello", null)).toBe("not_found");
  });

  it("the checkout role sees only the opened order, and can't write as staff", async () => {
    const one = await placeOrder(storeA, "lamp");
    const two = await placeOrder(storeA, "lamp");
    const scope = { ...scopeA(), orderAccessHash: hashOrderAccessToken(one.token) };
    const visible = await withCheckout(
      scope,
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order"`,
    );
    expect(visible.map((r) => r.id)).toEqual([internal(one.id)]);
    const messagesOfTwo = await withCheckout(
      scope,
      (tx) =>
        tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "OrderMessage"
        WHERE "orderId" = ${internal(two.id)}::uuid`,
    );
    expect(messagesOfTwo[0]?.n).toBe(0);
    // Writing a "store" message, or onto another order, is refused by the policy.
    await expect(
      withCheckout(
        scope,
        (tx) =>
          tx.$executeRaw`INSERT INTO "OrderMessage" (id, "organisationId", "storeId", "orderId",
            "authorType", "authorUserId", body)
          VALUES (gen_random_uuid(), ${storeA.organisationId}::uuid, ${storeA.storeId}::uuid,
            ${internal(one.id)}::uuid, 'STAFF', ${storeOf(a).userId}::uuid, 'fake')`,
      ),
    ).rejects.toThrow();
    await expect(
      withCheckout(
        scope,
        (tx) =>
          tx.$executeRaw`INSERT INTO "OrderMessage" (id, "organisationId", "storeId", "orderId",
            "authorType", body)
          VALUES (gen_random_uuid(), ${storeA.organisationId}::uuid, ${storeA.storeId}::uuid,
            ${internal(two.id)}::uuid, 'CUSTOMER', 'not my order')`,
      ),
    ).rejects.toThrow();
    // No audit, staff notes table or notification is readable from the checkout role.
    await expect(
      withCheckout(scope, (tx) => tx.$queryRaw`SELECT count(*) FROM "StaffNotification"`),
    ).rejects.toThrow();
  });
});

describe("customer messages and staff notifications", () => {
  it("a message that can't be announced never blocks the ones behind it (M8)", async () => {
    const first = await placeOrder(storeA, "lamp");
    const second = await placeOrder(storeA, "lamp");
    expect(await sendCustomerOrderMessage(scopeA(), first.token, "First", "203.0.113.21")).toBe(
      "sent",
    );
    expect(await sendCustomerOrderMessage(scopeA(), second.token, "Second", "203.0.113.22")).toBe(
      "sent",
    );
    const poisoned = await migratorDb().orderMessage.findFirstOrThrow({
      where: { orderId: internal(first.id) },
    });
    const db = migratorDb();
    // The trigger runs as the worker role: SECURITY DEFINER lets it read the list.
    await db.$executeRaw`CREATE TABLE test_poisoned (id uuid PRIMARY KEY)`;
    await db.$executeRaw`INSERT INTO test_poisoned VALUES (${poisoned.id}::uuid)`;
    await db.$executeRaw`CREATE FUNCTION test_poison() RETURNS trigger LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM test_poisoned WHERE id = NEW."orderMessageId") THEN
          RAISE EXCEPTION 'poisoned';
        END IF;
        RETURN NEW;
      END $$`;
    await db.$executeRaw`CREATE TRIGGER test_poison BEFORE INSERT ON "StaffNotification"
      FOR EACH ROW EXECUTE FUNCTION test_poison()`;
    try {
      const run = await notifyStaffOfCustomerMessages(MEMBER_ROLES);
      expect(run.messages).toBe(1);
      expect(
        await db.staffNotification.count({ where: { orderId: internal(second.id) } }),
      ).toBeGreaterThan(0);
      expect(
        (await db.orderMessage.findUniqueOrThrow({ where: { id: poisoned.id } })).staffNotifiedAt,
      ).toBeNull();
    } finally {
      await db.$executeRaw`DROP TRIGGER test_poison ON "StaffNotification"`;
      await db.$executeRaw`DROP FUNCTION test_poison()`;
      await db.$executeRaw`DROP TABLE test_poisoned`;
    }
    // The next run announces it.
    expect((await notifyStaffOfCustomerMessages(MEMBER_ROLES)).messages).toBe(1);
    expect(
      await db.staffNotification.count({ where: { orderId: internal(first.id) } }),
    ).toBeGreaterThan(0);
    // Leave the bell as the next test expects it.
    await db.staffNotification.deleteMany({
      where: { orderId: { in: [internal(first.id), internal(second.id)] } },
    });
  });

  it("a message reaches the staff allowed to answer it, in its store only; replies email the shopper", async () => {
    const s = storeOf(a);
    const { id, token } = await placeOrder(storeA, "lamp");
    // Members: the owner (all stores), an order manager for this store, a
    // support member limited to the other store, and a viewer (no order.message).
    const manager = await memberContext(a, "ORDER_MANAGER", s, { storeIds: [s.storeId] });
    const elsewhere = await memberContext(a, "SUPPORT", storeOf(a, 1), {
      storeIds: [storeOf(a, 1).storeId],
    });
    const viewer = await memberContext(a, "VIEWER", s);
    const otherTenant = storeOf(b);

    expect(
      await sendCustomerOrderMessage(scopeA(), token, "Please deliver after 5 PM", "203.0.113.9"),
    ).toBe("sent");
    const result = await notifyStaffOfCustomerMessages(MEMBER_ROLES);
    expect(result.messages).toBe(1);
    // Idempotent: nothing is announced twice.
    expect((await notifyStaffOfCustomerMessages(MEMBER_ROLES)).messages).toBe(0);

    const rows = await migratorDb().staffNotification.findMany({
      where: { orderId: internal(id) },
      select: { userId: true, title: true },
    });
    const notified = new Set(rows.map((r) => r.userId));
    expect(notified.has(s.userId)).toBe(true);
    expect(notified.has(manager.userId)).toBe(true);
    expect(notified.has(viewer.userId)).toBe(false);
    expect(notified.has(otherTenant.userId)).toBe(false);
    expect(notified.has(elsewhere.userId)).toBe(false);
    // Every recipient holds order.message and can open this store.
    const memberships = await migratorDb().membership.findMany({
      where: { userId: { in: [...notified] }, organisationId: a.org.organisationId },
      include: { storeAccess: true },
    });
    for (const m of memberships) {
      expect(["OWNER", "ADMIN", "STORE_MANAGER", "ORDER_MANAGER", "SUPPORT"]).toContain(m.role);
      expect(m.allStores || m.storeAccess.some((x) => x.storeId === s.storeId)).toBe(true);
    }
    const number = (await getOrder(s, id)).number;
    expect(rows[0]?.title).toBe(`Customer sent a message on Order #${String(number)}`);

    // The bell: the manager's list, with a link to the order's messages.
    const list = await staffNotifications(manager);
    expect(list.unread).toBe(1);
    expect(list.items[0]?.href).toBe(`/s/${toTypeId("store", s.storeId)}/orders/${id}#messages`);
    // Nobody else's: another tenant and a viewer see nothing of it.
    expect((await staffNotifications(otherTenant)).items).toHaveLength(0);
    expect((await staffNotifications(viewer)).items).toHaveLength(0);
    // The database hides other members' rows even without the service's filter.
    const seen = await withTenant(
      { organisationId: viewer.organisationId, storeId: null, userId: viewer.userId },
      (tx) => tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "StaffNotification"`,
    );
    expect(seen[0]?.n).toBe(0);
    // Marking another member's notification read does nothing.
    await markStaffNotificationsRead(
      viewer,
      list.items.map((i) => i.id),
    );
    expect(await unreadStaffNotifications(manager)).toBe(1);

    // The merchant sees the message; opening it marks it read.
    const messages = await orderMessages(manager, id, { markRead: true });
    expect(messages).toEqual([
      expect.objectContaining({ from: "customer", body: "Please deliver after 5 PM" }),
    ]);
    expect(await unreadStaffNotifications(manager)).toBe(0);
    expect(await unreadStaffNotifications(s)).toBe(1);
    await markStaffNotificationsRead(s, "all");
    expect(await unreadStaffNotifications(s)).toBe(0);

    // A viewer may read orders but not answer.
    await expectCode(replyToOrderMessage(viewer, id, { body: "hi" }), "FORBIDDEN");
    await replyToOrderMessage(manager, id, { body: "Noted — we'll come after 5." });
    const view = await getCustomerOrder(scopeA(), token);
    expect(view?.messages.map((m) => m.from)).toEqual(["customer", "store"]);
    // The shopper never sees staff names.
    expect(JSON.stringify(view?.messages)).not.toContain("order_manager");

    const sent: EmailMessage[] = [];
    const sender: EmailSender = {
      send: (m) => {
        sent.push(m);
        return Promise.resolve();
      },
    };
    for (let i = 0; i < 20; i++) {
      if ((await sendOrderNotifications(sender, 100)).sent === 0) break;
    }
    const reply = sent.find((m) => m.template === "order-message-reply");
    expect(reply?.text).toContain("Noted — we'll come after 5.");
    expect(reply?.text).toMatch(/\/orders\/view\/[A-Za-z0-9_-]{65}/);
    // This order's confirmation (an earlier test revoked another order's link,
    // and that order's email rightly carries none).
    const confirmation = sent.find(
      (m) => m.template === "order-confirmation" && m.text.includes(`#${String(number)}.`),
    );
    expect(confirmation?.text).toMatch(/\/orders\/view\/[A-Za-z0-9_-]{65}/);
  });

  it("a member without order access is never told and can't read the conversation", async () => {
    const s = storeOf(a);
    const { id, token } = await placeOrder(storeA, "lamp");
    const designer = await memberContext(a, "DESIGNER", s);
    expect(designer.permissions.has("order.read")).toBe(false);
    await sendCustomerOrderMessage(scopeA(), token, "Can you gift wrap it?", null);
    await notifyStaffOfCustomerMessages(MEMBER_ROLES);
    expect(
      await migratorDb().staffNotification.count({
        where: { orderId: internal(id), userId: designer.userId },
      }),
    ).toBe(0);
    expect(await staffNotifications(designer)).toEqual({ unread: 0, items: [] });
    await expectCode(orderMessages(designer, id), "FORBIDDEN");
    await expectCode(replyToOrderMessage(designer, id, { body: "hi" }), "FORBIDDEN");
  });

  it("access narrowed later: old notifications stop showing", async () => {
    const s = storeOf(a);
    const { token } = await placeOrder(storeA, "lamp");
    const manager = await memberContext(a, "ORDER_MANAGER", s, { storeIds: [s.storeId] });
    await sendCustomerOrderMessage(scopeA(), token, "Is it gift wrapped?", null);
    await notifyStaffOfCustomerMessages(MEMBER_ROLES);
    expect(await unreadStaffNotifications(manager)).toBe(1);
    await migratorDb().membershipStoreAccess.deleteMany({
      where: { membership: { userId: manager.userId } },
    });
    expect(await unreadStaffNotifications(manager)).toBe(0);
    expect((await staffNotifications(manager)).items).toHaveLength(0);
  });

  it("messages are plain text, bounded and rate limited", async () => {
    const { id, token } = await placeOrder(storeA, "lamp");
    await expectCode(sendCustomerOrderMessage(scopeA(), token, "   ", null), "VALIDATION_FAILED");
    await expectCode(
      sendCustomerOrderMessage(scopeA(), token, "x".repeat(2001), null),
      "VALIDATION_FAILED",
    );
    await expectCode(sendCustomerOrderMessage(scopeA(), token, 42, null), "VALIDATION_FAILED");
    // Markup is kept as text (escaped wherever it's shown), control characters dropped.
    const xss = `<script>alert("x")</script><img src=x onerror=alert(1)>\u0000\u0007`;
    await sendCustomerOrderMessage(scopeA(), token, xss, null);
    const stored = await migratorDb().orderMessage.findFirstOrThrow({
      where: { orderId: internal(id) },
    });
    expect(stored.body).toBe(`<script>alert("x")</script><img src=x onerror=alert(1)>`);
    // Ten per order per hour.
    for (let i = 0; i < 9; i++)
      await sendCustomerOrderMessage(scopeA(), token, `m${String(i)}`, null);
    await expectCode(sendCustomerOrderMessage(scopeA(), token, "one more", null), "RATE_LIMITED");
    expect(await migratorDb().orderMessage.count({ where: { orderId: internal(id) } })).toBe(10);
  });

  it("messages are append-only", async () => {
    const { id, token } = await placeOrder(storeA, "lamp");
    await sendCustomerOrderMessage(scopeA(), token, "original", null);
    const s = storeOf(a);
    await expect(
      withTenant(
        { ...scopeA(), userId: s.userId },
        (tx) =>
          tx.$executeRaw`UPDATE "OrderMessage" SET body = 'edited'
          WHERE "orderId" = ${internal(id)}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(
        { ...scopeA(), userId: s.userId },
        (tx) => tx.$executeRaw`DELETE FROM "OrderMessage" WHERE "orderId" = ${internal(id)}::uuid`,
      ),
    ).rejects.toThrow();
  });
});

describe("new order notifications (final pass, ORD-1)", () => {
  it("reach the members who read orders in that store, once, linking to the order", async () => {
    const db = migratorDb();
    // Orders placed by earlier tests are announced first, so this one's
    // recipients are read on their own.
    await notifyStaffOfNewOrders(MEMBER_ROLES, 1000);
    const s = storeOf(a);
    const manager = await memberContext(a, "ORDER_MANAGER", s, { storeIds: [s.storeId] });
    const elsewhere = await memberContext(a, "ORDER_MANAGER", storeOf(a, 1), {
      storeIds: [storeOf(a, 1).storeId],
    });
    const designer = await memberContext(a, "DESIGNER", s);
    const otherTenant = storeOf(b);
    const { id } = await placeOrder(storeA, "lamp", 1, { test: true });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: internal(id) } })).staffNotifiedAt,
    ).toBeNull();

    const run = await notifyStaffOfNewOrders(MEMBER_ROLES);
    expect(run.orders).toBe(1);
    // Idempotent: a second run announces nothing.
    expect((await notifyStaffOfNewOrders(MEMBER_ROLES)).orders).toBe(0);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: internal(id) } })).staffNotifiedAt,
    ).not.toBeNull();

    const rows = await db.staffNotification.findMany({
      where: { orderId: internal(id), kind: "NEW_ORDER" },
      select: { userId: true, title: true },
    });
    const notified = new Set(rows.map((r) => r.userId));
    expect(rows).toHaveLength(notified.size);
    expect(notified.has(s.userId)).toBe(true);
    expect(notified.has(manager.userId)).toBe(true);
    expect(notified.has(elsewhere.userId)).toBe(false);
    expect(notified.has(designer.userId)).toBe(false);
    expect(notified.has(otherTenant.userId)).toBe(false);
    // Every recipient reads orders and can open this store; nobody else in
    // the organisation who could is left out.
    const members = await db.membership.findMany({
      where: { organisationId: a.org.organisationId, status: "ACTIVE" },
      include: { storeAccess: true },
    });
    for (const m of members) {
      const eligible =
        permissionsFor(m.role).has("order.read") &&
        (m.allStores || m.storeAccess.some((x) => x.storeId === s.storeId));
      expect(notified.has(m.userId)).toBe(eligible);
    }
    const detail = await getOrder(s, id);
    // A Test Provider order says so.
    expect(detail.testMode).toBe(true);
    expect(detail.payments.every((p) => p.testMode)).toBe(true);
    expect(rows[0]?.title).toBe(`New test order #${String(detail.number)}`);

    // The bell links straight to the order (not to its messages).
    const list = await staffNotifications(manager);
    const item = list.items.find((i) => i.title === rows[0]?.title);
    expect(item?.href).toBe(`/s/${toTypeId("store", s.storeId)}/orders/${id}`);
    expect((await staffNotifications(designer)).items).toHaveLength(0);
    expect(
      (await staffNotifications(elsewhere)).items.some((i) => i.title === rows[0]?.title),
    ).toBe(false);
    await db.staffNotification.deleteMany({ where: { orderId: internal(id) } });
  });

  it("a run leaves no order unannounced", async () => {
    await notifyStaffOfNewOrders(MEMBER_ROLES, 1000);
    const pending = await migratorDb().order.count({ where: { staffNotifiedAt: null } });
    expect(pending).toBe(0);
  });
});
