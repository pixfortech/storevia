import "server-only";
import { marketingDb } from "@storevia/database/marketing";
import { loadPublicCatalogue, type PublicCatalogue } from "@storevia/entitlements/catalogue";
import { createLogger, errorFields } from "@storevia/observability";

const log = createLogger({ app: "marketing", component: "catalogue" });
const TTL_MS = 60_000;

let cache: { value: PublicCatalogue; expires: number } | undefined;

/**
 * The public plan catalogue, cached per process for a minute. Returns null if
 * the database is unreachable, so pricing shows an honest "unavailable"
 * message instead of stale or invented numbers.
 */
export async function publicCatalogue(): Promise<PublicCatalogue | null> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.value;
  try {
    const value = await loadPublicCatalogue(marketingDb());
    cache = { value, expires: now + TTL_MS };
    return value;
  } catch (error) {
    log.error("catalogue unavailable", errorFields(error));
    return null;
  }
}
