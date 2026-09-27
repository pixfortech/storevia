import { createHash } from "node:crypto";
import { allocate, divideRounded, money } from "../money";

// Server-authoritative checkout pricing (09-commerce §4, ADR-0031 §2). A
// pure function over a snapshot loaded from the database: the browser
// supplies selections (quantities come from the cart; the address, rate id
// and code from checkout forms), never amounts. Rounding rules:
//
//   percentage discount   subtotal × bps / 10 000, half-up, capped at subtotal
//   fixed discount        min(amount, subtotal)
//   discount allocation   largest remainder by line subtotal (sums exactly)
//   tax, exclusive        per line and rate: base × ppm / 10⁶, half-even
//   tax, inclusive        per line: base × P / (10⁶ + P), half-even (P = sum
//                         of the rates), split across rates by ppm (largest
//                         remainder)
//   shipping tax          as a line, when the store taxes shipping
//
// The quote is JSON-ready (amounts as integer strings) and hashed over its
// canonical serialisation; orders copy it, never recompute it.

export interface CheckoutAddress {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string | null;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly regionCode: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly phone: string | null;
}

export interface PricingLine {
  readonly variantId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku: string | null;
  readonly unitPrice: bigint;
  readonly currency: string;
  readonly quantity: number;
  readonly taxable: boolean;
  readonly requiresShipping: boolean;
  readonly weightGrams: number | null;
  /** The product is active and the variant exists (checkout role policies). */
  readonly sellable: boolean;
  /** Advisory: tracked DENY variants have the quantity somewhere. The reservation decides. */
  readonly inStock: boolean;
}

export interface PricingShippingRate {
  readonly id: string;
  readonly name: string;
  readonly type: "FLAT" | "PRICE_BASED";
  readonly amount: bigint;
  readonly currency: string;
  readonly minSubtotal: bigint | null;
  readonly maxSubtotal: bigint | null;
  /** The countries (and optional regions) the rate's zone covers. */
  readonly countries: readonly {
    readonly countryCode: string;
    readonly regionCodes: readonly string[];
  }[];
}

export interface PricingTaxRate {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly regionCode: string | null;
  readonly ratePpm: number;
}

export interface PricingDiscount {
  readonly id: string;
  readonly codeId: string;
  readonly code: string;
  readonly title: string;
  readonly type: "PERCENTAGE" | "FIXED_AMOUNT";
  readonly percentageBps: number | null;
  readonly amount: bigint | null;
  readonly currency: string | null;
  readonly minSubtotal: bigint | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly active: boolean;
  readonly usageLimit: number | null;
  /** Uses taken by others (this checkout's own reserved use excluded). */
  readonly usedByOthers: number;
}

export interface PricingInput {
  readonly currency: string;
  readonly lines: readonly PricingLine[];
  readonly email: string | null;
  readonly address: CheckoutAddress | null;
  readonly shippingRates: readonly PricingShippingRate[];
  readonly selectedRateId: string | null;
  readonly pricesIncludeTax: boolean;
  readonly chargeTaxOnShipping: boolean;
  readonly taxRates: readonly PricingTaxRate[];
  /** What the shopper entered (upper-cased), and what it resolved to. */
  readonly discountCode: string | null;
  readonly discount: PricingDiscount | null;
  readonly now: Date;
}

export type DiscountProblem = "NOT_FOUND" | "NOT_STARTED" | "EXPIRED" | "USED_UP" | "MINIMUM";

export type CheckoutProblem =
  | "EMPTY"
  | "UNAVAILABLE"
  | "EMAIL"
  | "ADDRESS"
  | "SHIPPING_UNAVAILABLE"
  | "SHIPPING"
  | "DISCOUNT"
  | "ZERO_TOTAL";

export interface QuoteTaxLine {
  readonly rateId: string;
  readonly name: string;
  readonly ratePpm: number;
  readonly amount: string;
}

export interface QuoteLine {
  readonly variantId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly subtotal: string;
  readonly discount: string;
  readonly tax: string;
  readonly total: string;
  readonly taxable: boolean;
  readonly requiresShipping: boolean;
  readonly weightGrams: number | null;
  readonly taxLines: readonly QuoteTaxLine[];
}

