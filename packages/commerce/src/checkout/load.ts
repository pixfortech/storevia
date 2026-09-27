import type { TenantTx } from "@storevia/database";
import { storedAddress } from "./input";
import {
  priceCheckout,
  quoteHash,
  type CheckoutAddress,
  type PriceQuote,
  type PricingDiscount,
  type PricingInput,
  type PricingLine,
  type PricingShippingRate,
  type PricingTaxRate,
} from "./pricing";
import type { CheckoutStatus } from "./state";

// Loads what pricing needs, under the checkout role (ADR-0031 §9): the cart
// lines of this checkout (products that are no longer sellable are hidden by
// the role's policies and come back as unavailable), stock at online
// locations, the store's active shipping rates, tax configuration and the
// entered discount code. Batched: a fixed number of queries per checkout,
// whatever the number of lines.

export interface CheckoutRow {
  readonly id: string;
  readonly cartId: string;
  readonly status: CheckoutStatus;
  readonly email: string | null;
  readonly shippingAddress: CheckoutAddress | null;
  readonly billingAddress: CheckoutAddress | null;
  readonly shippingRateId: string | null;
  readonly discountCode: string | null;
  readonly quote: unknown;
  readonly pricingHash: string | null;
  readonly totalAmount: bigint;
  readonly currency: string;
  readonly expiresAt: Date;
  readonly completedOrderId: string | null;
  readonly expired: boolean;
}

interface RawCheckout {
  id: string;
  cartId: string;
  status: CheckoutStatus;
  email: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  shippingRateId: string | null;
  discountCode: string | null;
  quote: unknown;
  pricingHash: string | null;
  totalAmount: bigint;
  currency: string;
  expiresAt: Date;
  completedOrderId: string | null;
  expired: boolean;
}

const toRow = (r: RawCheckout): CheckoutRow => ({
  ...r,
  currency: r.currency.trim(),
  shippingAddress: storedAddress(r.shippingAddress),
  billingAddress: storedAddress(r.billingAddress),
});

/** The checkout this transaction was scoped to (by token or id), optionally locked. */
export async function loadCheckout(
  tx: TenantTx,
  by: { readonly tokenHash: string } | { readonly id: string },
  lock: boolean,
): Promise<CheckoutRow | null> {
  const tokenHash = "tokenHash" in by ? by.tokenHash : null;
  const id = "id" in by ? by.id : null;
  const rows = lock
    ? await tx.$queryRaw<RawCheckout[]>`
        SELECT id, "cartId", status::text AS status, email, "shippingAddress", "billingAddress",
          "shippingRateId", "discountCode", quote, "pricingHash", "totalAmount", currency,
          "expiresAt", "completedOrderId", "expiresAt" <= now() AS expired
        FROM "Checkout"
        WHERE (${tokenHash}::text IS NOT NULL AND "tokenHash" = ${tokenHash})
           OR (${id}::uuid IS NOT NULL AND id = ${id}::uuid)
        FOR UPDATE`
    : await tx.$queryRaw<RawCheckout[]>`
        SELECT id, "cartId", status::text AS status, email, "shippingAddress", "billingAddress",
          "shippingRateId", "discountCode", quote, "pricingHash", "totalAmount", currency,
          "expiresAt", "completedOrderId", "expiresAt" <= now() AS expired
        FROM "Checkout"
        WHERE (${tokenHash}::text IS NOT NULL AND "tokenHash" = ${tokenHash})
           OR (${id}::uuid IS NOT NULL AND id = ${id}::uuid)`;
  const row = rows[0];
  return row ? toRow(row) : null;
}

interface LineRow {
  variant_id: string;
  quantity: number;
  sellable: boolean;
  product_id: string | null;
  product_title: string | null;
  variant_title: string | null;
  sku: string | null;
  currency: string | null;
  price: bigint | null;
  taxable: boolean | null;
  requires_shipping: boolean | null;
  weight_grams: number | null;
  in_stock: boolean;
}

