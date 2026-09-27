import "server-only";
import { withTenant, type TenantTx } from "@storevia/database";
import { assertFeature } from "@storevia/entitlements";
import {
  parsePublicId,
  requirePermission,
  scopeOf,
  type Permission,
  type StoreContext,
  type TenantContext,
} from "@storevia/tenancy";
import { DomainError, notFound } from "@storevia/types";

// Shared plumbing for the site services (ADR-0030 §5). Every service takes
// a StoreContext issued by packages/tenancy (never a store id from the
// browser), checks a permission primitive, and runs in withTenant with the
// store's RLS scope, so a query can only ever see this store's rows.

export type { TenantTx };

export function requireStoreContext(ctx: TenantContext): StoreContext {
  if (ctx.kind !== "store") throw notFound();
  return ctx;
}

/** Archived and suspended stores are read-only. */
export function requireWritableStore(ctx: StoreContext): void {
  if (ctx.storeStatus === "ARCHIVED") {
    throw new DomainError("CONFLICT", "This store is archived. Restore it to make changes.");
  }
  if (ctx.storeStatus === "SUSPENDED") {
    throw new DomainError("CONFLICT", "This store is suspended, so its site can't be changed.");
  }
}

/** Permission + store scope + transaction; writes also need the plan's page builder. */
export async function inSite<T>(
  ctx: TenantContext,
  permission: Permission,
  fn: (tx: TenantTx, store: StoreContext) => Promise<T>,
  options: { readonly write?: boolean } = {},
): Promise<T> {
  const store = requireStoreContext(ctx);
  requirePermission(store, permission);
  if (options.write) requireWritableStore(store);
  return withTenant(scopeOf(store), async (tx) => {
    if (options.write) await assertFeature(tx, store.organisationId, "visual_builder");
    return fn(tx, store);
  });
}

/** A public id from input; malformed ids read as missing (404). */
export const internalId = (kind: "page", value: unknown): string => parsePublicId(kind, value);

export function conflict(message: string): DomainError {
  return new DomainError("CONFLICT", message);
}

export function invalid(message: string, fieldErrors?: Record<string, string>): DomainError {
  return new DomainError("VALIDATION_FAILED", message, fieldErrors ?? { document: message });
}

/** The Postgres error code behind a Prisma error, when there is one. */
export function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as {
    code?: unknown;
    meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };
  const candidates = [e.meta?.code, e.meta?.driverAdapterError?.cause?.originalCode, e.code];
  for (const c of candidates) if (typeof c === "string" && /^[0-9A-Z]{5}$/.test(c)) return c;
  return undefined;
}

/** Serialises writes that must not interleave within one store. */
export async function lockStoreKey(tx: TenantTx, storeId: string, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${storeId}:${key}`}, 0))`;
}
