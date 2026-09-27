// The store settings tab strip (client-safe): General, then the checkout
// settings that need `settings.manage`. Each tab is its own URL.
import type { LinkTab } from "@/components/catalogue/link-tabs";
import { storePath } from "./ids";

export type SettingsTab = "general" | "shipping" | "tax" | "payments";

/** A path under the store's settings, from its internal or public id. */
export const settingsPath = (storeId: string, suffix = "") =>
  storeId.startsWith("store_")
    ? `/s/${storeId}/settings${suffix}`
    : storePath(storeId, `/settings${suffix}`);

const TABS: readonly {
  readonly key: SettingsTab;
  readonly label: string;
  readonly suffix: string;
}[] = [
  { key: "general", label: "General", suffix: "" },
  { key: "shipping", label: "Shipping", suffix: "/shipping" },
  { key: "tax", label: "Tax", suffix: "/tax" },
  { key: "payments", label: "Payments", suffix: "/payments" },
];

export function settingsTabs(storeId: string, current: SettingsTab): LinkTab[] {
  return TABS.map((tab) => ({
    href: settingsPath(storeId, tab.suffix),
    label: tab.label,
    current: tab.key === current,
  }));
}
