import "server-only";
import { getClient } from "./client";
import type { TenantTx, TransactionOptions } from "./tenant";

/**
 * The checkout connection (storevia_checkout: NOBYPASSRLS, ADR-0031 §9).
 * Its row policies show one store and one checkout at a time. Importers:
 * @storevia/commerce checkout and payment services only.
 */
export function checkoutDb() {
  return getClient("checkout");
}

/**
 * What a checkout transaction may see. The store comes from the host
 * resolver (or a verified payment connection), never from the browser;
 * `checkoutId` is set only once the checkout's token or a verified provider
 * reference identified it. Token values are SHA-256 hashes.
 */
export interface CheckoutScope {
  readonly organisationId: string;
  readonly storeId: string;
  readonly checkoutId?: string | null;
  readonly checkoutTokenHash?: string | null;
  readonly cartTokenHash?: string | null;
  /** A shopper's order-access token hash: opens that one order (read-only, plus messages). */
  readonly orderAccessHash?: string | null;
}

/**
 * Runs `fn` in a checkout-role transaction. The RLS context is set
 * transaction-locally, so it can never leak to another request through the
 * connection pool. `setCheckout` narrows the scope to a checkout once the
 * transaction has identified it (e.g. by its token).
 */
export async function withCheckout<T>(
  scope: CheckoutScope,
  fn: (tx: TenantTx, setCheckout: (checkoutId: string) => Promise<void>) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return checkoutDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.organisation_id', ${scope.organisationId}, true),
        set_config('app.store_id', ${scope.storeId}, true),
        set_config('app.checkout_id', ${scope.checkoutId ?? ""}, true),
        set_config('app.checkout_token', ${scope.checkoutTokenHash ?? ""}, true),
        set_config('app.cart_token', ${scope.cartTokenHash ?? ""}, true),
        set_config('app.order_access', ${scope.orderAccessHash ?? ""}, true)`;
      const setCheckout = async (checkoutId: string) => {
        await tx.$executeRaw`SELECT set_config('app.checkout_id', ${checkoutId}, true)`;
      };
      return fn(tx, setCheckout);
    },
    { timeout: options.timeoutMs ?? 15_000 },
  );
}