async function loadLines(tx: TenantTx, cartId: string): Promise<PricingLine[]> {
  const rows = await tx.$queryRaw<LineRow[]>`
    SELECT l."variantId" AS variant_id, l.quantity, (v.id IS NOT NULL) AS sellable,
      p.id AS product_id, p.title AS product_title, v.title AS variant_title, v.sku, v.currency,
      v."priceAmount" AS price, v.taxable, v."requiresShipping" AS requires_shipping,
      v."weightGrams" AS weight_grams,
      CASE
        WHEN v.id IS NULL THEN false
        WHEN ii.id IS NULL OR NOT ii.tracked OR v."inventoryPolicy" = 'CONTINUE' THEN true
        ELSE EXISTS (
          SELECT 1 FROM "InventoryLevel" lv
          JOIN "Location" loc ON loc.id = lv."locationId" AND loc."isActive"
            AND loc."fulfilsOnlineOrders" AND loc."deletedAt" IS NULL
          WHERE lv."inventoryItemId" = ii.id AND lv.available >= l.quantity)
      END AS in_stock
    FROM "CartLine" l
    LEFT JOIN "ProductVariant" v ON v.id = l."variantId"
    LEFT JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN "InventoryItem" ii ON ii."variantId" = v.id
    WHERE l."cartId" = ${cartId}::uuid
    ORDER BY l."createdAt", l.id`;
  return rows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id ?? r.variant_id,
    productTitle: r.product_title ?? "An item that is no longer available",
    variantTitle: r.variant_title ?? "",
    sku: r.sku,
    unitPrice: r.price ?? 0n,
    currency: r.currency?.trim() ?? "",
    quantity: r.quantity,
    taxable: r.taxable ?? false,
    requiresShipping: r.requires_shipping ?? true,
    weightGrams: r.weight_grams,
    sellable: r.sellable && r.product_id !== null,
    inStock: r.in_stock,
  }));
}

async function loadShippingRates(tx: TenantTx): Promise<PricingShippingRate[]> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      name: string;
      type: "FLAT" | "PRICE_BASED";
      amount: bigint;
      currency: string;
      min: bigint | null;
      max: bigint | null;
      countries: { countryCode: string; regionCodes: string[] }[];
    }[]
  >`
    SELECT r.id, r.name, r.type::text AS type, r.amount, r.currency,
      r."minSubtotalAmount" AS min, r."maxSubtotalAmount" AS max,
      coalesce((SELECT json_agg(json_build_object('countryCode', c."countryCode",
        'regionCodes', c."regionCodes")) FROM "ShippingZoneCountry" c WHERE c."zoneId" = r."zoneId"),
        '[]'::json) AS countries
    FROM "ShippingRate" r
    WHERE r.active AND r.type IN ('FLAT', 'PRICE_BASED')
    ORDER BY r.amount, r.name, r.id`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    amount: r.amount,
    currency: r.currency.trim(),
    minSubtotal: r.min,
    maxSubtotal: r.max,
    countries: r.countries.map((c) => ({
      countryCode: c.countryCode.trim(),
      regionCodes: c.regionCodes,
    })),
  }));
}

async function loadTax(
  tx: TenantTx,
  address: CheckoutAddress | null,
): Promise<{ inclusive: boolean; shipping: boolean; rates: PricingTaxRate[] }> {
  const config = await tx.$queryRaw<{ inclusive: boolean; shipping: boolean }[]>`
    SELECT "pricesIncludeTax" AS inclusive, "chargeTaxOnShipping" AS shipping
    FROM "TaxConfiguration"`;
  const rates = address
    ? await tx.$queryRaw<
        { id: string; name: string; country: string; region: string | null; ppm: number }[]
      >`
        SELECT id, name, "countryCode" AS country, "regionCode" AS region, "ratePpm" AS ppm
        FROM "TaxRate" WHERE "countryCode" = ${address.countryCode}
        ORDER BY priority, name, id`
    : [];
  return {
    inclusive: config[0]?.inclusive ?? false,
    shipping: config[0]?.shipping ?? false,
    rates: rates.map((r) => ({
      id: r.id,
      name: r.name,
      countryCode: r.country.trim(),
      regionCode: r.region,
      ratePpm: r.ppm,
    })),
  };
}

