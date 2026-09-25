import "server-only";
import { withTenant, type TenantTx } from "@storevia/database";
import {
  parsePublicId,
  requirePermission,
  scopeOf,
  type Permission,
  type StoreContext,
  type TenantContext,
} from "@storevia/tenancy";
import { DomainError, notFound, toTypeId, type IdKind } from "@storevia/types";
import { MoneyError, parseDecimal } from "./money";

// Shared plumbing for the commerce services. Every service takes a
// StoreContext issued by packages/tenancy (never a store id from the
// browser), checks a permission primitive, and runs in withTenant with the
// store's RLS scope, so a query can only ever see this store's rows.

export type { TenantTx };

export function requireStoreContext(ctx: TenantContext): StoreContext {
  if (ctx.kind !== "store") throw notFound();
  return ctx;
}

/**
 * The store may take catalogue writes: archived and suspended stores are
 * read-only. Business type is never consulted (ADR-0027 §15).
 */
export function requireWritableStore(ctx: StoreContext): void {
  if (ctx.storeStatus === "ARCHIVED") {
    throw new DomainError("CONFLICT", "This store is archived. Restore it to make changes.");
  }
  if (ctx.storeStatus === "SUSPENDED") {
    throw new DomainError(
      "CONFLICT",
      "This store is suspended, so its catalogue can't be changed.",
    );
  }
}

/** Permission + store scope + transaction, in one place. */
export async function inStore<T>(
  ctx: TenantContext,
  permission: Permission,
  fn: (tx: TenantTx, store: StoreContext) => Promise<T>,
  options: { readonly write?: boolean; readonly timeoutMs?: number } = {},
): Promise<T> {
  const store = requireStoreContext(ctx);
  requirePermission(store, permission);
  if (options.write) requireWritableStore(store);
  return withTenant(scopeOf(store), (tx) => fn(tx, store), {
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
}

export interface StoreSettings {
  readonly currency: string;
  readonly country: string;
}

export async function storeSettings(tx: TenantTx, storeId: string): Promise<StoreSettings> {
  const store = await tx.store.findUnique({
    where: { id: storeId },
    select: { currency: true, country: true },
  });
  if (!store) throw notFound();
  return store;
}

export const publicId = (kind: IdKind, uuid: string): string => toTypeId(kind, uuid);
export const publicIdOrNull = (kind: IdKind, uuid: string | null): string | null =>
  uuid === null ? null : toTypeId(kind, uuid);

/** A public id from input; malformed ids read as missing (404), like everywhere else. */
export const internalId = (kind: IdKind, value: unknown): string => parsePublicId(kind, value);

export function validationError(field: string, message: string): DomainError {
  return new DomainError("VALIDATION_FAILED", "Please correct the highlighted fields.", {
    [field]: message,
  });
}

export function conflict(message: string, fieldErrors?: Record<string, string>): DomainError {
  return new DomainError("CONFLICT", message, fieldErrors);
}

/** Parses a typed amount with the store currency's exponent ("999.50" INR → 99950n). */
export function parseMoneyField(field: string, value: string, currency: string): bigint {
  try {
    return parseDecimal(value, currency).amount;
  } catch (error) {
    if (error instanceof MoneyError) throw validationError(field, error.message);
    throw error;
  }
}

export function optionalMoneyField(
  field: string,
  value: string | null | undefined,
  currency: string,
): bigint | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseMoneyField(field, value, currency);
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

/** Serialises writes that must not interleave within one store (e.g. handle generation). */
export async function lockStoreKey(tx: TenantTx, storeId: string, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${storeId}:${key}`}, 0))`;
}
