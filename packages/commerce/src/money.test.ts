import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  applyBasisPoints,
  applyPpm,
  compare,
  currencyExponent,
  divideRounded,
  format,
  fromJSON,
  money,
  MoneyError,
  multiply,
  parseDecimal,
  subtract,
  sum,
  toDecimalString,
  toJSON,
  type Rounding,
} from "./money";

const CURRENCIES = ["INR", "USD", "JPY", "KWD", "EUR", "CLF"] as const;
const amount = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });
const currency = fc.constantFrom(...CURRENCIES);

describe("currency exponents", () => {
  it("come from the ISO-4217 table, never an assumed 2", () => {
    expect(currencyExponent("INR")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KRW")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
    expect(currencyExponent("BHD")).toBe(3);
    expect(currencyExponent("CLF")).toBe(4);
    expect(() => currencyExponent("ABC")).toThrow(MoneyError);
    expect(() => money(1n, "usd")).toThrow("Unknown currency");
  });
});

describe("money values", () => {
  it("are integer minor units with their currency: ₹999.50 is 99950 paise", () => {
    expect(parseDecimal("999.50", "INR")).toEqual({ amount: 99950n, currency: "INR" });
    expect(toDecimalString(money(99950n, "INR"))).toBe("999.50");
    expect(toDecimalString(money(5n, "INR"))).toBe("0.05");
    expect(toDecimalString(money(-5n, "KWD"))).toBe("-0.005");
    expect(toDecimalString(money(1200n, "JPY"))).toBe("1200");
  });

  it("refuse fractional or unsafe numbers", () => {
    expect(() => money(9.5, "INR")).toThrow("integer minor units");
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, "INR")).toThrow();
    expect(() => money("12.5", "INR")).toThrow();
  });

  it("never mix currencies", () => {
    expect(() => add(money(1n, "INR"), money(1n, "USD"))).toThrow("no implicit conversion");
    expect(() => compare(money(1n, "INR"), money(1n, "USD"))).toThrow(MoneyError);
  });

  it("add, subtract, multiply and sum exactly", () => {
    expect(add(money(99950n, "INR"), money(50n, "INR")).amount).toBe(100000n);
    expect(subtract(money(1n, "JPY"), money(3n, "JPY")).amount).toBe(-2n);
    expect(multiply(money(99950n, "INR"), 3).amount).toBe(299850n);
    expect(() => multiply(money(1n, "INR"), 1.5)).toThrow();
    expect(sum([money(1n, "USD"), money(2n, "USD")], "USD").amount).toBe(3n);
  });

  it("serialise amounts as strings in JSON", () => {
    const big = money(9007199254740993n, "INR");
    expect(toJSON(big)).toEqual({ amount: "9007199254740993", currency: "INR" });
    expect(fromJSON(toJSON(big))).toEqual(big);
    expect(JSON.stringify(toJSON(money(99950n, "INR")))).toBe(
      '{"amount":"99950","currency":"INR"}',
    );
  });
});

describe("rounding", () => {
  const cases: [bigint, bigint, Rounding, bigint][] = [
    [7n, 2n, "half-up", 4n],
    [-7n, 2n, "half-up", -4n],
    [7n, 2n, "half-down", 3n],
    [-7n, 2n, "half-down", -3n],
    [7n, 2n, "half-even", 4n],
    [5n, 2n, "half-even", 2n],
    [-5n, 2n, "half-even", -2n],
    [7n, 3n, "floor", 2n],
    [-7n, 3n, "floor", -3n],
    [7n, 3n, "ceil", 3n],
    [-7n, 3n, "ceil", -2n],
    [-7n, 3n, "trunc", -2n],
    [8n, 3n, "half-up", 3n],
    [-8n, 3n, "half-even", -3n],
  ];
  it.each(cases)("%s / %s with %s is %s", (n, d, mode, expected) => {
    expect(divideRounded(n, d, mode)).toBe(expected);
  });

  it("basis points and ppm round explicitly", () => {
    // 18 % GST on ₹999.50 = ₹179.91 exactly.
    expect(applyPpm(money(99950n, "INR"), 180_000n, "half-even").amount).toBe(17991n);
    // 12.5 % off ₹0.05 = 0.625 paise.
    expect(applyBasisPoints(money(5n, "INR"), 1250n, "half-even").amount).toBe(1n);
    expect(applyBasisPoints(money(5n, "INR"), 1250n, "half-up").amount).toBe(1n);
    expect(applyBasisPoints(money(5n, "INR"), 1250n, "floor").amount).toBe(0n);
  });

  it("never drifts more than half a unit (property)", () => {
    fc.assert(
      fc.property(amount, fc.bigInt({ min: 1n, max: 10n ** 6n }), (n, d) => {
        const r = divideRounded(n, d, "half-even");
        const error = n - r * d; // exact remainder relative to the rounded result
        expect(2n * (error < 0n ? -error : error)).toBeLessThanOrEqual(d);
      }),
    );
  });
});