export interface QuoteUnavailableLine {
  readonly variantId: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly quantity: number;
  readonly reason: "UNAVAILABLE" | "SOLD_OUT";
}

export interface QuoteShippingOption {
  readonly rateId: string;
  readonly name: string;
  readonly amount: string;
}

export interface PriceQuote {
  readonly version: 1;
  readonly currency: string;
  readonly pricesIncludeTax: boolean;
  readonly lines: readonly QuoteLine[];
  readonly unavailable: readonly QuoteUnavailableLine[];
  readonly requiresShipping: boolean;
  readonly shippingOptions: readonly QuoteShippingOption[];
  readonly shipping: {
    readonly rateId: string;
    readonly name: string;
    readonly amount: string;
    readonly tax: string;
    readonly taxLines: readonly QuoteTaxLine[];
  } | null;
  readonly discount: {
    readonly discountId: string;
    readonly codeId: string;
    readonly code: string;
    readonly title: string;
    readonly type: "PERCENTAGE" | "FIXED_AMOUNT";
    readonly percentageBps: number | null;
    readonly amount: string;
  } | null;
  readonly discountCode: string | null;
  readonly discountProblem: DiscountProblem | null;
  readonly taxLines: readonly QuoteTaxLine[];
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly shippingTotal: string;
  readonly taxTotal: string;
  readonly total: string;
  /** What still stands between the shopper and payment (empty = ready). */
  readonly problems: readonly CheckoutProblem[];
}

const ZERO = 0n;
const sumOf = (values: readonly bigint[]) => values.reduce((a, b) => a + b, ZERO);