async function loadDiscount(tx: TenantTx, code: string | null): Promise<PricingDiscount | null> {
  if (!code) return null;
  const rows = await tx.$queryRaw<
    {
      id: string;
      code_id: string;
      code: string;
      title: string;
      type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
      bps: number | null;
      amount: bigint | null;
      currency: string | null;
      min: bigint | null;
      starts_at: Date;
      ends_at: Date | null;
      active: boolean;
      usage_limit: number | null;
      usage_count: number;
      mine: number;
    }[]
  >`
    SELECT d.id, c.id AS code_id, c.code, d.title, d.type::text AS type, d."percentageBps" AS bps,
      d.amount, d.currency, d."minSubtotalAmount" AS min, d."startsAt" AS starts_at,
      d."endsAt" AS ends_at, (d.status = 'ACTIVE') AS active, d."usageLimit" AS usage_limit,
      d."usageCount" AS usage_count,
      (SELECT count(*)::int FROM "DiscountRedemption" r
        WHERE r."discountId" = d.id AND r.status = 'RESERVED') AS mine
    FROM "DiscountCode" c JOIN "Discount" d ON d.id = c."discountId"
    WHERE c.code = ${code} AND d.method = 'CODE'`;
  const d = rows[0];
  if (!d || d.type === "FREE_SHIPPING") return null;
  return {
    id: d.id,
    codeId: d.code_id,
    code: d.code,
    title: d.title,
    type: d.type,
    percentageBps: d.bps,
    amount: d.amount,
    currency: d.currency?.trim() ?? null,
    minSubtotal: d.min,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    active: d.active,
    usageLimit: d.usage_limit,
    // This checkout's own reserved use doesn't count against it.
    usedByOthers: d.usage_count - d.mine,
  };
}

/** Everything priceCheckout needs for this checkout. */
export async function loadPricingInput(
  tx: TenantTx,
  checkout: CheckoutRow,
  currency: string,
): Promise<PricingInput> {
  const [lines, shippingRates, tax, discount] = [
    await loadLines(tx, checkout.cartId),
    await loadShippingRates(tx),
    await loadTax(tx, checkout.shippingAddress),
    await loadDiscount(tx, checkout.discountCode),
  ];
  return {
    currency,
    lines,
    email: checkout.email,
    address: checkout.shippingAddress,
    shippingRates,
    selectedRateId: checkout.shippingRateId,
    pricesIncludeTax: tax.inclusive,
    chargeTaxOnShipping: tax.shipping,
    taxRates: tax.rates,
    discountCode: checkout.discountCode,
    discount,
    now: new Date(),
  };
}

export interface PricedCheckout {
  readonly quote: PriceQuote;
  readonly hash: string;
}

/** Prices the checkout and stores the quote (only when it changed). */
export async function repriceCheckout(
  tx: TenantTx,
  checkout: CheckoutRow,
  currency: string,
): Promise<PricedCheckout> {
  const quote = priceCheckout(await loadPricingInput(tx, checkout, currency));
  const hash = quoteHash(quote);
  if (hash !== checkout.pricingHash) {
    await tx.$executeRaw`
      UPDATE "Checkout" SET quote = ${JSON.stringify(quote)}::jsonb, "pricingHash" = ${hash},
        "subtotalAmount" = ${BigInt(quote.subtotal)}, "discountAmount" = ${BigInt(quote.discountTotal)},
        "shippingAmount" = ${BigInt(quote.shippingTotal)}, "taxAmount" = ${BigInt(quote.taxTotal)},
        "totalAmount" = ${BigInt(quote.total)}, "pricedAt" = now(), "updatedAt" = now()
      WHERE id = ${checkout.id}::uuid`;
  }
  return { quote, hash };
}
