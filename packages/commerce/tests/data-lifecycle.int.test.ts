// Data lifecycle (M8): erasing a customer's personal data keeps every
// financial record intact, is scoped to one store, needs customer.manage
// and a recent password; the organisation export is owner-only, stepped
// up, limited, audited and carries no secrets.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { withTenant } from "@storevia/database";
import { requireOrganisationAccess, scopeOf } from "@storevia/tenancy";
import { parseTypeId, toTypeId } from "@storevia/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  connectTestPayments,
  createProduct,
  createShippingRate,
  createShippingZone,
  eraseCustomer,
  getCustomer,
  getProduct,
  listCustomers,
} from "../src";
import { exportOrganisationData } from "../src/data-export";
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
import { getCustomerOrder, sendCustomerOrderMessage } from "../src/orders/customer";
import { addToCart } from "../src/storefront";
import { expectCode, makeTenant, memberContext, steppedUp, storeOf, type Tenant } from "./fixtures";

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

async function placeOrder(store: CheckoutStore, key: string, email: string) {
  ip += 1;
  const clientIp = `198.51.100.${String(ip % 250)}`;
  const r = await addToCart(
    { store, token: null, clientIp },
    { variantId: variant[key], quantity: 1 },
  );
  const { token } = await startCheckout({ store, token: null, clientIp, cartToken: r.newToken });
  const req = { store, token, clientIp };
  await updateContact(req, { email });
  await updateAddress(req, {
    firstName: "Asha",
    lastName: "Rao",
    line1: "12 MG Road",
    city: "Bengaluru",
    countryCode: "IN",
    region: "KA",
    postalCode: "560001",
    phone: "+919876543210",
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
  const token2 = (done?.order?.accessPath ?? "").slice("/orders/view/".length);
  const order = await migratorDb().order.findFirstOrThrow({
    where: { storeId: store.storeId },
    orderBy: { orderNumber: "desc" },
  });
  return { orderId: order.id, token: token2 };
}

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("life-a");
  b = await makeTenant("life-b");
  storeA = checkoutStoreOf(a, "Store A");
  storeB = checkoutStoreOf(b, "Store B");
  for (const [tenant, key] of [
    [a, "lamp"],
    [b, "vase"],
  ] as const) {
    const s = storeOf(tenant);
    const { productId } = await createProduct(s, {
      title: key,
      price: "500",
      initialStock: 100,
      status: "ACTIVE",
    });
    variant[key] = (await getProduct(s, productId)).variants[0]?.id ?? "";
    const { zoneId } = await createShippingZone(s, { name: "India", countries: "IN" });
    await createShippingRate(s, zoneId, { name: "Standard", type: "FLAT", amount: "40" });
    await connectTestPayments(s);
  }
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
});

afterAll(disconnectTestClients);

const customerIdFor = async (storeId: string, email: string) =>
  (await migratorDb().customer.findFirstOrThrow({ where: { storeId, email } })).id;

