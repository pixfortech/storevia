import "server-only";
import { commerceLaunchChecks } from "@storevia/commerce";
import { siteLaunchChecks } from "@storevia/site-admin";
import type { LaunchReadinessCheck } from "@storevia/tenancy";
import { productsPath } from "./catalogue";
import { storePath } from "./ids";
import { settingsPath } from "./settings-tabs";

// The launch checks for one store (final pass, DB-1), composed from the
// commerce and page-system checks. Going live enforces them (tenancy's
// setStorefrontLive); the settings page and the store home show them.

/** Every launch check for the store (its internal id), run in the caller's transaction. */
export function storeLaunchChecks(storeId: string): LaunchReadinessCheck {
  return async (tx) => [
    ...(await commerceLaunchChecks(tx, storeId)),
    ...(await siteLaunchChecks(tx, storeId)),
  ];
}

/** Where the merchant fixes a check. */
export function launchCheckHref(storeId: string, key: string): string | null {
  switch (key) {
    case "payments":
      return settingsPath(storeId, "/payments");
    case "products":
      return productsPath(storeId);
    case "shipping":
      return settingsPath(storeId, "/shipping");
    case "identity":
      return `${settingsPath(storeId)}#general`;
    case "seller":
      return `${settingsPath(storeId)}#seller`;
    case "policies":
      return settingsPath(storeId, "/policies");
    case "home":
      return storePath(storeId, "/pages");
    default:
      return null;
  }
}
