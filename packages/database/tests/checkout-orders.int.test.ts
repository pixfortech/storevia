// Database-layer guarantees for checkout, orders and payments (ADR-0031,
// migration 20261201000000): the checkout role sees one store and one
// checkout (and the customer with that checkout's email), never lists
// orders, customers or payments, and has no access to Store itself; the
// storefront role has no access at all; the merchant role is tenant-scoped
// and can't change commercial snapshots; snapshots are immutable for every
// role; references stay in their store; amounts, currencies and states are
// bounded by constraints; order numbers are allocated without races.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectTestClients, truncateAll } from "../src/testing";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const hash = (n: number) => n.toString(16).padStart(64, "0");
const ORG_A = uuid(0xa1);
const ORG_B = uuid(0xb1);
const STORE_A = uuid(0x101);
const STORE_A2 = uuid(0x102);
const STORE_B = uuid(0x103);
const CART_A = uuid(0x201);
const CART_B = uuid(0x202);
const CHECKOUT_A = uuid(0x301);
const CHECKOUT_A_OTHER = uuid(0x302);
const CHECKOUT_B = uuid(0x303);
const CUSTOMER_A = uuid(0x401);
const CUSTOMER_A_OTHER = uuid(0x402);
const CUSTOMER_B = uuid(0x403);
const ORDER_A = uuid(0x501);
const ORDER_A_OTHER = uuid(0x502);
const ORDER_B = uuid(0x503);
const CONNECTION_A = uuid(0x601);
const CONNECTION_B = uuid(0x602);

let admin: pg.Client; // migrator: arranges fixtures
let checkout: pg.Client; // storevia_checkout
let storefront: pg.Client; // storevia_storefront
let app: pg.Client; // storevia_app

interface Scope {
  readonly org?: string;
  readonly store?: string;
  readonly checkout?: string;
  readonly checkoutToken?: string;
  readonly cartToken?: string;
}

function connect(key: string): pg.Client {
  const url = process.env[key];
  if (!url) throw new Error(`${key} is not set`);
  return new pg.Client({ connectionString: url });
}

async function scoped<T>(client: pg.Client, scope: Scope, fn: (c: pg.Client) => Promise<T>) {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true),
              set_config('app.checkout_id', $3, true), set_config('app.checkout_token', $4, true),
              set_config('app.cart_token', $5, true)`,
      [
        scope.org ?? "",
        scope.store ?? "",
        scope.checkout ?? "",
        scope.checkoutToken ?? "",
        scope.cartToken ?? "",
      ],
    );
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function code(client: pg.Client, scope: Scope, sql: string, params: unknown[] = []) {
  return scoped(client, scope, async (c) => {
    try {
      await c.query(sql, params);
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? "unknown";
    }
  });
}

const rows = async <T extends pg.QueryResultRow>(
  client: pg.Client,
  scope: Scope,
  sql: string,
  params: unknown[] = [],
) => scoped(client, scope, async (c) => (await c.query<T>(sql, params)).rows);

const A = { org: ORG_A, store: STORE_A };
const B = { org: ORG_B, store: STORE_B };
const A_CHECKOUT = { ...A, checkout: CHECKOUT_A };

async function insertStore(id: string, org: string, slug: string) {
  await admin.query(
    `INSERT INTO "Store" (id, "organisationId", name, slug, status, "businessType", currency, locale, timezone, country, "updatedAt")
     VALUES ($1, $2, $3, $3, 'ACTIVE', 'ECOMMERCE', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`,
    [id, org, slug],
  );
}

async function insertCheckout(
  id: string,
  org: string,
  store: string,
  cart: string,
  n: number,
  email: string,
) {
  await admin.query(
    `INSERT INTO "Checkout" (id, "organisationId", "storeId", "cartId", "tokenHash", email, currency, "expiresAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, 'INR', now() + interval '1 hour', now())`,
    [id, org, store, cart, hash(n), email],
  );
}

async function insertCustomer(id: string, org: string, store: string, email: string) {
  await admin.query(
    `INSERT INTO "Customer" (id, "organisationId", "storeId", email, "updatedAt") VALUES ($1, $2, $3, $4, now())`,
    [id, org, store, email],
  );
}