describe("eraseCustomer", () => {
  it("erases personal data everywhere it is held and keeps the financial record", async () => {
    const email = "erase.me@example.test";
    const first = await placeOrder(storeA, "lamp", email);
    const second = await placeOrder(storeA, "lamp", email);
    const other = await placeOrder(storeA, "lamp", "keep.me@example.test");
    expect(
      await sendCustomerOrderMessage(
        { organisationId: storeA.organisationId, storeId: storeA.storeId },
        first.token,
        "Please leave it with my neighbour Asha at flat 4B",
        "203.0.113.50",
      ),
    ).toBe("sent");
    const db = migratorDb();
    const before = await db.order.findUniqueOrThrow({
      where: { id: first.orderId },
      include: { lines: true, payments: true },
    });
    const customerId = await customerIdFor(storeA.storeId, email);
    const publicCustomer = toTypeId("customer", customerId);

    const erased = await eraseCustomer(await steppedUp(storeOf(a)), publicCustomer);
    expect(erased).toMatchObject({ orders: 2, addresses: expect.any(Number) as number });

    // Personal data gone.
    const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(customer).toMatchObject({ email: null, phone: null, firstName: null, lastName: null });
    expect(customer.anonymisedAt).toBeInstanceOf(Date);
    for (const { orderId } of [first, second]) {
      const order = await db.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { addresses: true, messages: true, notifications: true, customerAccess: true },
      });
      expect(order.email).toBeNull();
      expect(order.phone).toBeNull();
      for (const address of order.addresses) {
        expect(address).toMatchObject({
          firstName: null,
          lastName: null,
          line1: "Removed",
          phone: null,
        });
        expect(address).toMatchObject({ countryCode: "IN", region: expect.any(String) as string });
        expect(address.postalCode).toBeNull();
      }
      for (const message of order.messages) expect(message.body).not.toContain("neighbour");
      for (const n of order.notifications) expect(n.recipient).toBe("removed");
      for (const link of order.customerAccess) expect(link.revokedAt).toBeInstanceOf(Date);
      const checkout = await db.checkout.findFirstOrThrow({ where: { completedOrderId: orderId } });
      expect(checkout).toMatchObject({ email: null, shippingAddress: null, billingAddress: null });
    }
    expect(
      JSON.stringify(
        await db.order.findMany({ where: { id: { in: [first.orderId, second.orderId] } } }),
        (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
      ),
    ).not.toContain(email);

    // The financial record is untouched.
    const after = await db.order.findUniqueOrThrow({
      where: { id: first.orderId },
      include: { lines: true, payments: true },
    });
    for (const key of [
      "orderNumber",
      "totalAmount",
      "subtotalAmount",
      "taxAmount",
      "shippingAmount",
      "currency",
      "placedAt",
      "paymentStatus",
    ] as const)
      expect(after[key]).toEqual(before[key]);
    expect(after.lines).toEqual(before.lines);
    expect(after.payments.map((p) => [p.amount, p.capturedAmount, p.status])).toEqual(
      before.payments.map((p) => [p.amount, p.capturedAmount, p.status]),
    );

    // The shopper's old link opens nothing; the merchant no longer sees them.
    expect(
      await getCustomerOrder(
        { organisationId: storeA.organisationId, storeId: storeA.storeId },
        first.token,
      ),
    ).toBeNull();
    await expectCode(getCustomer(storeOf(a), publicCustomer), "NOT_FOUND");
    expect((await listCustomers(storeOf(a))).items.some((c) => c.id === publicCustomer)).toBe(
      false,
    );

    // Another customer's order is untouched.
    const kept = await db.order.findUniqueOrThrow({
      where: { id: other.orderId },
      include: { addresses: true },
    });
    expect(kept.email).toBe("keep.me@example.test");
    expect(kept.addresses[0]?.line1).toBe("12 MG Road");

    // Audited without the email.
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "customer.erased", entityId: customerId },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(email);
  });

  it("is idempotent and can't be repeated into another customer's data", async () => {
    const email = "twice@example.test";
    await placeOrder(storeA, "lamp", email);
    const id = toTypeId("customer", await customerIdFor(storeA.storeId, email));
    await eraseCustomer(await steppedUp(storeOf(a)), id);
    const again = await eraseCustomer(await steppedUp(storeOf(a)), id);
    expect(again.orders).toBe(0);
  });

  it("needs a recent password, customer.manage and the customer's own store", async () => {
    const email = "guarded@example.test";
    await placeOrder(storeA, "lamp", email);
    const id = toTypeId("customer", await customerIdFor(storeA.storeId, email));
    await expectCode(eraseCustomer(storeOf(a), id), "REAUTHENTICATION_REQUIRED");
    const viewer = await memberContext(a, "VIEWER", storeOf(a));
    await expectCode(eraseCustomer(await steppedUp(viewer), id), "FORBIDDEN");
    await expectCode(eraseCustomer(await steppedUp(storeOf(b)), id), "NOT_FOUND");
    const still = await migratorDb().customer.findFirstOrThrow({
      where: {
        storeId: storeA.storeId,
        anonymisedAt: null,
        orders: { some: {} },
        id: parseTypeId("customer", id) ?? "",
      },
    });
    expect(still.email).toBe(email);
  });

  it("financial columns stay immutable, and app roles can't use the erasure switch", async () => {
    const { orderId } = await placeOrder(storeB, "vase", "immutable@example.test");
    const db = migratorDb();
    // Even the owner role can't change amounts, erasure switch or not.
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.erasing_personal_data', 'on', true)`;
        await tx.$executeRaw`UPDATE "Order" SET "totalAmount" = 1 WHERE id = ${orderId}::uuid`;
      }),
    ).rejects.toThrow(/immutable|check/i);
    // Without the switch, emails are immutable too.
    await expect(
      db.$executeRaw`UPDATE "Order" SET email = 'x@example.test' WHERE id = ${orderId}::uuid`,
    ).rejects.toThrow(/immutable/);
    // The merchant's role holds no UPDATE on personal snapshot columns.
    await expect(
      withTenant(scopeOf(storeOf(b)), async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.erasing_personal_data', 'on', true)`;
        await tx.$executeRaw`UPDATE "Order" SET email = NULL WHERE id = ${orderId}::uuid`;
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(
        scopeOf(storeOf(b)),
        (tx) =>
          tx.$executeRaw`UPDATE "OrderAddress" SET line1 = 'x' WHERE "orderId" = ${orderId}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).email).toBe(
      "immutable@example.test",
    );
  });
});

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

describe("exportOrganisationData", () => {
  it("exports every store's data as valid JSON without secrets", async () => {
    await placeOrder(storeB, "vase", "export.me@example.test");
    const owner = await requireOrganisationAccess(
      { ...b.owner, recentlyAuthenticated: true },
      toTypeId("organisation", b.org.organisationId),
    );
    const text = await collect(await exportOrganisationData(owner));
    const doc = JSON.parse(text) as {
      format: string;
      version: number;
      organisation: { id: string };
      members: { user: { email: string } }[];
      stores: Record<string, unknown[]>[];
    };
    expect(doc).toMatchObject({ format: "storevia-export", version: 1 });
    expect(doc.organisation.id).toBe(b.org.organisationId);
    expect(doc.members.map((m) => m.user.email)).toContain(b.owner.email);
    const store = doc.stores[0] ?? {};
    for (const key of [
      "products",
      "variants",
      "customers",
      "orders",
      "orderLines",
      "payments",
      "domains",
      "themes",
    ])
      expect(Array.isArray(store[key])).toBe(true);
    expect((store["orders"] ?? []).length).toBeGreaterThan(0);
    expect(text).toContain("export.me@example.test");
    // Nothing from another organisation, no secrets or internal keys.
    expect(text).not.toContain(a.org.organisationId);
    for (const secret of [
      "credentialsCiphertext",
      "verificationToken",
      "tokenHash",
      "idempotencyKey",
      "storageKey",
      "providerRef",
    ])
      expect(text).not.toContain(secret);
    const audit = await migratorDb().auditLog.count({
      where: { organisationId: b.org.organisationId, action: "organisation.exported" },
    });
    expect(audit).toBe(1);
  });

  it("is owner-only, needs a recent password and is limited", async () => {
    const orgId = toTypeId("organisation", a.org.organisationId);
    await expectCode(exportOrganisationData(a.org), "REAUTHENTICATION_REQUIRED");
    const admin = await memberContext(a, "ADMIN", storeOf(a));
    const adminOrg = await requireOrganisationAccess(
      { ...admin.principal, recentlyAuthenticated: true },
      orgId,
    );
    await expectCode(exportOrganisationData(adminOrg), "FORBIDDEN");
    const owner = await requireOrganisationAccess(
      { ...a.owner, recentlyAuthenticated: true },
      orgId,
    );
    for (let i = 0; i < 3; i += 1) await collect(await exportOrganisationData(owner));
    await expectCode(exportOrganisationData(owner), "RATE_LIMITED");
  });
});
