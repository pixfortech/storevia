import "server-only";
import { Prisma } from "@storevia/database";
import type { TenantContext } from "@storevia/tenancy";
import { productListQuerySchema, type ProductListQuery } from "@storevia/validation";
import { inStore, internalId, publicId, type TenantTx } from "./internal";
import type { MoneyJson } from "./money";
import { parseRenditions, type MediaRendition, type ProductStatus } from "./products";
import { LOW_STOCK_THRESHOLD } from "./inventory";

// Catalogue search (ADR-0018, ADR-0027 §11). Callers depend on SearchIndex,
// not on PostgreSQL; the implementation below uses the expression GIN index
// (full text over title, handle, vendor, type and tags) and trigram indexes
// (title, SKU). The store scope is not a parameter: every query runs inside
// the caller's RLS-scoped transaction, so it can only see one store.

export type ProductSort = "updated" | "created" | "title_asc" | "title_desc";
export type StockFilter = "in_stock" | "low_stock" | "out_of_stock" | "untracked";

export interface ProductSearchQuery {
  readonly q?: string | undefined;
  /** Omitted = drafts and active products (archived ones have their own tab). */
  readonly status?: ProductStatus | undefined;
  readonly vendor?: string | undefined;
  readonly productType?: string | undefined;
  /** Internal collection id. */
  readonly collectionId?: string | undefined;
  readonly stock?: StockFilter | undefined;
  readonly sort: ProductSort;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface ProductListItem {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
  readonly status: ProductStatus;
  readonly vendor: string | null;
  readonly productType: string | null;
  readonly updatedAt: Date;
  readonly createdAt: Date;
  readonly variantCount: number;
  readonly priceMin: MoneyJson | null;
  readonly priceMax: MoneyJson | null;
  /** Variants that track stock; 0 means stock isn't tracked. */
  readonly trackedVariants: number;
  /** Units available across tracked variants and active locations. */
  readonly available: number;
  readonly outOfStockVariants: number;
  readonly lowStockVariants: number;
  readonly image: {
    readonly mediaId: string;
    readonly altText: string | null;
    readonly storageKey: string;
    readonly renditions: readonly MediaRendition[];
  } | null;
}

export interface ProductPage {
  readonly items: readonly ProductListItem[];
  readonly nextCursor: string | null;
}

export interface SearchIndex {
  searchProducts(tx: TenantTx, query: ProductSearchQuery): Promise<ProductPage>;
}

// --- helpers ----------------------------------------------------------------

/** Words for a prefix full-text query; only letters and digits survive, so no tsquery syntax. */
export function searchTerms(q: string): string[] {
  return (q.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 8)
    .map((t) => t.slice(0, 64));
}

const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

type CursorValue = string | number;

function encodeCursor(values: readonly CursorValue[]): string {
  return Buffer.from(JSON.stringify(values)).toString("base64url");
}

function decodeCursor(value: string | undefined): [string, string] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      /^[0-9a-f-]{36}$/.test(parsed[1])
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // An unreadable cursor starts from the first page.
  }
  return null;
}

interface SortSpec {
  readonly key: Prisma.Sql;
  readonly direction: "ASC" | "DESC";
  readonly cursorValue: (row: Row) => string;
  readonly parse: (value: string) => Date | string | null;
}

const asDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const SORTS: Record<ProductSort, SortSpec> = {
  updated: {
    key: Prisma.sql`p."updatedAt"`,
    direction: "DESC",
    cursorValue: (r) => r.updatedAt.toISOString(),
    parse: asDate,
  },
  created: {
    key: Prisma.sql`p."createdAt"`,
    direction: "DESC",
    cursorValue: (r) => r.createdAt.toISOString(),
    parse: asDate,
  },
  title_asc: {
    key: Prisma.sql`lower(p.title)`,
    direction: "ASC",
    cursorValue: (r) => r.title.toLowerCase(),
    parse: (v) => v,
  },
  title_desc: {
    key: Prisma.sql`lower(p.title)`,
    direction: "DESC",
    cursorValue: (r) => r.title.toLowerCase(),
    parse: (v) => v,
  },
};

interface Row {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string | null;
  productType: string | null;
  updatedAt: Date;
  createdAt: Date;
  variantCount: bigint;
  priceMin: bigint | null;
  priceMax: bigint | null;
  currency: string | null;
  trackedVariants: bigint;
  available: bigint;
  outOfStockVariants: bigint;
  lowStockVariants: bigint;
  mediaId: string | null;
  mediaAlt: string | null;
  storageKey: string | null;
  renditions: unknown;
}

// --- PostgreSQL implementation ------------------------------------------------

