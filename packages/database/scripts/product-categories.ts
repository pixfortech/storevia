// Product taxonomy loader (erd.md §4.3): reads prisma/reference/product-categories.json,
// checks it (unique well-formed codes, known parents, no cycles), and brings
// the ProductCategory table in line with it as the schema owner. Idempotent:
// rows are upserted by code one tree level at a time (a parent always exists
// before its children), siblings take the order of the file, and a code that
// is no longer in the file is deactivated, never deleted (products may still
// point at it). Scales to the full Standard Product Taxonomy (~11k rows):
// one INSERT … ON CONFLICT per level, not one statement per row.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "../src/generated/prisma/client";

export const CATEGORY_FILE = resolve(
  import.meta.dirname,
  "../prisma/reference/product-categories.json",
);

export interface CategorySource {
  readonly code: string;
  readonly name: string;
  readonly parent?: string;
}

export interface CategoryRow {
  readonly code: string;
  readonly name: string;
  readonly parentCode: string | null;
  readonly level: number;
  readonly path: string;
  readonly position: number;
}

const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PATH_SEPARATOR = " > ";

/** Validates the source list and derives level, path and sibling position. */
export function buildCategoryRows(source: readonly CategorySource[]): CategoryRow[] {
  const byCode = new Map<string, CategorySource>();
  for (const c of source) {
    if (!CODE.test(c.code) || c.code.length > 64) throw new Error(`bad category code "${c.code}"`);
    if (byCode.has(c.code)) throw new Error(`duplicate category code "${c.code}"`);
    const name = c.name.trim();
    if (!name || name !== c.name || name.length > 120 || name.includes(">")) {
      throw new Error(`bad category name for "${c.code}"`);
    }
    byCode.set(c.code, c);
  }
  const rows = new Map<string, CategoryRow>();
  const siblings = new Map<string | null, number>();
  const resolveRow = (code: string, seen: readonly string[]): CategoryRow => {
    const done = rows.get(code);
    if (done) return done;
    if (seen.includes(code)) throw new Error(`category cycle: ${[...seen, code].join(" → ")}`);
    const c = byCode.get(code);
    if (!c) throw new Error(`unknown parent category "${code}" (from "${seen.at(-1) ?? ""}")`);
    const parent = c.parent ? resolveRow(c.parent, [...seen, code]) : null;
    const level = parent ? parent.level + 1 : 1;
    if (level > 10) throw new Error(`category "${code}" is nested too deeply`);
    const row: CategoryRow = {
      code,
      name: c.name,
      parentCode: parent?.code ?? null,
      level,
      path: parent ? `${parent.path}${PATH_SEPARATOR}${c.name}` : c.name,
      position: 0,
    };
    rows.set(code, row);
    return row;
  };
  for (const c of source) resolveRow(c.code, []);
  // Sibling order is file order, whichever order the tree was resolved in.
  return source.map((c) => {
    const row = rows.get(c.code);
    if (!row) throw new Error(`category "${c.code}" was not resolved`);
    const position = siblings.get(row.parentCode) ?? 0;
    siblings.set(row.parentCode, position + 1);
    return { ...row, position };
  });
}

export function readCategoryFile(file = CATEGORY_FILE): CategoryRow[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { categories?: unknown };
  if (!Array.isArray(parsed.categories)) throw new Error(`${file}: "categories" must be a list`);
  return buildCategoryRows(parsed.categories as CategorySource[]);
}

/** Upserts every row and deactivates codes that left the file. */
export async function syncProductCategories(
  db: PrismaClient,
  rows: readonly CategoryRow[] = readCategoryFile(),
): Promise<{ readonly active: number; readonly deactivated: number }> {
  return db.$transaction(
    async (tx) => {
      const depth = Math.max(0, ...rows.map((r) => r.level));
      for (let level = 1; level <= depth; level += 1) {
        const batch = rows.filter((r) => r.level === level);
        if (batch.length === 0) continue;
        await tx.$executeRaw`
          INSERT INTO "ProductCategory" (code, name, "parentCode", level, path, position, active, "updatedAt")
          SELECT code, name, parent, ${level}, path, position, true, now()
          FROM unnest(${batch.map((r) => r.code)}::text[], ${batch.map((r) => r.name)}::text[],
                      ${batch.map((r) => r.parentCode)}::text[], ${batch.map((r) => r.path)}::text[],
                      ${batch.map((r) => r.position)}::int[])
            AS s(code, name, parent, path, position)
          ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name, "parentCode" = EXCLUDED."parentCode", level = EXCLUDED.level,
            path = EXCLUDED.path, position = EXCLUDED.position, active = true, "updatedAt" = now()
          WHERE ("ProductCategory".name, "ProductCategory"."parentCode", "ProductCategory".level,
                 "ProductCategory".path, "ProductCategory".position, "ProductCategory".active)
            IS DISTINCT FROM (EXCLUDED.name, EXCLUDED."parentCode", EXCLUDED.level,
                 EXCLUDED.path, EXCLUDED.position, true)`;
      }
      const deactivated = await tx.$executeRaw`
        UPDATE "ProductCategory" SET active = false, "updatedAt" = now()
        WHERE active AND code <> ALL(${rows.map((r) => r.code)}::text[])`;
      return { active: rows.length, deactivated };
    },
    { timeout: 60_000 },
  );
}
