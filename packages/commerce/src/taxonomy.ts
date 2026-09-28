import "server-only";
import { Prisma } from "@storevia/database";
import type { TenantContext } from "@storevia/tenancy";
import { cleanTag } from "@storevia/validation";
import { inStore, validationError, type TenantTx } from "./internal";

// Product categories and tag suggestions (09-commerce.md "Categories,
// collections, product types and tags"). Categories are the global product
// taxonomy: platform reference data in ProductCategory, read-only to every
// application role and the same for every store. Merchants pick one per
// product and never see its code. Tags are the store's own labels on
// Product.tags; suggestions come from the tags this store already uses.

/** The breadcrumb separator stored in ProductCategory.path. */
const PATH_SEPARATOR = " > ";

export interface CategoryView {
  /** Stable taxonomy code: submitted by the picker, never shown to merchants. */
  readonly code: string;
  readonly name: string;
  /** Names from the top level down, ending with this category. */
  readonly path: readonly string[];
  readonly hasChildren: boolean;
}

export interface CategoryRef {
  readonly code: string;
  readonly name: string;
  readonly path: readonly string[];
  /** false once the taxonomy retired it; products keep it until changed. */
  readonly active: boolean;
}

export const splitCategoryPath = (path: string): string[] => path.split(PATH_SEPARATOR);

const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Search words for the picker: lower-cased, bounded, LIKE-escaped. */
function categoryTerms(q: string): string[] {
  return q
    .toLocaleLowerCase("en")
    .split(/[\s>›/,]+/u)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => likeEscape(t.slice(0, 60)));
}

interface CategoryRow {
  code: string;
  name: string;
  path: string;
  hasChildren: boolean;
}

const toView = (row: CategoryRow): CategoryView => ({
  code: row.code,
  name: row.name,
  path: splitCategoryPath(row.path),
  hasChildren: row.hasChildren,
});

/**
 * Active categories for the picker. With `q`, every word must appear in the
 * breadcrumb ("kitchen cook" finds "Home & Garden › Kitchen & Dining ›
 * Cookware"); exact and prefix name matches first, then shallower ones.
 * Without `q`, the children of `parentCode` (the top level when omitted), in
 * taxonomy order. Always bounded.
 */
export async function listProductCategories(
  ctx: TenantContext,
  options: {
    readonly q?: string | undefined;
    readonly parentCode?: string | null | undefined;
    readonly limit?: number | undefined;
  } = {},
): Promise<readonly CategoryView[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);
  const terms = categoryTerms(options.q ?? "");
  return inStore(ctx, "product.read", async (tx) => {
    const hasChildren = Prisma.sql`EXISTS (SELECT 1 FROM "ProductCategory" k
      WHERE k."parentCode" = c.code AND k.active) AS "hasChildren"`;
    if (terms.length > 0) {
      const whole = (options.q ?? "").trim().toLocaleLowerCase("en");
      const rows = await tx.$queryRaw<CategoryRow[]>`
        SELECT c.code, c.name, c.path, ${hasChildren}
        FROM "ProductCategory" c
        WHERE c.active AND lower(c.path) LIKE ALL (${terms.map((t) => `%${t}%`)}::text[])
        ORDER BY lower(c.name) = ${whole} DESC,
                 lower(c.name) LIKE ${`${terms[0] ?? ""}%`} DESC,
                 c.level, c.path
        LIMIT ${limit}`;
      return rows.map(toView);
    }
    let parent = options.parentCode?.trim() ?? null;
    if (parent === "") parent = null;
    const rows = await tx.$queryRaw<CategoryRow[]>`
      SELECT c.code, c.name, c.path, ${hasChildren}
      FROM "ProductCategory" c
      WHERE c.active AND ${parent === null ? Prisma.sql`c."parentCode" IS NULL` : Prisma.sql`c."parentCode" = ${parent}`}
      ORDER BY c.position, c.name
      LIMIT ${limit}`;
    return rows.map(toView);
  });
}

async function categoryRef(tx: TenantTx, code: string): Promise<CategoryRef | null> {
  const row = await tx.productCategory.findUnique({
    where: { code },
    select: { code: true, name: true, path: true, active: true },
  });
  return row ? { ...row, path: splitCategoryPath(row.path) } : null;
}

/** A category's breadcrumb (also for retired categories); null for an unknown code. */
export async function getCategoryPath(
  ctx: TenantContext,
  code: string,
): Promise<CategoryRef | null> {
  if (!code || code.length > 64) return null;
  return inStore(ctx, "product.read", (tx) => categoryRef(tx, code));
}

/**
 * The category a product write may assign: an active taxonomy code. Anything
 * else (unknown, retired, malformed) is a field error, never a silent clear.
 */
export async function requireAssignableCategory(tx: TenantTx, code: string): Promise<string> {
  const ref = await categoryRef(tx, code);
  if (!ref?.active) throw validationError("categoryCode", "Choose a category from the list.");
  return ref.code;
}

// --- tags ------------------------------------------------------------------------

export interface TagSuggestion {
  readonly tag: string;
  /** Live products in this store with the tag. */
  readonly products: number;
}

/** Distinct tags of the store's live products, most used first (one statement). */
export async function storeTags(
  tx: TenantTx,
  storeId: string,
  options: { readonly prefix?: string; readonly limit: number },
): Promise<TagSuggestion[]> {
  const prefix = cleanTag(options.prefix ?? "").toLocaleLowerCase("en");
  const rows = await tx.$queryRaw<{ tag: string; products: number }[]>`
    SELECT mode() WITHIN GROUP (ORDER BY t) AS tag, count(DISTINCT p.id)::int AS products
    FROM "Product" p CROSS JOIN LATERAL unnest(p.tags) AS t
    WHERE p."storeId" = ${storeId}::uuid AND p."deletedAt" IS NULL
      ${prefix ? Prisma.sql`AND lower(t) LIKE ${`${likeEscape(prefix)}%`}` : Prisma.empty}
    GROUP BY lower(t)
    ORDER BY count(DISTINCT p.id) DESC, lower(t)
    LIMIT ${options.limit}`;
  return rows;
}

/**
 * Tag suggestions for the editor: tags already used by this store's products
 * (never another store's: the query is store-filtered and runs under the
 * store's RLS scope), matching `prefix` ignoring case. Bounded.
 */
export async function listProductTags(
  ctx: TenantContext,
  options: { readonly prefix?: string | undefined; readonly limit?: number | undefined } = {},
): Promise<readonly TagSuggestion[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 50);
  return inStore(ctx, "product.read", (tx, store) =>
    storeTags(tx, store.storeId, { prefix: (options.prefix ?? "").slice(0, 100), limit }),
  );
}
