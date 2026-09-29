import "server-only";
import { Prisma, withTenant } from "@storevia/database";
import { consumeRateLimit } from "@storevia/security/server";
import { recordAudit, requirePermission, scopeOf, type TenantContext } from "@storevia/tenancy";
import { DomainError, validationFailed } from "@storevia/types";
import { csvCell } from "../import-export";
import { inStore, requireStoreContext } from "../internal";
import { toDecimalString } from "../money";
import { orderListConditions } from "./read";

// The merchant's orders as CSV (order.read): the list's own filters (status
// tab and search, from read.ts) plus a date range in the store's timezone.
// Rows are read in keyset-paged batches, each in a short transaction of its
// own, and handed out as text chunks, so a store with many orders never sits
// in memory. One row per order, amounts as exact decimal strings. Left out
// on purpose: internal ids, payment references and provider data; GST and
// invoice columns belong with invoicing.

export interface OrderExportQuery {
  readonly status?: unknown;
  readonly q?: unknown;
  /** "YYYY-MM-DD" in the store's timezone, inclusive; empty for no bound. */
  readonly from?: unknown;
  readonly to?: unknown;
}

export interface OrderExportFile {
  readonly filename: string;
  readonly contentType: string;
  /** Orders the export holds (counted when it started). */
  readonly rows: number;
  /** UTF-8 text with a byte-order mark first, so spreadsheet apps read it as UTF-8. */
  readonly chunks: AsyncGenerator<string>;
}

export const ORDER_EXPORT_BATCH = 500;
const EXPORT_LIMIT = { name: "orders:export", limit: 30, windowSeconds: 3_600 } as const;

export const ORDER_EXPORT_COLUMNS = [
  "Order",
  "Placed at",
  "Order state",
  "Payment status",
  "Fulfilment status",
  "Test order",
  "Customer name",
  "Customer email",
  "Items",
  "Currency",
  "Subtotal",
  "Discount",
  "Shipping",
  "Tax",
  "Total",
  "Refunded",
  "Net",
] as const;

const PAYMENT: Readonly<Record<string, string>> = {
  PENDING: "Payment pending",
  AUTHORISED: "Authorised",
  PAID: "Paid",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  FAILED: "Payment failed",
  VOIDED: "Voided",
};
const FULFILMENT: Readonly<Record<string, string>> = {
  UNFULFILLED: "Unfulfilled",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  FULFILLED: "Fulfilled",
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date as typed ("2026-09-29"), or null when empty; anything else is refused. */
function parseDay(value: unknown, field: "from" | "to"): string | null {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "" && typeof value === "string") return null;
  const match = DATE_RE.exec(text);
  const date = match ? new Date(`${text}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw validationFailed({ [field]: "Enter a date as YYYY-MM-DD." });
  }
  return text;
}

/** "2026-09-29 14:05:00 +05:30": the moment in the store's timezone, sortable. */
function localTimestamp(date: Date, format: Intl.DateTimeFormat): string {
  const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  const offset = (parts["timeZoneName"] ?? "GMT").replace(/^GMT/, "") || "+00:00";
  const hour = parts["hour"] === "24" ? "00" : (parts["hour"] ?? "00");
  return `${parts["year"] ?? ""}-${parts["month"] ?? ""}-${parts["day"] ?? ""} ${hour}:${parts["minute"] ?? ""}:${parts["second"] ?? ""} ${offset}`;
}

function timestampFormat(timezone: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: timezone });
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
  }
}

interface ExportRow {
  id: string;
  number: number;
  placed_at: Date;
  status: "OPEN" | "CANCELLED";
  completed: boolean;
  payment_status: string;
  fulfilment_status: string;
  test: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  items: number;
  currency: string;
  subtotal: bigint;
  discount: bigint;
  shipping: bigint;
  tax: bigint;
  total: bigint;
  refunded: bigint;
}

function csvLine(row: ExportRow, format: Intl.DateTimeFormat): string {
  const currency = row.currency.trim();
  const amount = (value: bigint) => toDecimalString({ amount: value, currency });
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  const cells = [
    `#${String(row.number)}`,
    localTimestamp(row.placed_at, format),
    row.status === "CANCELLED" ? "Cancelled" : row.completed ? "Completed" : "Open",
    PAYMENT[row.payment_status] ?? row.payment_status,
    FULFILMENT[row.fulfilment_status] ?? row.fulfilment_status,
    row.test ? "yes" : "no",
    name,
    row.email ?? "",
    String(row.items),
    currency,
    amount(row.subtotal),
    amount(row.discount),
    amount(row.shipping),
    amount(row.tax),
    amount(row.total),
    amount(row.refunded),
    amount(row.total - row.refunded),
  ];
  return cells.map(csvCell).join(",");
}

