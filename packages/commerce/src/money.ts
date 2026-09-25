// Money (ADR-0010, docs/architecture/09-commerce.md §1). Amounts are integer
// minor units (bigint) and always carry their ISO-4217 currency. Pure and
// dependency-free, so client components may import it.

export type CurrencyCode = string;

export interface Money {
  readonly amount: bigint;
  readonly currency: CurrencyCode;
}

/** JSON form: the amount is a string so JavaScript clients never lose precision. */
export interface MoneyJson {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

export type Rounding = "half-even" | "half-up" | "half-down" | "floor" | "ceil" | "trunc";

export class MoneyError extends Error {
  constructor(
    readonly code: "UNKNOWN_CURRENCY" | "CURRENCY_MISMATCH" | "INVALID_AMOUNT" | "INVALID_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "MoneyError";
  }
}

// ISO-4217 minor-unit exponents for active currencies. Nothing assumes 2:
// a currency missing from this table is refused.
const ZERO = [
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
];
const THREE = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
const FOUR = ["CLF", "UYW"];
const TWO = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CNY",
  "COP",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IRR",
  "JMD",
  "KES",
  "KGS",
  "KHR",
  "KPW",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "USD",
  "UYU",
  "UZS",
  "VES",
  "WST",
  "XCD",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG",
];

const EXPONENTS: ReadonlyMap<string, number> = new Map([
  ...ZERO.map((c) => [c, 0] as const),
  ...TWO.map((c) => [c, 2] as const),
  ...THREE.map((c) => [c, 3] as const),
  ...FOUR.map((c) => [c, 4] as const),
]);

/** Number of minor-unit digits for a currency (JPY 0, INR 2, KWD 3). Throws if unknown. */
export function currencyExponent(currency: CurrencyCode): number {
  const exponent = EXPONENTS.get(currency);
  if (exponent === undefined) {
    throw new MoneyError("UNKNOWN_CURRENCY", `Unknown currency "${currency}".`);
  }
  return exponent;
}

export function isKnownCurrency(currency: string): boolean {
  return EXPONENTS.has(currency);
}

function toBigInt(amount: bigint | number | string): bigint {
  if (typeof amount === "bigint") return amount;
  if (typeof amount === "number") {
    if (!Number.isSafeInteger(amount)) {
      throw new MoneyError("INVALID_AMOUNT", "Money amounts must be integer minor units.");
    }
    return BigInt(amount);
  }
  if (!/^-?\d+$/.test(amount)) {
    throw new MoneyError("INVALID_AMOUNT", "Money amounts must be integer minor units.");
  }
  return BigInt(amount);
}

/** A money value from integer minor units. `money(99950n, "INR")` is ₹999.50. */
export function money(amount: bigint | number | string, currency: CurrencyCode): Money {
  currencyExponent(currency);
  return Object.freeze({ amount: toBigInt(amount), currency });
}

