// Order CSV export (Phase 2A): the list's own filters plus a date range in
// the store's timezone, exact amounts, formula-safe cells, keyset-paged
// batches, `order.read`, tenancy and an audit entry without personal data.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { requireStoreAccess } from "@storevia/tenancy";
import { toTypeId, uuidv7 } from "@storevia/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exportOrders, listOrders, ORDER_EXPORT_COLUMNS, type OrderExportQuery } from "../src";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

let a: Tenant;
let b: Tenant;
const ids: string[] = [];

interface Seed {
  readonly number: number;
  readonly placedAt: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly total?: bigint;
  readonly refunded?: bigint;
  readonly testMode?: boolean;
  readonly archived?: boolean;
  readonly cancelled?: boolean;
  readonly quantity?: number;
  readonly billingOnly?: boolean;
}

/** An order row as checkout would have written it (amounts in paise). */
async function seedOrder(tenant: Tenant, seed: Seed): Promise<string> {
  const store = storeOf(tenant);
  const db = migratorDb();
  const id = uuidv7();
  const total = seed.total ?? 118_000n;
  await db.order.create({
    data: {
      id,
      organisationId: store.organisationId,
      storeId: store.storeId,
      orderNumber: seed.number,
      email: seed.email ?? `buyer${String(seed.number)}@example.test`,
      currency: "INR",
      pricesIncludeTax: false,
      subtotalAmount: 100_000n,
      discountAmount: 5_000n,
      shippingAmount: 5_000n,
      taxAmount: 18_000n,
      totalAmount: total,
      refundedAmount: seed.refunded ?? 0n,
      status: seed.cancelled ? "CANCELLED" : "OPEN",
      paymentStatus: seed.refunded ? "PARTIALLY_REFUNDED" : "PAID",
      fulfilmentStatus: "UNFULFILLED",
      testMode: seed.testMode ?? false,
      placedAt: new Date(seed.placedAt),
      archivedAt: seed.archived ? new Date(seed.placedAt) : null,
      ...(seed.cancelled ? { cancelledAt: new Date(seed.placedAt) } : {}),
    },
  });
  await db.orderAddress.create({
    data: {
      organisationId: store.organisationId,
      storeId: store.storeId,
      orderId: id,
      type: seed.billingOnly ? "BILLING" : "SHIPPING",
      firstName: seed.firstName ?? "Asha",
      lastName: seed.lastName ?? "Rao",
      line1: "4 Park Street",
      city: "Kolkata",
      countryCode: "IN",
    },
  });
  await db.orderLine.create({
    data: {
      organisationId: store.organisationId,
      storeId: store.storeId,
      orderId: id,
      productTitle: "Mug",
      currency: "INR",
      unitPriceAmount: 50_000n,
      quantity: seed.quantity ?? 2,
      totalAmount: 100_000n,
      requiresShipping: true,
      taxable: true,
    },
  });
  ids.push(id);
  return id;
}

async function csv(query: OrderExportQuery = {}, batchSize?: number, tenant = a) {
  const file = await exportOrders(storeOf(tenant), query, batchSize ? { batchSize } : {});
  const chunks: string[] = [];
  for await (const chunk of file.chunks) chunks.push(chunk);
  const text = chunks.join("");
  const lines = text.split("\r\n").filter((l) => l !== "");
  return { file, text, chunks, header: lines[0] ?? "", rows: lines.slice(1) };
}

const numbers = (rows: readonly string[]) => rows.map((r) => r.split(",")[0]);

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("oexp-a");
  b = await makeTenant("oexp-b");
  // Asia/Kolkata is UTC+05:30.
  await seedOrder(a, {
    number: 1001,
    placedAt: "2026-09-01T10:00:00Z",
    firstName: "Meera",
    lastName: "Iyer",
    email: "meera@example.test",
    total: 118_000n,
    refunded: 18_000n,
  });
  // 00:30 on 2 September in the store's timezone (still 1 September in UTC).
  await seedOrder(a, { number: 1002, placedAt: "2026-09-01T19:00:00Z", testMode: true });
  await seedOrder(a, {
    number: 1003,
    placedAt: "2026-09-03T06:00:00Z",
    firstName: '=HYPERLINK("http://evil.test","click")',
    lastName: "",
    email: "+evil@example.test",
  });
  await seedOrder(a, { number: 1004, placedAt: "2026-09-04T06:00:00Z", archived: true });
  await seedOrder(a, {
    number: 1005,
    placedAt: "2026-09-05T06:00:00Z",
    cancelled: true,
    billingOnly: true,
    firstName: "Dev",
    lastName: "Shah",
  });
  await seedOrder(b, { number: 1001, placedAt: "2026-09-02T06:00:00Z", email: "b@example.test" });
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
});

afterAll(disconnectTestClients);

