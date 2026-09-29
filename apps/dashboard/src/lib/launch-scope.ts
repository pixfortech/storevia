// What a merchant may choose at launch (DB-2), checked by the server actions
// that create a store or change its type. The tenancy service still accepts
// every business type (existing stores, seeds and tests use them); the
// dashboard offers and accepts only the launch types for new choices.
import { isLaunchBusinessType, type BusinessType } from "@storevia/tenancy/business-types";
import { validationFailed } from "@storevia/types";

export const LAUNCH_BUSINESS_TYPE_MESSAGE =
  "Storevia supports online stores for now. Choose Online store.";

/**
 * The business type from a form: the launch default when none was sent, a
 * launch type, or the store's current type (an existing store may keep a
 * type that is no longer offered). Anything else is a validation error.
 */
export function launchBusinessType(
  value: FormDataEntryValue | null,
  current?: BusinessType,
): string {
  if (value === null || value === "") return current ?? "ECOMMERCE";
  if (typeof value === "string" && (isLaunchBusinessType(value) || value === current)) {
    return value;
  }
  throw validationFailed({ businessType: LAUNCH_BUSINESS_TYPE_MESSAGE });
}