/** A paid order of 2 × 500.00 with 50.00 shipping and 18% exclusive tax on goods. */
async function insertOrder(
  id: string,
  org: string,
  store: string,
  checkoutId: string,
  number: number,
) {
  await admin.query(
    `INSERT INTO "Order" (id, "organisationId", "storeId", "orderNumber", "checkoutId", email, currency,
       "pricesIncludeTax", "subtotalAmount", "discountAmount", "shippingAmount", "taxAmount", "totalAmount",
       "paymentStatus", "placedAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'shopper@example.com', 'INR', false, 100000, 0, 5000, 18000, 123000,
       'PAID', now(), now())`,
    [id, org, store, number, checkoutId],
  );
  await admin.query(
    `INSERT INTO "OrderLine" (id, "organisationId", "storeId", "orderId", "productTitle", currency,
       "unitPriceAmount", quantity, "taxAmount", "totalAmount", "requiresShipping", taxable)
     VALUES (gen_random_uuid(), $1, $2, $3, 'Mug', 'INR', 50000, 2, 18000, 100000, true, true)`,
    [org, store, id],
  );
  await admin.query(
    `INSERT INTO "OrderAddress" (id, "organisationId", "storeId", "orderId", type, line1, "countryCode")
     VALUES (gen_random_uuid(), $1, $2, $3, 'SHIPPING', '1 MG Road', 'IN')`,
    [org, store, id],
  );
}

beforeAll(async () => {
  await truncateAll();
  admin = connect("DATABASE_MIGRATOR_URL");
  checkout = connect("DATABASE_CHECKOUT_URL");
  storefront = connect("DATABASE_STOREFRONT_URL");
  app = connect("DATABASE_URL");
  await Promise.all([admin.connect(), checkout.connect(), storefront.connect(), app.connect()]);
  await admin.query(
    `INSERT INTO "Organisation" (id, name, "updatedAt") VALUES ($1, 'Org A', now()), ($2, 'Org B', now())`,
    [ORG_A, ORG_B],
  );
  await insertStore(STORE_A, ORG_A, "shop-a");
  await insertStore(STORE_A2, ORG_A, "shop-a2");
  await insertStore(STORE_B, ORG_B, "shop-b");
  for (const [id, org, store, n] of [
    [CART_A, ORG_A, STORE_A, 1],
    [CART_B, ORG_B, STORE_B, 2],
  ] as const) {
    await admin.query(
      `INSERT INTO "Cart" (id, "organisationId", "storeId", "tokenHash", currency, "expiresAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'INR', now() + interval '30 days', now())`,
      [id, org, store, hash(n)],
    );
  }
  await insertCheckout(CHECKOUT_A, ORG_A, STORE_A, CART_A, 11, "Shopper@Example.com");
  await insertCheckout(CHECKOUT_A_OTHER, ORG_A, STORE_A, CART_A, 12, "other@example.com");
  await insertCheckout(CHECKOUT_B, ORG_B, STORE_B, CART_B, 13, "shopper@example.com");
  await insertCustomer(CUSTOMER_A, ORG_A, STORE_A, "shopper@example.com");
  await insertCustomer(CUSTOMER_A_OTHER, ORG_A, STORE_A, "other@example.com");
  await insertCustomer(CUSTOMER_B, ORG_B, STORE_B, "shopper@example.com");
  await insertOrder(ORDER_A, ORG_A, STORE_A, CHECKOUT_A, 1001);
  await insertOrder(ORDER_A_OTHER, ORG_A, STORE_A, CHECKOUT_A_OTHER, 1002);
  await insertOrder(ORDER_B, ORG_B, STORE_B, CHECKOUT_B, 1001);
  for (const [id, org, store] of [
    [CONNECTION_A, ORG_A, STORE_A],
    [CONNECTION_B, ORG_B, STORE_B],
  ] as const) {
    await admin.query(
      `INSERT INTO "PaymentProviderConnection" (id, "organisationId", "storeId", provider, mode, status, "updatedAt")
       VALUES ($1, $2, $3, 'storevia-test', 'TEST', 'ACTIVE', now())`,
      [id, org, store],
    );
  }
  for (const [checkoutId, org, store, conn, ref] of [
    [CHECKOUT_A, ORG_A, STORE_A, CONNECTION_A, "ref-a"],
    [CHECKOUT_A_OTHER, ORG_A, STORE_A, CONNECTION_A, "ref-a-other"],
    [CHECKOUT_B, ORG_B, STORE_B, CONNECTION_B, "ref-b"],
  ] as const) {
    await admin.query(
      `INSERT INTO "Payment" (id, "organisationId", "storeId", "connectionId", "checkoutId", provider,
         "providerPaymentId", status, currency, amount, "idempotencyKey", "expiresAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'storevia-test', $5, 'FAILED', 'INR', 123000, $6,
         now() + interval '15 minutes', now())`,
      [org, store, conn, checkoutId, ref, `key-${ref}-1`],
    );
  }
});

