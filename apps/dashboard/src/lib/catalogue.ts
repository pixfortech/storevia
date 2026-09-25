// Catalogue presentation helpers (client-safe): paths, status badges, money
// and stock wording. They only format what the commerce services return.
import { format, fromJSON, type MoneyJson } from "@storevia/commerce/money";
import type { BadgeTone } from "@storevia/ui/surfaces";
import { storePath } from "./ids";

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export const PRODUCT_STATUS: Readonly<
  Record<ProductStatus, { label: string; tone: BadgeTone; help: string }>
> = {
  ACTIVE: { label: "Active", tone: "success", help: "Ready to sell once your storefront is live." },
  DRAFT: { label: "Draft", tone: "neutral", help: "Only your team can see it." },
  ARCHIVED: {
    label: "Archived",
    tone: "warning",
    help: "Hidden and not counted against your plan.",
  },
};

/** A store path from its internal id or its public id ("store_…"), for server and client code alike. */
const inStore = (storeId: string, suffix: string) =>
  storeId.startsWith("store_") ? `/s/${storeId}${suffix}` : storePath(storeId, suffix);

export const productsPath = (storeId: string, suffix = "") =>
  inStore(storeId, `/products${suffix}`);
export const productPath = (storeId: string, productId: string) =>
  productsPath(storeId, `/${productId}`);
export const collectionsPath = (storeId: string, suffix = "") =>
  productsPath(storeId, `/collections${suffix}`);
export const inventoryPath = (storeId: string, suffix = "") =>
  inStore(storeId, `/inventory${suffix}`);
export const mediaPath = (storeId: string) => inStore(storeId, "/media");

/** "₹999.50" in the store's currency, with its own decimals. */
export function formatMoney(value: MoneyJson | null | undefined, locale = "en-IN"): string {
  if (!value) return "—";
  try {
    return format(fromJSON(value), locale);
  } catch {
    return `${value.currency} ${value.amount}`;
  }
}

export function formatPriceRange(
  min: MoneyJson | null,
  max: MoneyJson | null,
  locale = "en-IN",
): string {
  if (!min) return "—";
  if (!max || max.amount === min.amount) return formatMoney(min, locale);
  return `${formatMoney(min, locale)} – ${formatMoney(max, locale)}`;
}

export interface StockSummaryInput {
  readonly trackedVariants: number;
  readonly available: number;
  readonly outOfStockVariants: number;
  readonly lowStockVariants: number;
  readonly variantCount: number;
}

/** Stock in words, with a tone. Never colour alone. */
export function stockSummary(item: StockSummaryInput): { text: string; tone: BadgeTone | null } {
  if (item.trackedVariants === 0) return { text: "Not tracked", tone: null };
  const units = `${item.available.toLocaleString("en-IN")} in stock`;
  const across = item.variantCount > 1 ? ` across ${String(item.variantCount)} variants` : "";
  if (item.outOfStockVariants > 0) {
    return item.outOfStockVariants === item.trackedVariants
      ? { text: "Out of stock", tone: "danger" }
      : { text: `${units}${across} · ${String(item.outOfStockVariants)} out`, tone: "warning" };
  }
  if (item.lowStockVariants > 0) return { text: `${units}${across} · low`, tone: "warning" };
  return { text: `${units}${across}`, tone: null };
}

export const MOVEMENT_REASON_LABELS: Readonly<Record<string, string>> = {
  INITIAL: "Initial stock",
  MANUAL_ADJUSTMENT: "Adjustment",
  RESTOCK: "Restock",
  CORRECTION: "Correction",
  TRANSFER: "Transfer",
};

export const ADJUSTMENT_REASONS = [
  { value: "RESTOCK", label: "Restock", description: "New stock arrived." },
  { value: "CORRECTION", label: "Correction", description: "A count found a different number." },
  {
    value: "MANUAL_ADJUSTMENT",
    label: "Other adjustment",
    description: "Damage, samples, anything else.",
  },
] as const;

/** The Inventory area's sections. */
export function inventoryTabs(storeId: string, current: "stock" | "locations" | "history") {
  return [
    { href: inventoryPath(storeId), label: "Stock", current: current === "stock" },
    {
      href: inventoryPath(storeId, "/locations"),
      label: "Locations",
      current: current === "locations",
    },
    { href: inventoryPath(storeId, "/history"), label: "History", current: current === "history" },
  ];
}
