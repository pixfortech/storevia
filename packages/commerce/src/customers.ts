import "server-only";
import { Prisma } from "@storevia/database";
import { recordAudit, requireRecentAuthentication, type TenantContext } from "@storevia/tenancy";
import { notFound, validationFailed } from "@storevia/types";
import { inStore, internalId, publicId } from "./internal";
import type { MoneyJson } from "./money";

// Customers (ADR-0031 §6): one per store and email, created by checkout.
// Merchants read them with `customer.read` and keep a note and tags with
// `customer.manage`; contact details come from orders and are never edited
// here. No login, no marketing consent, no cross-store view.

export interface CustomerListItem {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly orderCount: number;
  /** Order totals minus refunds, cancelled orders excluded. */
  readonly totalSpent: MoneyJson | null;
  readonly lastOrderAt: Date | null;
  readonly createdAt: Date;
}

const nameOf = (first: string | null, last: string | null) =>
  first || last ? [first, last].filter(Boolean).join(" ") : null;

function decodeCursor(cursor: unknown): { at: Date; id: string } | null {
  if (typeof cursor !== "string" || cursor.length > 200) return null;
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const at = new Date(iso ?? "");
  return Number.isNaN(at.getTime()) || !id || !/^[0-9a-f-]{36}$/.test(id) ? null : { at, id };
}

export async function listCustomers(
  ctx: TenantContext,
  query: { readonly q?: unknown; readonly cursor?: unknown } = {},
  limit = 25,
): Promise<{ readonly items: readonly CustomerListItem[]; readonly nextCursor: string | null }> {
  const conditions: Prisma.Sql[] = [Prisma.sql`c."deletedAt" IS NULL`];
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    conditions.push(
      Prisma.sql`(c.email::text ILIKE ${like} OR (coalesce(c."firstName", '') || ' ' || coalesce(c."lastName", '')) ILIKE ${like})`,
    );
  }
  const cursor = decodeCursor(query.cursor);
  if (cursor)
    conditions.push(Prisma.sql`(c."createdAt", c.id) < (${cursor.at}, ${cursor.id}::uuid)`);
  return inStore(ctx, "customer.read", async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
        first: string | null;
        last: string | null;
        email: string | null;
        orders: number;
        spent: bigint | null;
        currency: string | null;
        last_order: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT c.id, c."firstName" AS first, c."lastName" AS last, c.email::text AS email,
        coalesce(o.orders, 0)::int AS orders, o.spent, o.currency, o.last_order,
        c."createdAt" AS created_at
      FROM "Customer" c
      LEFT JOIN LATERAL (
        SELECT count(*) AS orders,
          sum("totalAmount" - "refundedAmount") FILTER (WHERE status = 'OPEN') AS spent,
          max(currency) AS currency, max("placedAt") AS last_order
        FROM "Order" WHERE "customerId" = c.id
      ) o ON true
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY c."createdAt" DESC, c.id DESC
      LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        id: publicId("customer", r.id),
        name: nameOf(r.first, r.last),
        email: r.email,
        orderCount: r.orders,
        totalSpent:
          r.spent !== null && r.currency
            ? { amount: r.spent.toString(), currency: r.currency.trim() }
            : null,
        lastOrderAt: r.last_order,
        createdAt: r.created_at,
      })),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(`${last.created_at.toISOString()}|${last.id}`).toString("base64url")
          : null,
    };
  });
}

export interface CustomerDetail {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly orders: readonly {
    readonly id: string;
    readonly number: number;
    readonly placedAt: Date;
    readonly total: MoneyJson;
    readonly status: string;
    readonly paymentStatus: string;
    readonly fulfilmentStatus: string;
  }[];
}