afterAll(async () => {
  await Promise.all([admin.end(), checkout.end(), storefront.end(), app.end()]);
  await disconnectTestClients();
});

describe("the checkout role sees one store and one checkout", () => {
  it("finds a checkout only by its token hash or verified id, in its own store", async () => {
    expect(await rows(checkout, A, `SELECT id FROM "Checkout"`)).toEqual([]);
    expect(
      await rows(checkout, { ...A, checkoutToken: hash(11) }, `SELECT id FROM "Checkout"`),
    ).toEqual([{ id: CHECKOUT_A }]);
    expect(await rows(checkout, A_CHECKOUT, `SELECT id FROM "Checkout"`)).toEqual([
      { id: CHECKOUT_A },
    ]);
    // Another store's token or id, even when named explicitly, is nothing.
    expect(
      await rows(checkout, { ...A, checkoutToken: hash(13) }, `SELECT id FROM "Checkout"`),
    ).toEqual([]);
    expect(
      await rows(checkout, { ...A, checkout: CHECKOUT_B }, `SELECT id FROM "Checkout"`),
    ).toEqual([]);
  });

  it("finds the cart only by its token hash, or through its checkout", async () => {
    expect(await rows(checkout, A, `SELECT id FROM "Cart"`)).toEqual([]);
    expect(await rows(checkout, { ...A, cartToken: hash(1) }, `SELECT id FROM "Cart"`)).toEqual([
      { id: CART_A },
    ]);
    expect(await rows(checkout, A_CHECKOUT, `SELECT id FROM "Cart"`)).toEqual([{ id: CART_A }]);
    expect(await rows(checkout, { ...A, cartToken: hash(2) }, `SELECT id FROM "Cart"`)).toEqual([]);
  });

  it("sees its checkout's order, payments and customer, and never lists the others", async () => {
    expect(await rows(checkout, A_CHECKOUT, `SELECT id FROM "Order"`)).toEqual([{ id: ORDER_A }]);
    expect(await rows(checkout, A_CHECKOUT, `SELECT count(*)::int AS n FROM "OrderLine"`)).toEqual([
      { n: 1 },
    ]);
    expect(
      await rows(checkout, A_CHECKOUT, `SELECT "providerPaymentId" AS ref FROM "Payment"`),
    ).toEqual([{ ref: "ref-a" }]);
    // The customer with this checkout's email (case-insensitively), no other.
    expect(await rows(checkout, A_CHECKOUT, `SELECT id FROM "Customer"`)).toEqual([
      { id: CUSTOMER_A },
    ]);
    // Without a verified checkout: nothing at all.
    for (const table of ["Order", "OrderLine", "Payment", "Customer", "OrderAddress"]) {
      expect(await rows(checkout, A, `SELECT 1 FROM "${table}"`), table).toEqual([]);
    }
  });

  it("can't create a customer or order for another checkout, or read stock movements or Store", async () => {
    expect(
      await code(
        checkout,
        A_CHECKOUT,
        `INSERT INTO "Customer" (id, "organisationId", "storeId", email, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'someone.else@example.com', now())`,
        [ORG_A, STORE_A],
      ),
    ).toBe("42501");
    expect(
      await code(
        checkout,
        A_CHECKOUT,
        `INSERT INTO "Order" (id, "organisationId", "storeId", "orderNumber", "checkoutId", currency,
           "pricesIncludeTax", "subtotalAmount", "discountAmount", "shippingAmount", "taxAmount",
           "totalAmount", "placedAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 1500, $3, 'INR', false, 0, 0, 0, 0, 0, now(), now())`,
        [ORG_A, STORE_A, CHECKOUT_A_OTHER],
      ),
    ).toBe("42501");
    // Stock movements are insert-only for checkout: it can't read the ledger.
    expect(await code(checkout, A_CHECKOUT, `SELECT 1 FROM "InventoryMovement"`)).toBe("42501");
    expect(await code(checkout, A_CHECKOUT, `SELECT name FROM "Store"`)).toBe("42501");
    expect(await code(checkout, A_CHECKOUT, `SELECT 1 FROM "AuditLog"`)).toBe("42501");
  });

  it("can't touch another store even inside its own organisation", async () => {
    const scope = { org: ORG_A, store: STORE_A2, checkout: CHECKOUT_A };
    expect(await rows(checkout, scope, `SELECT id FROM "Checkout"`)).toEqual([]);
    expect(await rows(checkout, scope, `SELECT id FROM "Order"`)).toEqual([]);
    expect(await rows(checkout, scope, `SELECT id FROM "PaymentProviderConnection"`)).toEqual([]);
  });

  it("resolves a payment reference only within the current store", async () => {
    expect(
      await rows(checkout, A, `SELECT app_checkout_for_payment('storevia-test', 'ref-a') AS id`),
    ).toEqual([{ id: CHECKOUT_A }]);
    expect(
      await rows(checkout, A, `SELECT app_checkout_for_payment('storevia-test', 'ref-b') AS id`),
    ).toEqual([{ id: null }]);
    expect(
      await rows(checkout, {}, `SELECT store_id FROM app_payment_connection_scope($1)`, [
        CONNECTION_B,
      ]),
    ).toEqual([{ store_id: STORE_B }]);
  });
});

