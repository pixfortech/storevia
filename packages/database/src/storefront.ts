import "server-only";
import { getClient } from "./client";
import type { TenantTx, TransactionOptions } from "./tenant";

/**
 * The storefront connection (storevia_storefront: NOBYPASSRLS, ADR-0028 §2).
 * It resolves hosts through app_storefront_resolve() and reads only the
 * scoped store's sellable rows. Importers: packages/domains (host
 * resolution) and @storevia/commerce/storefront (read models, carts) only.
 */
export function storefrontDb() {
  return getClient("storefront");
}

/**
 * The store a storefront request belongs to. Built only from the host
 * resolver's result, never from the path, a header, a cookie or a form.
 */
export interface StorefrontScope {
  readonly organisationId: string;
  readonly storeId: string;
}

export interface StorefrontTransactionOptions extends TransactionOptions {
  /** Read models run read-only; cart writes don't. */
  readonly readOnly?: boolean;
}

/**
 * Runs `fn` in a storefront-role transaction scoped to one store: the RLS
 * context is set transaction-locally, so it can never leak to another
 * request through the connection pool.
 */
export async function withStorefront<T>(
  scope: StorefrontScope,
  fn: (tx: TenantTx) => Promise<T>,
  options: StorefrontTransactionOptions = {},
): Promise<T> {
  return storefrontDb().$transaction(
    async (tx) => {
      if (options.readOnly) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SELECT
        set_config('app.organisation_id', ${scope.organisationId}, true),
        set_config('app.store_id', ${scope.storeId}, true)`;
      return fn(tx);
    },
    { timeout: options.timeoutMs ?? 10_000 },
  );
}