/** Rates that apply to an address: the country's, plus the region's when the address names one. */
export function applicableTaxRates(
  rates: readonly PricingTaxRate[],
  address: CheckoutAddress | null,
): PricingTaxRate[] {
  if (!address) return [];
  return rates
    .filter(
      (r) =>
        r.countryCode === address.countryCode &&
        (r.regionCode === null || r.regionCode === address.regionCode),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Tax on one base amount, per rate (see the rounding rules above). */
function taxFor(
  base: bigint,
  rates: readonly PricingTaxRate[],
  inclusive: boolean,
  currency: string,
): QuoteTaxLine[] {
  if (base <= ZERO || rates.length === 0) return [];
  if (!inclusive) {
    return rates.map((r) => ({
      rateId: r.id,
      name: r.name,
      ratePpm: r.ratePpm,
      amount: divideRounded(base * BigInt(r.ratePpm), 1_000_000n, "half-even").toString(),
    }));
  }
  const total = sumOf(rates.map((r) => BigInt(r.ratePpm)));
  if (total === ZERO) {
    return rates.map((r) => ({ rateId: r.id, name: r.name, ratePpm: r.ratePpm, amount: "0" }));
  }
  const tax = divideRounded(base * total, 1_000_000n + total, "half-even");
  const parts = allocate(
    money(tax, currency),
    rates.map((r) => r.ratePpm),
  );
  return rates.map((r, i) => ({
    rateId: r.id,
    name: r.name,
    ratePpm: r.ratePpm,
    amount: (parts[i]?.amount ?? ZERO).toString(),
  }));
}

function evaluateDiscount(
  input: PricingInput,
  subtotal: bigint,
): { amount: bigint; problem: DiscountProblem | null } {
  if (!input.discountCode) return { amount: ZERO, problem: null };
  const d = input.discount;
  if (!d || !d.active || (d.type === "FIXED_AMOUNT" && d.currency !== input.currency)) {
    return { amount: ZERO, problem: "NOT_FOUND" };
  }
  if (d.startsAt > input.now) return { amount: ZERO, problem: "NOT_STARTED" };
  if (d.endsAt && d.endsAt <= input.now) return { amount: ZERO, problem: "EXPIRED" };
  if (d.usageLimit !== null && d.usedByOthers >= d.usageLimit) {
    return { amount: ZERO, problem: "USED_UP" };
  }
  if (d.minSubtotal !== null && subtotal < d.minSubtotal) {
    return { amount: ZERO, problem: "MINIMUM" };
  }
  const raw =
    d.type === "PERCENTAGE"
      ? divideRounded(subtotal * BigInt(d.percentageBps ?? 0), 10_000n, "half-up")
      : (d.amount ?? ZERO);
  return { amount: raw > subtotal ? subtotal : raw, problem: null };
}

function rateApplies(rate: PricingShippingRate, address: CheckoutAddress, merchandise: bigint) {
  const covers = rate.countries.some(
    (c) =>
      c.countryCode === address.countryCode &&
      (c.regionCodes.length === 0 ||
        (address.regionCode !== null && c.regionCodes.includes(address.regionCode))),
  );
  if (!covers) return false;
  if (rate.type === "PRICE_BASED") {
    if (rate.minSubtotal !== null && merchandise < rate.minSubtotal) return false;
    if (rate.maxSubtotal !== null && merchandise > rate.maxSubtotal) return false;
  }
  return true;
}

export function priceCheckout(input: PricingInput): PriceQuote {
  const currency = input.currency;
  const priced = input.lines.filter((l) => l.sellable && l.currency === currency && l.inStock);
  const unavailable: QuoteUnavailableLine[] = input.lines
    .filter((l) => !priced.includes(l))
    .map((l) => ({
      variantId: l.variantId,
      productTitle: l.productTitle,
      variantTitle: l.variantTitle,
      quantity: l.quantity,
      reason: l.sellable && l.currency === currency ? "SOLD_OUT" : "UNAVAILABLE",
    }));

  const lineSubtotals = priced.map((l) => l.unitPrice * BigInt(l.quantity));
  const subtotal = sumOf(lineSubtotals);

  // Discount, allocated across lines by subtotal.
  const discountEval = evaluateDiscount(input, subtotal);
  const discountAmount = discountEval.amount;
  const lineDiscounts =
    discountAmount > ZERO && subtotal > ZERO
      ? allocate(money(discountAmount, currency), lineSubtotals).map((m) => m.amount)
      : priced.map(() => ZERO);
  const merchandise = subtotal - discountAmount;

  // Tax per line.
  const rates = applicableTaxRates(input.taxRates, input.address);
  const inclusive = input.pricesIncludeTax;
  const lines: QuoteLine[] = priced.map((l, i) => {
    const lineSubtotal = lineSubtotals[i] ?? ZERO;
    const lineDiscount = lineDiscounts[i] ?? ZERO;
    const base = lineSubtotal - lineDiscount;
    const taxLines = l.taxable ? taxFor(base, rates, inclusive, currency) : [];
    const tax = sumOf(taxLines.map((t) => BigInt(t.amount)));
    return {
      variantId: l.variantId,
      productId: l.productId,
      productTitle: l.productTitle,
      variantTitle: l.variantTitle,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toString(),
      subtotal: lineSubtotal.toString(),
      discount: lineDiscount.toString(),
      tax: tax.toString(),
      total: (base + (inclusive ? ZERO : tax)).toString(),
      taxable: l.taxable,
      requiresShipping: l.requiresShipping,
      weightGrams: l.weightGrams,
      taxLines,
    };
  });

  // Shipping.
  const requiresShipping = priced.some((l) => l.requiresShipping);
  const options: QuoteShippingOption[] =
    requiresShipping && input.address
      ? input.shippingRates
          .filter(
            (r) =>
              r.currency === currency &&
              input.address &&
              rateApplies(r, input.address, merchandise),
          )
          .sort((a, b) =>
            a.amount !== b.amount ? (a.amount < b.amount ? -1 : 1) : a.name.localeCompare(b.name),
          )
          .map((r) => ({ rateId: r.id, name: r.name, amount: r.amount.toString() }))
      : [];
  const chosen = requiresShipping
    ? (options.find((o) => o.rateId === input.selectedRateId) ?? null)
    : null;
  const shippingAmount = chosen ? BigInt(chosen.amount) : ZERO;
  const shippingTaxLines =
    chosen && input.chargeTaxOnShipping ? taxFor(shippingAmount, rates, inclusive, currency) : [];
  const shippingTax = sumOf(shippingTaxLines.map((t) => BigInt(t.amount)));

  // Totals, and tax lines aggregated per rate for display.
  const taxTotal = sumOf(lines.map((l) => BigInt(l.tax))) + shippingTax;
  const total = merchandise + shippingAmount + (inclusive ? ZERO : taxTotal);
  const byRate = new Map<string, QuoteTaxLine>();
  for (const t of [...lines.flatMap((l) => l.taxLines), ...shippingTaxLines]) {
    const prior = byRate.get(t.rateId);
    byRate.set(t.rateId, {
      ...t,
      amount: (BigInt(prior?.amount ?? "0") + BigInt(t.amount)).toString(),
    });
  }

  const problems: CheckoutProblem[] = [];
  if (input.lines.length === 0) problems.push("EMPTY");
  if (unavailable.length > 0) problems.push("UNAVAILABLE");
  if (!input.email) problems.push("EMAIL");
  if (!input.address) problems.push("ADDRESS");
  if (requiresShipping && input.address && options.length === 0)
    problems.push("SHIPPING_UNAVAILABLE");
  else if (requiresShipping && input.address && !chosen) problems.push("SHIPPING");
  if (discountEval.problem) problems.push("DISCOUNT");
  if (input.lines.length > 0 && total <= ZERO) problems.push("ZERO_TOTAL");

  const d = input.discount;
  return {
    version: 1,
    currency,
    pricesIncludeTax: inclusive,
    lines,
    unavailable,
    requiresShipping,
    shippingOptions: options,
    shipping: chosen
      ? {
          rateId: chosen.rateId,
          name: chosen.name,
          amount: chosen.amount,
          tax: shippingTax.toString(),
          taxLines: shippingTaxLines,
        }
      : null,
    discount:
      d && discountAmount > ZERO
        ? {
            discountId: d.id,
            codeId: d.codeId,
            code: d.code,
            title: d.title,
            type: d.type,
            percentageBps: d.percentageBps,
            amount: discountAmount.toString(),
          }
        : null,
    discountCode: input.discountCode,
    discountProblem: discountEval.problem,
    taxLines: [...byRate.values()],
    subtotal: subtotal.toString(),
    discountTotal: discountAmount.toString(),
    shippingTotal: shippingAmount.toString(),
    taxTotal: taxTotal.toString(),
    total: total.toString(),
    problems,
  };
}

/** SHA-256 over the quote's canonical serialisation (key order is fixed by construction). */
export function quoteHash(quote: PriceQuote): string {
  return createHash("sha256").update(JSON.stringify(quote)).digest("hex");
}

export type QuoteChange =
  | "QUANTITY_CHANGED"
  | "ITEM_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "DISCOUNT_CHANGED"
  | "SHIPPING_CHANGED";

/**
 * Why a quote differs from the one the shopper confirmed, most specific
 * first. Null when they are identical.
 */
export function describeQuoteChange(
  confirmed: PriceQuote | null,
  current: PriceQuote,
): QuoteChange | null {
  if (confirmed && quoteHash(confirmed) === quoteHash(current)) return null;
  if (!confirmed) return "PRICE_CHANGED";
  if (current.unavailable.length > confirmed.unavailable.length) return "ITEM_UNAVAILABLE";
  const key = (l: { variantId: string; quantity: number }) =>
    `${l.variantId}:${String(l.quantity)}`;
  const before = confirmed.lines.map(key).sort().join();
  const after = current.lines.map(key).sort().join();
  if (before !== after) {
    const ids = (q: PriceQuote) =>
      q.lines
        .map((l) => l.variantId)
        .sort()
        .join();
    return ids(confirmed) === ids(current) ? "QUANTITY_CHANGED" : "ITEM_UNAVAILABLE";
  }
  const prices = (q: PriceQuote) =>
    q.lines
      .map((l) => `${l.variantId}:${l.unitPrice}`)
      .sort()
      .join();
  if (prices(confirmed) !== prices(current)) return "PRICE_CHANGED";
  if (
    confirmed.discountTotal !== current.discountTotal ||
    confirmed.discountProblem !== current.discountProblem
  ) {
    return "DISCOUNT_CHANGED";
  }
  if (
    confirmed.shippingTotal !== current.shippingTotal ||
    confirmed.shipping?.rateId !== current.shipping?.rateId
  ) {
    return "SHIPPING_CHANGED";
  }
  return "PRICE_CHANGED";
}

/** Reads a stored quote back (it was written by priceCheckout). */
export function parseStoredQuote(value: unknown): PriceQuote | null {
  if (typeof value !== "object" || value === null) return null;
  const q = value as Partial<PriceQuote>;
  if (q.version !== 1 || !Array.isArray(q.lines) || typeof q.total !== "string") return null;
  return value as PriceQuote;
}