/**
 * Checks `order.read`, the date range and the rate limit, counts and audits
 * the export (its filters and row count; never the search text), then
 * returns the file as a stream of text chunks. `batchSize` is for tests.
 */
export async function exportOrders(
  ctx: TenantContext,
  query: OrderExportQuery = {},
  options: { readonly batchSize?: number } = {},
): Promise<OrderExportFile> {
  const store = requireStoreContext(ctx);
  // Checked before the rate limit, so a refused request uses no allowance.
  requirePermission(store, "order.read");
  const batchSize = Math.max(1, Math.min(options.batchSize ?? ORDER_EXPORT_BATCH, 5_000));
  const from = parseDay(query.from, "from");
  const to = parseDay(query.to, "to");
  if (from && to && from > to) {
    throw validationFailed({ to: "Choose an end date on or after the start date." });
  }
  const list = orderListConditions(query);
  const limit = await consumeRateLimit(EXPORT_LIMIT, store.storeId);
  if (!limit.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      "You've exported orders several times recently. Try again later.",
    );
  }

  const { timezone, conditions, count } = await inStore(store, "order.read", async (tx, s) => {
    const rows = await tx.$queryRaw<{ tz: string }[]>`
      SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = timezone)
        THEN timezone ELSE 'UTC' END AS tz
      FROM "Store" WHERE id = ${s.storeId}::uuid`;
    const tz = rows[0]?.tz ?? "UTC";
    // The range is whole days in the store's timezone, both ends included.
    const where = [
      ...list.conditions,
      ...(from ? [Prisma.sql`o."placedAt" >= (${from}::date::timestamp AT TIME ZONE ${tz})`] : []),
      ...(to ? [Prisma.sql`o."placedAt" < ((${to}::date + 1)::timestamp AT TIME ZONE ${tz})`] : []),
    ];
    const counted = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Order" o WHERE ${Prisma.join(where, " AND ")}`;
    const n = counted[0]?.n ?? 0;
    await recordAudit(
      tx,
      s,
      "order.exported",
      { type: "Store", id: s.storeId },
      { filter: list.status, searched: list.searched, from, to, count: n },
    );
    return { timezone: tz, conditions: where, count: n };
  });

  return {
    filename: `orders-${store.storeSlug}-${localDate(timezone)}.csv`,
    contentType: "text/csv; charset=utf-8",
    rows: count,
    chunks: stream(store, conditions, timezone, batchSize),
  };
}

/** Today in the store's timezone, "2026-09-29". */
function localDate(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function* stream(
  store: ReturnType<typeof requireStoreContext>,
  conditions: readonly Prisma.Sql[],
  timezone: string,
  batchSize: number,
): AsyncGenerator<string> {
  const format = timestampFormat(timezone);
  yield `\uFEFF${ORDER_EXPORT_COLUMNS.map(csvCell).join(",")}\r\n`;
  const scope = scopeOf(store);
  let cursor: { placedAt: Date; id: string } | null = null;
  for (;;) {
    const where: readonly Prisma.Sql[] = cursor
      ? [...conditions, Prisma.sql`(o."placedAt", o.id) < (${cursor.placedAt}, ${cursor.id}::uuid)`]
      : conditions;
    const rows: ExportRow[] = await withTenant(
      scope,
      (tx) =>
        tx.$queryRaw<ExportRow[]>`
        SELECT o.id, o."orderNumber" AS number, o."placedAt" AS placed_at,
          o.status::text AS status, o."completedAt" IS NOT NULL AS completed,
          o."paymentStatus"::text AS payment_status,
          o."fulfilmentStatus"::text AS fulfilment_status, o."testMode" AS test,
          coalesce(sa."firstName", ba."firstName") AS first_name,
          coalesce(sa."lastName", ba."lastName") AS last_name, o.email,
          (SELECT coalesce(sum(l.quantity), 0)::int FROM "OrderLine" l WHERE l."orderId" = o.id) AS items,
          o.currency, o."subtotalAmount" AS subtotal, o."discountAmount" AS discount,
          o."shippingAmount" AS shipping, o."taxAmount" AS tax, o."totalAmount" AS total,
          o."refundedAmount" AS refunded
        FROM "Order" o
        LEFT JOIN "OrderAddress" sa ON sa."orderId" = o.id AND sa.type = 'SHIPPING'
        LEFT JOIN "OrderAddress" ba ON ba."orderId" = o.id AND ba.type = 'BILLING'
        WHERE ${Prisma.join(where, " AND ")}
        ORDER BY o."placedAt" DESC, o.id DESC
        LIMIT ${batchSize}`,
    );
    if (rows.length > 0) {
      yield rows.map((row) => `${csvLine(row, format)}\r\n`).join("");
    }
    const last = rows.at(-1);
    if (rows.length < batchSize || !last) return;
    cursor = { placedAt: last.placed_at, id: last.id };
  }
}
