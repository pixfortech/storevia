import "server-only";
import { getClient } from "./client";

/**
 * The marketing-site connection (storevia_marketing: NOBYPASSRLS, read-only
 * on the plan catalogue, plus its own "marketing:" rate-limit rows through a
 * row-level policy). ADR-0025. Importers: apps/marketing only.
 */
export function marketingDb() {
  return getClient("marketing");
}
