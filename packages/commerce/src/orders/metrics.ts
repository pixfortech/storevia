import "server-only";
import type { TenantContext } from "@storevia/tenancy";
import { inStore, publicIdOrNull, type TenantTx } from "../internal";
import type { MoneyJson } from "../money";

// Real sales figures for the store home (ADR-0031 §5): revenue, orders, new
// customers, a daily series and the best sellers over a period, with the
// period before it for comparison. Every figure comes from the order
// snapshots in a fixed number of queries (no per-order or per-day reads).
//
// Definitions, shared by every figure here:
// - A period is the last `days` calendar days in the store's timezone,
//   today included (UTC when the store's zone isn't one Postgres knows).
//   The period before it is the `days` days that precede it.
// - Cancelled orders count for nothing.
// - Revenue is the order total less what was refunded, summed over orders
//   placed in the period, in the store's currency (orders in any other
//   currency are counted but add no revenue).
// - Units sold are the ordered quantity less refunded units.
// - A new customer is a customer record created in the period, which
//   checkout does when someone first orders.

/** The longest period a summary covers (and so twice this, with the period before). */
export const SALES_MAX_DAYS = 366;

export interface SalesDay {
  /** The calendar day in the store's timezone, YYYY-MM-DD. */
  readonly date: string;
  /** Revenue that day, in minor units of the summary's currency. */
  readonly revenue: string;
  readonly orders: number;
}

export interface SalesPeriod {
  readonly revenue: MoneyJson;
  readonly orders: number;
  /** Every day of the period, oldest first; days without orders are zero. */
  readonly daily: readonly SalesDay[];
}

export interface TopProduct {
  /** Null once the product has been deleted (its order lines keep the title). */
  readonly productId: string | null;
  /** The title on its most recent order line. */
  readonly title: string;
  readonly units: number;
}

export interface StoreSalesSummary {
  readonly days: number;
  /** The IANA zone the days are counted in. */
  readonly timezone: string;
  readonly currency: string;
  /** The last `days` days, today included. */
  readonly current: SalesPeriod;
  /** The `days` days before them. */
  readonly previous: SalesPeriod;
  /** Best sellers in the current period by units sold, at most five. */
  readonly topProducts: readonly TopProduct[];
}

export interface CustomerDay {
  readonly date: string;
  readonly count: number;
}

export interface CustomerPeriod {
  readonly newCustomers: number;
  readonly daily: readonly CustomerDay[];
}

export interface StoreCustomerSummary {
  readonly days: number;
  readonly timezone: string;
  readonly current: CustomerPeriod;
  readonly previous: CustomerPeriod;
}

const TOP_PRODUCTS = 5;

/** A whole number of days, 1 to SALES_MAX_DAYS; anything else is 30. */
function periodDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 30;
  return Math.min(SALES_MAX_DAYS, Math.max(1, Math.trunc(value)));
}

const DAY_MS = 86_400_000;