describe("exportOrders", () => {
  it("writes a BOM, the columns and one row per order, newest first, with exact amounts", async () => {
    const { file, text, header, rows } = await csv();
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(header).toBe(`\uFEFF${ORDER_EXPORT_COLUMNS.join(",")}`);
    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(file.filename).toMatch(
      new RegExp(`^orders-${storeOf(a).storeSlug}-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    );
    // Archived orders leave the default list, as they do on the page.
    expect(numbers(rows)).toEqual(["#1005", "#1003", "#1002", "#1001"]);
    expect(file.rows).toBe(4);
    const first = rows.at(-1)?.split(",");
    expect(first).toEqual([
      "#1001",
      "2026-09-01 15:30:00 +05:30",
      "Open",
      "Partially refunded",
      "Unfulfilled",
      "no",
      "Meera Iyer",
      "meera@example.test",
      "2",
      "INR",
      "1000.00",
      "50.00",
      "50.00",
      "180.00",
      "1180.00",
      "180.00",
      "1000.00",
    ]);
    const test = rows.find((r) => r.startsWith("#1002,"))?.split(",");
    expect(test?.[1]).toBe("2026-09-02 00:30:00 +05:30");
    expect(test?.[5]).toBe("yes");
    // A billing-only name is used when there's no shipping address.
    const cancelled = rows.find((r) => r.startsWith("#1005,"))?.split(",");
    expect(cancelled?.slice(2, 7)).toEqual(["Cancelled", "Paid", "Unfulfilled", "no", "Dev Shah"]);
    // No internal ids anywhere.
    for (const id of ids) expect(text).not.toContain(id);
    expect(text).not.toMatch(/order_[0-9a-z]{26}/);
  });

  it("neutralises cells a spreadsheet would run as formulas", async () => {
    const { rows } = await csv({ q: "#1003" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(`"'=HYPERLINK(""http://evil.test"",""click"")"`);
    expect(rows[0]).toContain(",'+evil@example.test,");
  });

  it("uses the list's status tabs and search", async () => {
    expect(numbers((await csv({ status: "test" })).rows)).toEqual(["#1002"]);
    expect(numbers((await csv({ status: "archived" })).rows)).toEqual(["#1004"]);
    expect(numbers((await csv({ status: "cancelled" })).rows)).toEqual(["#1005"]);
    // A search reaches archived orders too, as on the page.
    expect(numbers((await csv({ q: "1004" })).rows)).toEqual(["#1004"]);
    expect(numbers((await csv({ q: "meera@" })).rows)).toEqual(["#1001"]);
    expect(numbers((await csv({ status: "nonsense" })).rows)).toHaveLength(4);
    // The same orders the list shows, for every tab.
    for (const status of ["all", "test", "archived", "cancelled", "unpaid", "open"]) {
      const list = await listOrders(storeOf(a), { status }, 100);
      expect(numbers((await csv({ status })).rows), status).toEqual(
        list.items.map((o) => `#${String(o.number)}`),
      );
    }
  });

  it("limits to a date range in the store's timezone, both ends inclusive", async () => {
    expect(numbers((await csv({ from: "2026-09-02", to: "2026-09-03" })).rows)).toEqual([
      "#1003",
      "#1002",
    ]);
    expect(numbers((await csv({ to: "2026-09-01" })).rows)).toEqual(["#1001"]);
    expect(numbers((await csv({ from: "2026-09-05", to: "" })).rows)).toEqual(["#1005"]);
    expect((await csv({ from: "2026-10-01" })).rows).toEqual([]);
    await expect(exportOrders(storeOf(a), { from: "2026-02-30" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { from: "Enter a date as YYYY-MM-DD." },
    });
    await expect(exportOrders(storeOf(a), { to: "yesterday" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      exportOrders(storeOf(a), { from: "2026-09-05", to: "2026-09-01" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { to: "Choose an end date on or after the start date." },
    });
  });

  it("reads in batches, with every order exactly once", async () => {
    const { chunks, rows } = await csv({ status: "all" }, 2);
    // Header, then batches of 2, 2 (and an empty last read that writes nothing).
    expect(chunks).toHaveLength(3);
    expect(numbers(rows)).toEqual(["#1005", "#1003", "#1002", "#1001"]);
    const single = await csv({ q: "Asha" }, 1);
    expect(single.chunks).toHaveLength(1 + single.rows.length);
    expect(new Set(numbers(single.rows)).size).toBe(single.rows.length);
  });

  it("is audited with its filters and count, never the search text", async () => {
    await migratorDb().auditLog.deleteMany({ where: { action: "order.exported" } });
    await csv({ status: "all", q: "meera@example.test", from: "2026-09-01", to: "2026-09-30" });
    const entry = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "order.exported" },
    });
    expect(entry.storeId).toBe(storeOf(a).storeId);
    expect(entry.metadata).toEqual({
      filter: "all",
      searched: true,
      from: "2026-09-01",
      to: "2026-09-30",
      count: 1,
    });
    expect(JSON.stringify(entry.metadata)).not.toContain("meera");
  });

  it("needs order.read, and only ever sees its own store", async () => {
    const viewer = await memberContext(a, "VIEWER", storeOf(a));
    await expectCode(exportOrders(viewer), "FORBIDDEN");
    const support = await memberContext(a, "SUPPORT", storeOf(a));
    expect((await exportOrders(support)).rows).toBe(4);

    // B's owner can't get a context for A's store at all…
    await expectCode(
      requireStoreAccess(b.owner, toTypeId("store", storeOf(a).storeId)),
      "NOT_FOUND",
    );
    // …and B's export holds B's order only.
    const { rows } = await csv({}, undefined, b);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("b@example.test");
  });

  it("is rate limited per store", async () => {
    for (let i = 0; i < 30; i += 1) await exportOrders(storeOf(b));
    await expectCode(exportOrders(storeOf(b)), "RATE_LIMITED");
    // Another store's allowance is its own.
    await exportOrders(storeOf(a));
  });
});