export class PostgresSearchIndex implements SearchIndex {
  async searchProducts(tx: TenantTx, query: ProductSearchQuery): Promise<ProductPage> {
    const sort = SORTS[query.sort];
    const conditions: Prisma.Sql[] = [Prisma.sql`p."deletedAt" IS NULL`];
    conditions.push(
      query.status
        ? Prisma.sql`p.status = ${query.status}::"ProductStatus"`
        : Prisma.sql`p.status <> 'ARCHIVED'`,
    );
    if (query.vendor) conditions.push(Prisma.sql`p.vendor = ${query.vendor}`);
    if (query.productType) conditions.push(Prisma.sql`p."productType" = ${query.productType}`);
    if (query.collectionId) {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "CollectionProduct" cp
        WHERE cp."productId" = p.id AND cp."collectionId" = ${query.collectionId}::uuid)`);
    }
    const q = query.q?.trim() ?? "";
    if (q) {
      const terms = searchTerms(q);
      const alternatives: Prisma.Sql[] = [
        Prisma.sql`lower(p.title) LIKE ${`%${likeEscape(q.toLowerCase())}%`}`,
        Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" sv WHERE sv."productId" = p.id AND sv."deletedAt" IS NULL
          AND (lower(sv.sku) LIKE ${`${likeEscape(q.toLowerCase())}%`} OR sv.barcode = ${q}))`,
      ];
      if (terms.length > 0) {
        const tsquery = terms.map((t) => `${t}:*`).join(" & ");
        alternatives.push(
          Prisma.sql`catalogue_search_document(p.title, p.handle, p.vendor, p."productType", p.tags) @@ to_tsquery('simple', ${tsquery})`,
        );
      }
      conditions.push(Prisma.sql`(${Prisma.join(alternatives, " OR ")})`);
    }
    if (query.stock === "untracked") conditions.push(Prisma.sql`agg.tracked = 0`);
    if (query.stock === "out_of_stock") conditions.push(Prisma.sql`agg.out_variants > 0`);
    if (query.stock === "low_stock") conditions.push(Prisma.sql`agg.low_variants > 0`);
    if (query.stock === "in_stock")
      conditions.push(Prisma.sql`agg.tracked > 0 AND agg.available > 0`);

    const cursor = decodeCursor(query.cursor);
    const cursorValue = cursor ? sort.parse(cursor[0]) : null;
    if (cursor && cursorValue !== null) {
      conditions.push(
        sort.direction === "DESC"
          ? Prisma.sql`(${sort.key}, p.id) < (${cursorValue}, ${cursor[1]}::uuid)`
          : Prisma.sql`(${sort.key}, p.id) > (${cursorValue}, ${cursor[1]}::uuid)`,
      );
    }
    const direction = Prisma.raw(sort.direction);

    // One statement: per-product aggregates via LATERAL joins, never a
    // query per row.
    const rows = await tx.$queryRaw<Row[]>`
      SELECT p.id, p.title, p.handle, p.status::text AS status, p.vendor, p."productType",
             p."updatedAt", p."createdAt",
             agg.variants AS "variantCount", agg.price_min AS "priceMin", agg.price_max AS "priceMax",
             agg.currency, agg.tracked AS "trackedVariants", agg.available,
             agg.out_variants AS "outOfStockVariants", agg.low_variants AS "lowStockVariants",
             img.id AS "mediaId", img.alt AS "mediaAlt", img."storageKey", img.renditions
      FROM "Product" p
      LEFT JOIN LATERAL (
        SELECT count(*) AS variants,
               min(v."priceAmount") AS price_min, max(v."priceAmount") AS price_max, min(v.currency) AS currency,
               count(*) FILTER (WHERE ii.tracked) AS tracked,
               coalesce(sum(st.available) FILTER (WHERE ii.tracked), 0)::bigint AS available,
               count(*) FILTER (WHERE ii.tracked AND v."inventoryPolicy" = 'DENY' AND coalesce(st.available, 0) <= 0) AS out_variants,
               count(*) FILTER (WHERE ii.tracked AND st.available > 0 AND st.available <= ${LOW_STOCK_THRESHOLD}) AS low_variants
        FROM "ProductVariant" v
        LEFT JOIN "InventoryItem" ii ON ii."variantId" = v.id
        LEFT JOIN LATERAL (
          SELECT sum(l.available)::bigint AS available
          FROM "InventoryLevel" l
          JOIN "Location" loc ON loc.id = l."locationId" AND loc."isActive" AND loc."deletedAt" IS NULL
          WHERE l."inventoryItemId" = ii.id
        ) st ON true
        WHERE v."productId" = p.id AND v."deletedAt" IS NULL
      ) agg ON true
      LEFT JOIN LATERAL (
        SELECT m.id, coalesce(pm."altText", m."altText") AS alt, m."storageKey", m.renditions
        FROM "ProductMedia" pm JOIN "MediaAsset" m ON m.id = pm."mediaAssetId"
        WHERE pm."productId" = p.id AND m."deletedAt" IS NULL AND m.status = 'READY'
        ORDER BY pm.position LIMIT 1
      ) img ON true
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY ${sort.key} ${direction}, p.id ${direction}
      LIMIT ${query.limit + 1}`;

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toItem),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor([sort.cursorValue(last), last.id]) : null,
    };
  }
}