describe("the storefront role has no access to transactional data", () => {
  it("is refused on every M6 table", async () => {
    for (const table of [
      "Checkout",
      "Customer",
      "Order",
      "OrderLine",
      "OrderAddress",
      "Payment",
      "PaymentProviderConnection",
      "Refund",
      "Fulfilment",
      "Discount",
      "ShippingRate",
      "TaxRate",
      "InventoryReservation",
    ]) {
      expect(await code(storefront, A, `SELECT 1 FROM "${table}"`), table).toBe("42501");
    }
  });
});

describe("the merchant role", () => {
  it("reads only its own store's orders, customers and payments", async () => {
    const orders = await rows<{ id: string }>(
      app,
      A,
      `SELECT id FROM "Order" ORDER BY "orderNumber"`,
    );
    expect(orders.map((o) => o.id)).toEqual([ORDER_A, ORDER_A_OTHER]);
    expect(await rows(app, { org: ORG_A, store: STORE_A2 }, `SELECT id FROM "Order"`)).toEqual([]);
    expect(await rows(app, A, `SELECT id FROM "Order" WHERE id = $1`, [ORDER_B])).toEqual([]);
    expect(await rows(app, A, `SELECT id FROM "Customer" WHERE id = $1`, [CUSTOMER_B])).toEqual([]);
    expect(await code(app, A, `SELECT 1 FROM "Checkout"`)).toBe("42501");
    expect(await rows(app, B, `SELECT id FROM "Order"`)).toEqual([{ id: ORDER_B }]);
  });

  it("changes order state but never commercial snapshots", async () => {
    expect(
      await code(app, A, `UPDATE "Order" SET "fulfilmentStatus" = 'FULFILLED' WHERE id = $1`, [
        ORDER_A,
      ]),
    ).toBeNull();
    for (const sql of [
      `UPDATE "Order" SET "totalAmount" = 1 WHERE id = $1`,
      `UPDATE "Order" SET email = 'x@example.com' WHERE id = $1`,
      `UPDATE "OrderLine" SET "unitPriceAmount" = 1 WHERE "orderId" = $1`,
      `UPDATE "OrderAddress" SET line1 = 'Elsewhere' WHERE "orderId" = $1`,
      `DELETE FROM "OrderLine" WHERE "orderId" = $1`,
      `DELETE FROM "Order" WHERE id = $1`,
    ]) {
      expect(await code(app, A, sql, [ORDER_A]), sql).toBe("42501");
    }
    // Another store's order is simply not there.
    const changed = await scoped(
      app,
      A,
      async (c) =>
        (await c.query(`UPDATE "Order" SET note = 'x' WHERE id = $1`, [ORDER_B])).rowCount,
    );
    expect(changed).toBe(0);
  });
});