describe("allocation (largest remainder)", () => {
  it("splits so the parts add up to the total", () => {
    expect(allocate(money(100n, "INR"), [1, 1, 1]).map((m) => m.amount)).toEqual([34n, 33n, 33n]);
    expect(allocate(money(-100n, "INR"), [1, 1, 1]).map((m) => m.amount)).toEqual([
      -34n,
      -33n,
      -33n,
    ]);
    expect(allocate(money(5n, "JPY"), [3, 7]).map((m) => m.amount)).toEqual([2n, 3n]);
    expect(() => allocate(money(5n, "JPY"), [0, 0])).toThrow();
    expect(() => allocate(money(5n, "JPY"), [])).toThrow();
  });

  it("always sums to the total, and no part is more than one unit off its exact share (property)", () => {
    fc.assert(
      fc.property(
        amount,
        currency,
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }),
        (a, c, ratios) => {
          fc.pre(ratios.some((r) => r > 0));
          const parts = allocate(money(a, c), ratios);
          expect(parts.reduce((s, p) => s + p.amount, 0n)).toBe(a);
          const total = BigInt(ratios.reduce((s, r) => s + r, 0));
          parts.forEach((p, i) => {
            const exact = (a * BigInt(ratios[i] ?? 0)) / total;
            const diff = p.amount - exact;
            expect(diff >= -1n && diff <= 1n).toBe(true);
          });
        },
      ),
    );
  });

  it("addition is associative and commutative (property)", () => {
    fc.assert(
      fc.property(amount, amount, amount, currency, (x, y, z, c) => {
        const [a, b, d] = [money(x, c), money(y, c), money(z, c)];
        expect(add(add(a, b), d)).toEqual(add(a, add(b, d)));
        expect(add(a, b)).toEqual(add(b, a));
      }),
    );
  });
});

describe("parsing and formatting", () => {
  it("parses what people type and refuses too many decimals", () => {
    expect(parseDecimal("1,234.5", "USD").amount).toBe(123450n);
    expect(parseDecimal(" 12 ", "JPY").amount).toBe(12n);
    expect(parseDecimal(".5", "INR").amount).toBe(50n);
    expect(parseDecimal("1,23,456.75", "INR").amount).toBe(12345675n);
    expect(() => parseDecimal("12.345", "INR")).toThrow("at most 2 decimal places");
    expect(() => parseDecimal("12.5", "JPY")).toThrow("no decimal places");
    expect(() => parseDecimal("-1", "INR")).toThrow("can't be negative");
    expect(parseDecimal("-1", "INR", { allowNegative: true }).amount).toBe(-100n);
    expect(() => parseDecimal("abc", "INR")).toThrow();
    expect(() => parseDecimal("", "INR")).toThrow();
    expect(() => parseDecimal("1e5", "INR")).toThrow();
  });

  it("formats with the currency's own decimals", () => {
    expect(format(money(99950n, "INR"), "en-IN")).toBe("₹999.50");
    expect(format(money(123456789n, "INR"), "en-IN")).toBe("₹12,34,567.89");
    expect(format(money(1200n, "JPY"), "en-US")).toBe("¥1,200");
    expect(format(money(1500n, "KWD"), "en-US", { display: "code" })).toMatch(/KWD\s1\.500/);
    // Beyond Number.MAX_SAFE_INTEGER, formatting stays exact.
    expect(format(money(900719925474099312n, "USD"), "en-US")).toBe("$9,007,199,254,740,993.12");
  });

  it("round-trips decimal text for every exponent (property)", () => {
    fc.assert(
      fc.property(amount, currency, (a, c) => {
        const m = money(a, c);
        expect(parseDecimal(toDecimalString(m), c, { allowNegative: true })).toEqual(m);
      }),
    );
  });
});
