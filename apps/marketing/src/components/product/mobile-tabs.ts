// The phone mockup's bottom bar, chosen the way the dashboard chooses it
// (apps/dashboard/src/components/shell/navigation.ts): Home, the business
// type's main area, the Create button, Website (or the next phone area) and
// More. Pure, so the choice is unit-tested against the real definitions.
import {
  BUSINESS_TYPE_DEFINITIONS,
  type AreaKey,
  type BusinessType,
} from "@storevia/tenancy/business-types";

export interface MobileTabs {
  /** The tabs before the centre Create button. */
  readonly start: readonly AreaKey[];
  /** The tab after it (More always follows). */
  readonly end: readonly AreaKey[];
}

export function mobileTabs(type: BusinessType): MobileTabs {
  const { navigation, mobilePrimary } = BUSINESS_TYPE_DEFINITIONS[type];
  const primary = mobilePrimary.find((key) => key !== "home" && key !== "website");
  const fourth = navigation.includes("website")
    ? "website"
    : mobilePrimary.find((key) => key !== "home" && key !== primary);
  return {
    start: ["home", ...(primary ? [primary] : [])],
    end: fourth ? [fourth] : [],
  };
}
