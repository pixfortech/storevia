import "server-only";
import { getClient } from "./client";

/** Platform-admin connection (storevia_platform: BYPASSRLS, SELECT grants only). */
export function platformDb() {
  return getClient("platform");
}