describe("commercial history is immutable for every role", () => {
  it("refuses snapshot changes even from the schema owner", async () => {
    for (const sql of [
      `UPDATE "Order" SET "totalAmount" = 1 WHERE id = $1`,
      `UPDATE "Order" SET "orderNumber" = 9999 WHERE id = $1`,
      `UPDATE "OrderLine" SET quantity = 1 WHERE "orderId" = $1`,
      `UPDATE "OrderAddress" SET line1 = 'x' WHERE "orderId" = $1`,
      `DELETE FROM "OrderAddress" WHERE "orderId" = $1`,
    ]) {
      expect(await code(admin, {}, sql, [ORDER_A]), sql).toBe("23514");
    }
  });

  it("keeps order totals, refunds and fulfilment within bounds", async () => {
    expect(
      await code(admin, {}, `UPDATE "Order" SET "refundedAmount" = 123001 WHERE id = $1`, [
        ORDER_A,
      ]),
    ).toBe("23514");
    expect(
      await code(admin, {}, `UPDATE "OrderLine" SET "fulfilledQuantity" = 3 WHERE "orderId" = $1`, [
        ORDER_A,
      ]),
    ).toBe("23514");
    expect(
      await code(admin, {}, `UPDATE "Order" SET status = 'CANCELLED' WHERE id = $1`, [ORDER_A]),
    ).toBe("23514");
    // A total that doesn't add up is refused at insert.
    expect(
      await code(
        admin,
        {},
        `INSERT INTO "Order" (id, "organisationId", "storeId", "orderNumber", currency,
           "pricesIncludeTax", "subtotalAmount", "discountAmount", "shippingAmount", "taxAmount",
           "totalAmount", "placedAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 1999, 'INR', false, 1000, 0, 0, 180, 1000, now(), now())`,
        [ORG_A, STORE_A],
      ),
    ).toBe("23514");
  });
});

