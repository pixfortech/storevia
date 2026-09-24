import "server-only";
import { getClient } from "./client";

/**
 * The system connection (storevia_system: BYPASSRLS, narrow grants).
 * Allow-listed importers only (docs/architecture/02-monorepo.md §4 rule 4):
 * packages/auth and the invitation-token lookup in packages/tenancy.
 * Every query through this client is security-reviewed code.
 */
export function systemDb() {
  return getClient("system");
}