export function zero(currency: CurrencyCode): Money {
  return money(0n, currency);
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      "CURRENCY_MISMATCH",
      `Can't combine ${a.currency} and ${b.currency}; there is no implicit conversion.`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sum(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce((total, value) => add(total, value), zero(currency));
}

/** Multiplies by an integer quantity (never a fraction: use basis points for that). */
export function multiply(value: Money, quantity: bigint | number): Money {
  return money(value.amount * toBigInt(quantity), value.currency);
}

export function negate(value: Money): Money {
  return money(-value.amount, value.currency);
}

/** Integer division of `numerator / denominator` with an explicit rounding mode. */
export function divideRounded(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (denominator === 0n) throw new MoneyError("INVALID_INPUT", "Division by zero.");
  if (denominator < 0n) return divideRounded(-numerator, -denominator, rounding);
  const quotient = numerator / denominator; // truncates toward zero
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n;
  const floor = negative ? quotient - 1n : quotient;
  const ceil = floor + 1n;
  const twice = (negative ? -remainder : remainder) * 2n; // distance above floor, doubled
  const aboveFloor = negative ? denominator * 2n - twice : twice;
  switch (rounding) {
    case "floor":
      return floor;
    case "ceil":
      return ceil;
    case "trunc":
      return quotient;
    case "half-up":
      // Half away from zero.
      if (aboveFloor === denominator) return negative ? floor : ceil;
      return aboveFloor > denominator ? ceil : floor;
    case "half-down":
      // Half towards zero.
      if (aboveFloor === denominator) return negative ? ceil : floor;
      return aboveFloor > denominator ? ceil : floor;
    case "half-even":
      if (aboveFloor === denominator) return floor % 2n === 0n ? floor : ceil;
      return aboveFloor > denominator ? ceil : floor;
  }
}

/** A share in basis points (1 bp = 0.01 %): discounts, commissions. */
export function applyBasisPoints(value: Money, bps: bigint | number, rounding: Rounding): Money {
  return money(divideRounded(value.amount * toBigInt(bps), 10_000n, rounding), value.currency);
}

/** A share in parts per million: tax rates. */
export function applyPpm(value: Money, ppm: bigint | number, rounding: Rounding): Money {
  return money(divideRounded(value.amount * toBigInt(ppm), 1_000_000n, rounding), value.currency);
}

/**
 * Splits a value by integer ratios with the largest-remainder method, so the
 * parts always add up to the total (e.g. a discount across order lines).
 */
export function allocate(value: Money, ratios: readonly (bigint | number)[]): Money[] {
  const weights = ratios.map(toBigInt);
  if (weights.length === 0 || weights.some((w) => w < 0n)) {
    throw new MoneyError("INVALID_INPUT", "Allocation ratios must be non-negative and not empty.");
  }
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) throw new MoneyError("INVALID_INPUT", "Allocation ratios can't all be zero.");
  const sign = value.amount < 0n ? -1n : 1n;
  const amount = value.amount * sign;
  const shares = weights.map((w) => (amount * w) / total);
  const remainders = weights.map((w, i) => ({ i, r: (amount * w) % total }));
  let left = amount - shares.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of remainders) {
    if (left === 0n) break;
    shares[i] = (shares[i] ?? 0n) + 1n;
    left -= 1n;
  }
  return shares.map((share) => money(share * sign, value.currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

export function isZero(value: Money): boolean {
  return value.amount === 0n;
}

export function isNegative(value: Money): boolean {
  return value.amount < 0n;
}

/** The exact decimal string of a value in major units: 99950n INR → "999.50". */
export function toDecimalString(value: Money): string {
  const exponent = currencyExponent(value.currency);
  const negative = value.amount < 0n;
  const digits = (negative ? -value.amount : value.amount).toString();
  if (exponent === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(exponent + 1, "0");
  const whole = padded.slice(0, -exponent);
  const fraction = padded.slice(-exponent);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Locale formatting via Intl, from the exact decimal string (no floating point). */
export function format(
  value: Money,
  locale = "en",
  options: { readonly display?: "symbol" | "code" | "narrowSymbol" } = {},
): string {
  const exponent = currencyExponent(value.currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    currencyDisplay: options.display ?? "symbol",
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl formats decimal strings exactly (ES2023 Intl.NumberFormat v3).
  return formatter.format(toDecimalString(value) as unknown as number);
}

/**
 * Parses what a person typed ("999.50", "1,234.5", "999") into minor units.
 * Commas and spaces are grouping separators; "." is the decimal point. More
 * fraction digits than the currency has is an error, never a silent rounding.
 */
export function parseDecimal(
  input: string,
  currency: CurrencyCode,
  options: { readonly allowNegative?: boolean } = {},
): Money {
  const exponent = currencyExponent(currency);
  const cleaned = input.trim().replace(/[\s,\u00a0\u202f]/g, "");
  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(cleaned) ?? /^(-)?()\.(\d+)$/.exec(cleaned);
  if (!match || cleaned === "" || cleaned === "-") {
    throw new MoneyError("INVALID_INPUT", "Enter an amount such as 999.50.");
  }
  const [, minus, whole = "", fraction = ""] = match;
  if (minus && !options.allowNegative) {
    throw new MoneyError("INVALID_INPUT", "The amount can't be negative.");
  }
  if (fraction.length > exponent) {
    throw new MoneyError(
      "INVALID_INPUT",
      exponent === 0
        ? `${currency} amounts have no decimal places.`
        : `${currency} amounts have at most ${String(exponent)} decimal places.`,
    );
  }
  const minor = BigInt((whole || "0") + fraction.padEnd(exponent, "0"));
  return money(minus ? -minor : minor, currency);
}

export function toJSON(value: Money): MoneyJson {
  return { amount: value.amount.toString(), currency: value.currency };
}

export function fromJSON(json: MoneyJson): Money {
  return money(json.amount, json.currency);
}