function toItem(row: Row): ProductListItem {
  const money = (amount: bigint | null): MoneyJson | null =>
    amount === null || row.currency === null
      ? null
      : { amount: amount.toString(), currency: row.currency };
  return {
    id: publicId("product", row.id),
    title: row.title,
    handle: row.handle,
    status: row.status,
    vendor: row.vendor,
    productType: row.productType,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    variantCount: Number(row.variantCount),
    priceMin: money(row.priceMin),
    priceMax: money(row.priceMax),
    trackedVariants: Number(row.trackedVariants),
    available: Number(row.available),
    outOfStockVariants: Number(row.outOfStockVariants),
    lowStockVariants: Number(row.lowStockVariants),
    image:
      row.mediaId && row.storageKey
        ? {
            mediaId: publicId("media", row.mediaId),
            altText: row.mediaAlt,
            storageKey: row.storageKey,
            renditions: parseRenditions(row.renditions),
          }
        : null,
  };
}

const defaultIndex: SearchIndex = new PostgresSearchIndex();

// --- services -------------------------------------------------------------------

export interface ProductListResult extends ProductPage {
  /** Per-tab counts (ignoring search and filters). */
  readonly counts: {
    readonly all: number;
    readonly active: number;
    readonly draft: number;
    readonly archived: number;
  };
  readonly vendors: readonly string[];
  readonly productTypes: readonly string[];
}

/** The merchant product list: search, filters, status tabs, keyset pages. */
export async function listProducts(
  ctx: TenantContext,
  rawQuery: ProductListQuery | Record<string, unknown> = {},
  index: SearchIndex = defaultIndex,
): Promise<ProductListResult> {
  const parsed = productListQuerySchema.parse(rawQuery);
  let collectionId: string | undefined;
  if (parsed.collectionId) {
    try {
      collectionId = internalId("collection", parsed.collectionId);
    } catch {
      collectionId = "00000000-0000-0000-0000-000000000000";
    }
  }
  return inStore(ctx, "product.read", async (tx) => {
    const page = await index.searchProducts(tx, {
      q: parsed.q,
      status: parsed.status,
      vendor: parsed.vendor,
      productType: parsed.productType,
      collectionId,
      stock: parsed.stock,
      sort: parsed.sort,
      cursor: parsed.cursor,
      limit: parsed.limit,
    });
    const grouped = await tx.product.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const count = (status: ProductStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;
    const facets = await tx.$queryRaw<{ kind: string; value: string }[]>`
      (SELECT DISTINCT 'vendor' AS kind, vendor AS value FROM "Product"
        WHERE "deletedAt" IS NULL AND vendor IS NOT NULL ORDER BY value LIMIT 100)
      UNION ALL
      (SELECT DISTINCT 'type' AS kind, "productType" AS value FROM "Product"
        WHERE "deletedAt" IS NULL AND "productType" IS NOT NULL ORDER BY value LIMIT 100)`;
    return {
      ...page,
      counts: {
        all: count("ACTIVE") + count("DRAFT"),
        active: count("ACTIVE"),
        draft: count("DRAFT"),
        archived: count("ARCHIVED"),
      },
      vendors: facets.filter((f) => f.kind === "vendor").map((f) => f.value),
      productTypes: facets.filter((f) => f.kind === "type").map((f) => f.value),
    };
  });
}

/**
 * Product search for pickers (collections, bulk add): a small first page,
 * drafts and active products only.
 */
export async function searchProducts(
  ctx: TenantContext,
  q: string,
  options: { readonly limit?: number; readonly index?: SearchIndex } = {},
): Promise<readonly ProductListItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  return inStore(
    ctx,
    "product.read",
    async (tx) =>
      (
        await (options.index ?? defaultIndex).searchProducts(tx, {
          q: q.slice(0, 200),
          sort: "title_asc",
          limit,
        })
      ).items,
  );
}
