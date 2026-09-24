import { getClient } from "./client";
import type { Prisma } from "./generated/prisma/client";

/** A transaction whose row-level-security context is already set. */
export type TenantTx = Prisma.TransactionClient;

/**
 * The RLS scope of a transaction. Only packages/tenancy builds these, from a
 * TenantContext it verified itself (docs/architecture/03-tenancy.md §5).
 */
export interface TenantScope {
  readonly organisationId: string | null;
  readonly storeId: string | null;
  readonly userId: string | null;
}

export interface TransactionOptions {
  readonly timeoutMs?: number;
}

/**
 * Runs `fn` in a transaction on the application role (NOBYPASSRLS) with the
 * RLS context set transaction-locally via set_config(..., true), so it can
 * never leak to another request through connection pooling.
 */
export async function withTenant<T>(
  scope: TenantScope,
  fn: (tx: TenantTx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return getClient("app").$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.organisation_id', ${scope.organisationId ?? ""}, true),
        set_config('app.store_id', ${scope.storeId ?? ""}, true),
        set_config('app.user_id', ${scope.userId ?? ""}, true)`;
      return fn(tx);
    },
    { timeout: options.timeoutMs ?? 10_000 },
  );
}