export async function getCustomer(
  ctx: TenantContext,
  customerPublicId: unknown,
): Promise<CustomerDetail> {
  const id = internalId("customer", customerPublicId);
  return inStore(ctx, "customer.read", async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw notFound();
    const orders = await tx.order.findMany({
      where: { customerId: id },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        placedAt: true,
        totalAmount: true,
        currency: true,
        status: true,
        paymentStatus: true,
        fulfilmentStatus: true,
      },
    });
    return {
      id: publicId("customer", customer.id),
      name: nameOf(customer.firstName, customer.lastName),
      email: customer.email,
      phone: customer.phone,
      note: customer.note,
      tags: customer.tags,
      createdAt: customer.createdAt,
      orders: orders.map((o) => ({
        id: publicId("order", o.id),
        number: o.orderNumber,
        placedAt: o.placedAt,
        total: { amount: o.totalAmount.toString(), currency: o.currency.trim() },
        status: o.status,
        paymentStatus: o.paymentStatus,
        fulfilmentStatus: o.fulfilmentStatus,
      })),
    };
  });
}

/** The merchant's note and tags (comma-separated in forms). */
export async function updateCustomer(
  ctx: TenantContext,
  customerPublicId: unknown,
  input: { readonly note?: unknown; readonly tags?: unknown },
): Promise<void> {
  const id = internalId("customer", customerPublicId);
  const note = typeof input.note === "string" ? input.note.trim() || null : null;
  if (note && note.length > 5000) throw validationFailed({ note: "Use at most 5000 characters." });
  const rawTags =
    typeof input.tags === "string"
      ? input.tags.split(",")
      : Array.isArray(input.tags)
        ? input.tags.filter((t): t is string => typeof t === "string")
        : [];
  const tags = [...new Set(rawTags.map((t) => t.trim()).filter(Boolean))];
  if (tags.length > 50 || tags.some((t) => t.length > 40)) {
    throw validationFailed({ tags: "Use up to 50 tags of at most 40 characters." });
  }
  await inStore(
    ctx,
    "customer.manage",
    async (tx, store) => {
      const updated = await tx.$executeRaw`
        UPDATE "Customer" SET note = ${note}, tags = ${tags}::text[], "updatedAt" = now()
        WHERE id = ${id}::uuid AND "deletedAt" IS NULL`;
      if (updated === 0) throw notFound();
      await recordAudit(
        tx,
        store,
        "customer.updated",
        { type: "Customer", id },
        {
          fields: "note,tags",
        },
      );
    },
    { write: true },
  );
}

export interface CustomerErasure {
  readonly orders: number;
  readonly addresses: number;
  readonly messages: number;
  readonly checkouts: number;
}

/**
 * Erases a customer's personal data (M8, data-lifecycle.md): their name,
 * email, phone, note and tags, and on their orders (by customer, or by
 * email for guest checkouts in this store) the email, phone, addresses
 * (region and country stay for tax), messages, pending emails and order
 * links. Amounts, lines, payments, refunds and tax records are kept.
 * Irreversible: `customer.manage` and a recent password confirmation.
 */
export async function eraseCustomer(
  ctx: TenantContext,
  customerPublicId: unknown,
): Promise<CustomerErasure> {
  const id = internalId("customer", customerPublicId);
  return inStore(
    ctx,
    "customer.manage",
    async (tx, store) => {
      requireRecentAuthentication(store, "erasing a customer's personal data");
      const [row] = await tx.$queryRaw<{ result: Record<string, number> | null }[]>`
        SELECT app_erase_customer(${id}::uuid) AS result`;
      const result = row?.result;
      if (!result) throw notFound();
      const erased: CustomerErasure = {
        orders: result["orders"] ?? 0,
        addresses: result["addresses"] ?? 0,
        messages: result["messages"] ?? 0,
        checkouts: result["checkouts"] ?? 0,
      };
      await recordAudit(
        tx,
        store,
        "customer.erased",
        { type: "Customer", id },
        {
          count: erased.orders,
        },
      );
      return erased;
    },
    // Not `write`: an erasure request is honoured whatever the store's state.
  );
}
