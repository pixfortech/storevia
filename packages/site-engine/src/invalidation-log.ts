import "server-only";
import { storefrontDb } from "@storevia/database/storefront";
import type { InvalidationRow, InvalidationSource } from "./invalidation-feed";

// The StorefrontInvalidation log, read with the storefront role (SELECT
// only; the worker writes it). See invalidation-feed.ts.

/** Rows returned per read; a feed further behind than this starts clean. */
export const INVALIDATION_READ_LIMIT = 2_000;

export const invalidationLog: InvalidationSource = {
  async latest() {
    const rows = await storefrontDb().$queryRaw<{ id: bigint | null }[]>`
      SELECT max(id) AS id FROM "StorefrontInvalidation"`;
    return rows[0]?.id ?? null;
  },
  async since(after, overlapMs) {
    return storefrontDb().$queryRaw<InvalidationRow[]>`
      SELECT id, tags, "createdAt" FROM "StorefrontInvalidation"
      WHERE id > ${after}
         OR "createdAt" > now() - make_interval(secs => ${overlapMs / 1000})
      ORDER BY id
      LIMIT ${INVALIDATION_READ_LIMIT}`;
  },
};