describe("references, currencies and uniqueness", () => {
  it("refuses a reference to another store's row", async () => {
    expect(
      await code(admin, {}, `UPDATE "Checkout" SET "customerId" = $1 WHERE id = $2`, [
        CUSTOMER_B,
        CHECKOUT_A,
      ]),
    ).toBe("23503");
    expect(
      await code(
        admin,
        {},
        `INSERT INTO "Payment" (id, "organisationId", "storeId", "connectionId", "checkoutId",
           provider, currency, amount, "idempotencyKey", "expiresAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'storevia-test', 'INR', 100, 'key-cross-store',
           now(), now())`,
        [ORG_A, STORE_A, CONNECTION_A, CHECKOUT_B],
      ),
    ).toBe("23503");
  });

  it("refuses a currency other than the store's", async () => {
    expect(
      await code(
        admin,
        {},
        `INSERT INTO "Checkout" (id, "organisationId", "storeId", "cartId", "tokenHash", currency, "expiresAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'USD', now(), now())`,
        [ORG_A, STORE_A, CART_A, hash(99)],
      ),
    ).toBe("23514");
  });

  it("keeps one customer per store and email, case-insensitively", async () => {
    expect(
      await code(
        admin,
        {},
        `INSERT INTO "Customer" (id, "organisationId", "storeId", email, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'SHOPPER@example.com', now())`,
        [ORG_A, STORE_A],
      ),
    ).toBe("23505");
  });

  it("allows one pending payment per checkout and one active connection per store", async () => {
    const pending = (key: string) =>
      `INSERT INTO "Payment" (id, "organisationId", "storeId", "connectionId", "checkoutId", provider,
         currency, amount, "idempotencyKey", "expiresAt", "updatedAt")
       VALUES (gen_random_uuid(), '${ORG_A}', '${STORE_A}', '${CONNECTION_A}', '${CHECKOUT_A}',
         'storevia-test', 'INR', 100, '${key}', now(), now())`;
    expect(
      await scoped(admin, {}, async (c) => {
        await c.query(pending("key-pending-1"));
        try {
          await c.query(pending("key-pending-2"));
          return null;
        } catch (error) {
          return (error as { code?: string }).code;
        }
      }),
    ).toBe("23505");
    expect(
      await code(
        admin,
        {},
        `INSERT INTO "PaymentProviderConnection" (id, "organisationId", "storeId", provider, mode, status, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'razorpay', 'TEST', 'ACTIVE', now())`,
        [ORG_A, STORE_A],
      ),
    ).toBe("23505");
  });

  it("scopes webhook event ids per store", async () => {
    const insert = (org: string, store: string) =>
      admin.query(
        `INSERT INTO "PaymentWebhookEvent" (id, "organisationId", "storeId", provider, "providerEventId", type, payload)
         VALUES (gen_random_uuid(), $1, $2, 'razorpay', 'evt_shared', 'payment.captured', '{}')`,
        [org, store],
      );
    await insert(ORG_A, STORE_A);
    await insert(ORG_B, STORE_B);
    await expect(insert(ORG_A, STORE_A)).rejects.toMatchObject({ code: "23505" });
  });

  it("allows code discounts over the whole order with a sane value", async () => {
    const discount = (values: string) =>
      code(
        admin,
        {},
        `INSERT INTO "Discount" (id, "organisationId", "storeId", title, type, method, "percentageBps",
           amount, currency, "startsAt", "usageLimit", "usageCount", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 'Sale', ${values}, now())`,
        [ORG_A, STORE_A],
      );
    expect(await discount(`'PERCENTAGE', 'CODE', 1000, NULL, NULL, now(), 10, 0`)).toBe(null);
    expect(await discount(`'PERCENTAGE', 'CODE', 10001, NULL, NULL, now(), 10, 0`)).toBe("23514");
    expect(await discount(`'FIXED_AMOUNT', 'CODE', NULL, 500, 'USD', now(), 10, 0`)).toBe("23514");
    expect(await discount(`'PERCENTAGE', 'AUTOMATIC', 1000, NULL, NULL, now(), 10, 0`)).toBe(
      "23514",
    );
    // More uses than the limit is impossible.
    expect(await discount(`'PERCENTAGE', 'CODE', 1000, NULL, NULL, now(), 1, 2`)).toBe("23514");
  });
});

describe("order numbers", () => {
  it("are allocated per store, never twice, even concurrently", async () => {
    const clients = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const c = connect("DATABASE_CHECKOUT_URL");
        await c.connect();
        return c;
      }),
    );
    try {
      const numbers = await Promise.all(
        clients.map(async (c) => {
          await c.query("BEGIN");
          await c.query(
            `SELECT set_config('app.organisation_id', $1, true), set_config('app.store_id', $2, true)`,
            [ORG_B, STORE_B],
          );
          const n = (await c.query<{ n: number }>(`SELECT app_next_order_number() AS n`)).rows[0]
            ?.n;
          await c.query("COMMIT");
          return n;
        }),
      );
      expect(new Set(numbers).size).toBe(5);
      const next = await admin.query<{ n: number }>(
        `SELECT "nextOrderNumber" AS n FROM "Store" WHERE id = $1`,
        [STORE_B],
      );
      expect(next.rows[0]?.n).toBe(1006);
      // Without a store scope, nothing is allocated.
      expect(await rows(checkout, {}, `SELECT app_next_order_number() AS n`)).toEqual([
        { n: null },
      ]);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });
});
