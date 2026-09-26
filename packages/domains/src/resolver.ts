import "server-only";
import { storefrontDb } from "@storevia/database/storefront";

// Host resolution (06-storefront.md §2, ADR-0028 §2–§4): the storefront's only
// cross-tenant read, through app_storefront_resolve(). Results (including
// "no store") are cached in process for a short time and dropped early by
// `domain:{hostname}` invalidation events.

export type StoreStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type OrganisationStatus = "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED";

export interface ResolvedStore {
  readonly storeId: string;
  readonly organisationId: string;
  readonly storeStatus: StoreStatus;
  readonly organisationStatus: OrganisationStatus;
  /** The hostname that was resolved (normalised). */
  readonly hostname: string;
  readonly isPrimary: boolean;
  /** The store's ACTIVE primary hostname, or null when it has none. */
  readonly primaryHostname: string | null;
  readonly name: string;
  readonly currency: string;
  readonly locale: string;
  readonly country: string;
}

/** What a resolved store may show (ADR-0028 §3). */
export type StoreAvailability = "live" | "coming-soon" | "unavailable";

export function storeAvailability(store: ResolvedStore): StoreAvailability {
  if (store.organisationStatus !== "ACTIVE") return "unavailable";
  switch (store.storeStatus) {
    case "ACTIVE":
      return "live";
    case "DRAFT":
      return "coming-soon";
    case "SUSPENDED":
    case "ARCHIVED":
      return "unavailable";
  }
}

/** The host requests should be served on, or null when this one is canonical. */
export function canonicalRedirectHost(store: ResolvedStore): string | null {
  if (store.isPrimary || !store.primaryHostname) return null;
  return store.primaryHostname === store.hostname ? null : store.primaryHostname;
}

interface Row {
  store_id: string;
  organisation_id: string;
  store_status: StoreStatus;
  organisation_status: OrganisationStatus;
  hostname: string;
  is_primary: boolean;
  primary_hostname: string | null;
  store_name: string;
  currency: string;
  locale: string;
  country: string;
}

const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;
type HostCache = Map<string, { readonly value: ResolvedStore | null; readonly expires: number }>;
// Process-wide: the request proxy and route handlers may be bundled as
// separate module instances, and an invalidation must reach both.
const globalCache = globalThis as typeof globalThis & { __storeviaHostCache?: HostCache };
const cache: HostCache = (globalCache.__storeviaHostCache ??= new Map());

/**
 * The store served at a normalised hostname, or null. Pass only the output
 * of `normaliseHostname`: anything else simply resolves to nothing.
 */
export async function resolveStoreHost(
  hostname: string,
  now = Date.now(),
): Promise<ResolvedStore | null> {
  const cached = cache.get(hostname);
  if (cached && cached.expires > now) return cached.value;
  const rows = await storefrontDb().$queryRaw<Row[]>`
    SELECT * FROM app_storefront_resolve(${hostname})`;
  const row = rows[0];
  const value: ResolvedStore | null = row
    ? {
        storeId: row.store_id,
        organisationId: row.organisation_id,
        storeStatus: row.store_status,
        organisationStatus: row.organisation_status,
        hostname: row.hostname,
        isPrimary: row.is_primary,
        primaryHostname: row.primary_hostname,
        name: row.store_name,
        currency: row.currency.trim(),
        locale: row.locale,
        country: row.country.trim(),
      }
    : null;
  if (cache.size >= MAX_ENTRIES) {
    // Maps iterate in insertion order: drop the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.delete(hostname);
  cache.set(hostname, { value, expires: now + TTL_MS });
  return value;
}

/** Drops cached resolutions (one hostname, or everything). */
export function invalidateHostCache(hostname?: string): void {
  if (hostname === undefined) cache.clear();
  else cache.delete(hostname);
}