/** `date` (YYYY-MM-DD) moved by `offset` days. */
function shiftDate(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

interface StoreClock {
  readonly currency: string;
  readonly timezone: string;
  /** Today in the store's timezone, YYYY-MM-DD. */
  readonly today: string;
}

/** The store's currency, its (known) timezone and today's date there. */
async function storeClock(tx: TenantTx, storeId: string): Promise<StoreClock> {
  const rows = await tx.$queryRaw<{ currency: string; tz: string; today: string }[]>`
    WITH s AS (
      SELECT currency,
        CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = timezone)
          THEN timezone ELSE 'UTC' END AS tz
      FROM "Store" WHERE id = ${storeId}::uuid
    )
    SELECT currency, tz, to_char((now() AT TIME ZONE tz)::date, 'YYYY-MM-DD') AS today FROM s`;
  const row = rows[0];
  if (!row) throw new Error("storeClock: the store isn't visible in its own scope");
  return { currency: row.currency.trim(), timezone: row.tz, today: row.today };
}

/** The dates of the current period and the one before, oldest first. */
function periodDates(today: string, days: number): { previous: string[]; current: string[] } {
  const all = Array.from({ length: 2 * days }, (_, i) => shiftDate(today, i - (2 * days - 1)));
  return { previous: all.slice(0, days), current: all.slice(days) };
}

const money = (amount: bigint, currency: string): MoneyJson => ({
  amount: amount.toString(),
  currency,
});

/**
 * Revenue, orders, the daily series and the best sellers for the last
 * `days` days, with the period before. Needs `order.read`. Four queries.
 */
export async function storeSalesSummary(
  ctx: TenantContext,
  options: { readonly days?: number } = {},
): Promise<StoreSalesSummary> {
  const days = periodDays(options.days ?? 30);
  return inStore(ctx, "order.read", async (tx, store) => {
    const clock = await storeClock(tx, store.storeId);
    const dates = periodDates(clock.today, days);
    const from = dates.previous[0] ?? clock.today;
    const currentFrom = dates.current[0] ?? clock.today;
    const tz = clock.timezone;

    const byDay = await tx.$queryRaw<{ day: string; orders: number; revenue: bigint }[]>`
      SELECT to_char(("placedAt" AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
        count(*)::int AS orders,
        coalesce(sum("totalAmount" - "refundedAmount")
          FILTER (WHERE currency = ${clock.currency}), 0)::bigint AS revenue
      FROM "Order"
      WHERE "storeId" = ${store.storeId}::uuid AND status <> 'CANCELLED'
        AND "placedAt" >= (${from}::date::timestamp AT TIME ZONE ${tz})
      GROUP BY 1`;

    const top = await tx.$queryRaw<{ product_id: string | null; title: string; units: number }[]>`
      SELECT l."productId" AS product_id,
        (array_agg(l."productTitle" ORDER BY o."placedAt" DESC, l.id DESC))[1] AS title,
        sum(l.quantity - l."refundedQuantity")::int AS units
      FROM "OrderLine" l
      JOIN "Order" o ON o.id = l."orderId"
      WHERE o."storeId" = ${store.storeId}::uuid AND o.status <> 'CANCELLED'
        AND o."placedAt" >= (${currentFrom}::date::timestamp AT TIME ZONE ${tz})
      GROUP BY l."productId", CASE WHEN l."productId" IS NULL THEN l."productTitle" END
      HAVING sum(l.quantity - l."refundedQuantity") > 0
      ORDER BY units DESC, title ASC
      LIMIT ${TOP_PRODUCTS}`;

    const found = new Map(byDay.map((row) => [row.day, row]));
    const period = (list: readonly string[]): SalesPeriod => {
      const daily = list.map((date) => {
        const row = found.get(date);
        return { date, revenue: (row?.revenue ?? 0n).toString(), orders: row?.orders ?? 0 };
      });
      return {
        revenue: money(
          daily.reduce((total, d) => total + BigInt(d.revenue), 0n),
          clock.currency,
        ),
        orders: daily.reduce((total, d) => total + d.orders, 0),
        daily,
      };
    };

    return {
      days,
      timezone: tz,
      currency: clock.currency,
      current: period(dates.current),
      previous: period(dates.previous),
      topProducts: top.map((row) => ({
        productId: publicIdOrNull("product", row.product_id),
        title: row.title,
        units: row.units,
      })),
    };
  });
}

/**
 * New customers for the last `days` days, with the period before. Needs
 * `customer.read` (not `order.read`: a member may see one without the
 * other). Two queries.
 */
export async function storeCustomerSummary(
  ctx: TenantContext,
  options: { readonly days?: number } = {},
): Promise<StoreCustomerSummary> {
  const days = periodDays(options.days ?? 30);
  return inStore(ctx, "customer.read", async (tx, store) => {
    const clock = await storeClock(tx, store.storeId);
    const dates = periodDates(clock.today, days);
    const from = dates.previous[0] ?? clock.today;
    const tz = clock.timezone;
    const rows = await tx.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
        count(*)::int AS count
      FROM "Customer"
      WHERE "storeId" = ${store.storeId}::uuid AND "deletedAt" IS NULL
        AND "createdAt" >= (${from}::date::timestamp AT TIME ZONE ${tz})
      GROUP BY 1`;
    const found = new Map(rows.map((row) => [row.day, row.count]));
    const period = (list: readonly string[]): CustomerPeriod => {
      const daily = list.map((date) => ({ date, count: found.get(date) ?? 0 }));
      return { newCustomers: daily.reduce((total, d) => total + d.count, 0), daily };
    };
    return {
      days,
      timezone: tz,
      current: period(dates.current),
      previous: period(dates.previous),
    };
  });
}
