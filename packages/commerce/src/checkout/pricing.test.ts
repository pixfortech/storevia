import { describe, expect, it } from "vitest";
import {
  applicableTaxRates,
  describeQuoteChange,
  priceCheckout,
  quoteHash,
  type CheckoutAddress,
  type PricingDiscount,
  type PricingInput,
  type PricingLine,
  type PricingShippingRate,
} from "./pricing";

const NOW = new Date("2026-10-01T10:00:00Z");
const address: CheckoutAddress = {
  firstName: "Asha",
  lastName: "Rao",
  company: null,
  line1: "1 MG Road",
  line2: null,
  city: "Bengaluru",
  region: "Karnataka",
  regionCode: "KA",
  postalCode: "560001",
  countryCode: "IN",
  phone: null,
};

const line = (over: Partial<PricingLine> = {}): PricingLine => ({
  variantId: "v1",
  productId: "p1",
  productTitle: "Mug",
  variantTitle: "Default",
  sku: null,
  unitPrice: 99950n,
  currency: "INR",
  quantity: 1,
  taxable: true,
  requiresShipping: true,
  weightGrams: null,
  sellable: true,
  inStock: true,
  ...over,
});

const flat: PricingShippingRate = {
  id: "r-flat",
  name: "Standard",
  type: "FLAT",
  amount: 5000n,
  currency: "INR",
  minSubtotal: null,
  maxSubtotal: null,
  countries: [{ countryCode: "IN", regionCodes: [] }],
};
const free: PricingShippingRate = {
  ...flat,
  id: "r-free",
  name: "Free over ₹1,000",
  type: "PRICE_BASED",
  amount: 0n,
  minSubtotal: 100000n,
};

const discount = (over: Partial<PricingDiscount> = {}): PricingDiscount => ({
  id: "d1",
  codeId: "c1",
  code: "SAVE10",
  title: "Save 10%",
  type: "PERCENTAGE",
  percentageBps: 1000,
  amount: null,
  currency: null,
  minSubtotal: null,
  startsAt: new Date("2026-01-01T00:00:00Z"),
  endsAt: null,
  active: true,
  usageLimit: null,
  usedByOthers: 0,
  ...over,
});

const input = (over: Partial<PricingInput> = {}): PricingInput => ({
  currency: "INR",
  lines: [line()],
  email: "asha@example.com",
  address,
  shippingRates: [flat, free],
  selectedRateId: "r-flat",
  pricesIncludeTax: false,
  chargeTaxOnShipping: false,
  taxRates: [{ id: "t-in", name: "GST", countryCode: "IN", regionCode: null, ratePpm: 180000 }],
  discountCode: null,
  discount: null,
  now: NOW,
  ...over,
});

describe("priceCheckout", () => {
  it("prices from the server snapshot: subtotal, shipping, exclusive tax, total", () => {
    const q = priceCheckout(input({ lines: [line({ quantity: 2 })] }));
    expect(q).toMatchObject({
      subtotal: "199900",
      discountTotal: "0",
      shippingTotal: "5000",
      taxTotal: "35982",
      total: "240882",
      problems: [],
    });
    expect(q.lines[0]).toMatchObject({ subtotal: "199900", tax: "35982", total: "235882" });
  });

  it("rounds exclusive tax half-even per line and rate", () => {
    // 5 × 18% = 0.9 → 1; 25 × 18% = 4.5 → 4 (even); 35 × 18% = 6.3 → 6.
    const q = priceCheckout(
      input({
        lines: [
          line({ variantId: "a", unitPrice: 5n }),
          line({ variantId: "b", unitPrice: 25n }),
          line({ variantId: "c", unitPrice: 35n }),
        ],
        selectedRateId: null,
        shippingRates: [],
      }),
    );
    expect(q.lines.map((l) => l.tax)).toEqual(["1", "4", "6"]);
    expect(q.problems).toEqual(["SHIPPING_UNAVAILABLE"]);
  });

  it("extracts inclusive tax and splits it across rates exactly", () => {
    const q = priceCheckout(
      input({
        pricesIncludeTax: true,
        lines: [line({ unitPrice: 118000n })],
        taxRates: [
          { id: "cgst", name: "CGST", countryCode: "IN", regionCode: null, ratePpm: 90000 },
          { id: "sgst", name: "SGST", countryCode: "IN", regionCode: "KA", ratePpm: 90000 },
          { id: "other", name: "Other state", countryCode: "IN", regionCode: "MH", ratePpm: 50000 },
        ],
      }),
    );
    // ₹1,180 including 18%: tax ₹180, split 90 + 90; the MH rate doesn't apply.
    expect(q.lines[0]?.tax).toBe("18000");
    expect(q.lines[0]?.taxLines.map((t) => [t.rateId, t.amount])).toEqual([
      ["cgst", "9000"],
      ["sgst", "9000"],
    ]);
    // Inclusive: tax is inside the price, the total doesn't add it again.
    expect(q.total).toBe("123000");
  });

  it("taxes shipping only when the store says so, and never non-taxable lines", () => {
    const q = priceCheckout(
      input({ chargeTaxOnShipping: true, lines: [line({ taxable: false, unitPrice: 10000n })] }),
    );
    expect(q.lines[0]?.tax).toBe("0");
    expect(q.shipping?.tax).toBe("900");
    expect(q.taxTotal).toBe("900");
    expect(q.total).toBe("15900");
  });

  it("applies a percentage discount half-up, capped, and allocates it across lines exactly", () => {
    const q = priceCheckout(
      input({
        lines: [
          line({ variantId: "a", unitPrice: 333n }),
          line({ variantId: "b", unitPrice: 667n }),
        ],
        discountCode: "SAVE10",
        discount: discount({ percentageBps: 1005 }),
        taxRates: [],
      }),
    );
    // 1000 × 10.05% = 100.5 → 101 (half-up).
    expect(q.discountTotal).toBe("101");
    expect(q.lines.map((l) => l.discount)).toEqual(["34", "67"]);
    expect(q.lines.reduce((s, l) => s + BigInt(l.discount), 0n)).toBe(101n);
    const capped = priceCheckout(
      input({
        discountCode: "BIG",
        discount: discount({
          type: "FIXED_AMOUNT",
          percentageBps: null,
          amount: 10_000_000n,
          currency: "INR",
        }),
        taxRates: [],
      }),
    );
    expect(capped.discountTotal).toBe(capped.subtotal);
    expect(capped.total).toBe("5000");
  });

  it("refuses codes that aren't valid now, in this currency, above the minimum or with uses left", () => {
    const problem = (d: PricingDiscount | null) =>
      priceCheckout(input({ discountCode: "CODE", discount: d })).discountProblem;
    expect(problem(null)).toBe("NOT_FOUND");
    expect(problem(discount({ active: false }))).toBe("NOT_FOUND");
    expect(
      problem(
        discount({ type: "FIXED_AMOUNT", percentageBps: null, amount: 100n, currency: "USD" }),
      ),
    ).toBe("NOT_FOUND");
    expect(problem(discount({ startsAt: new Date("2026-10-02T00:00:00Z") }))).toBe("NOT_STARTED");
    expect(problem(discount({ endsAt: NOW }))).toBe("EXPIRED");
    expect(problem(discount({ usageLimit: 5, usedByOthers: 5 }))).toBe("USED_UP");
    expect(problem(discount({ minSubtotal: 100000n }))).toBe("MINIMUM");
    expect(problem(discount({ usageLimit: 5, usedByOthers: 4 }))).toBeNull();
    const q = priceCheckout(input({ discountCode: "CODE", discount: discount({ endsAt: NOW }) }));
    expect(q.discountTotal).toBe("0");
    expect(q.problems).toContain("DISCOUNT");
  });

  it("offers only rates that cover the address and the discounted subtotal", () => {
    const cheap = priceCheckout(input());
    expect(cheap.shippingOptions.map((o) => o.rateId)).toEqual(["r-flat"]);
    const big = priceCheckout(input({ lines: [line({ unitPrice: 100000n })] }));
    expect(big.shippingOptions.map((o) => o.rateId)).toEqual(["r-free", "r-flat"]);
    // A discount below the threshold removes the free rate.
    const discounted = priceCheckout(
      input({
        lines: [line({ unitPrice: 100000n })],
        discountCode: "SAVE10",
        discount: discount(),
        selectedRateId: "r-free",
      }),
    );
    expect(discounted.shippingOptions.map((o) => o.rateId)).toEqual(["r-flat"]);
    expect(discounted.shipping).toBeNull();
    expect(discounted.problems).toEqual(["SHIPPING"]);
    // Another country: nothing ships there.
    const abroad = priceCheckout(
      input({ address: { ...address, countryCode: "US", regionCode: null } }),
    );
    expect(abroad.problems).toEqual(["SHIPPING_UNAVAILABLE"]);
    // A region-limited zone.
    const regional = priceCheckout(
      input({
        shippingRates: [{ ...flat, countries: [{ countryCode: "IN", regionCodes: ["MH"] }] }],
      }),
    );
    expect(regional.shippingOptions).toEqual([]);
    // A rate id from somewhere else is ignored.
    expect(priceCheckout(input({ selectedRateId: "r-unknown" })).problems).toEqual(["SHIPPING"]);
  });

  it("needs no shipping when nothing ships", () => {
    const q = priceCheckout(
      input({ lines: [line({ requiresShipping: false })], selectedRateId: null }),
    );
    expect(q.requiresShipping).toBe(false);
    expect(q.shippingTotal).toBe("0");
    expect(q.problems).toEqual([]);
  });

  it("excludes unavailable lines from the totals and blocks payment", () => {
    const q = priceCheckout(
      input({
        lines: [
          line(),
          line({ variantId: "gone", sellable: false }),
          line({ variantId: "sold", inStock: false }),
          line({ variantId: "usd", currency: "USD" }),
        ],
      }),
    );
    expect(q.lines.map((l) => l.variantId)).toEqual(["v1"]);
    expect(q.unavailable.map((u) => [u.variantId, u.reason])).toEqual([
      ["gone", "UNAVAILABLE"],
      ["sold", "SOLD_OUT"],
      ["usd", "UNAVAILABLE"],
    ]);
    expect(q.subtotal).toBe("99950");
    expect(q.problems).toEqual(["UNAVAILABLE"]);
  });

  it("lists what's missing before payment", () => {
    expect(priceCheckout(input({ email: null, address: null })).problems).toEqual([
      "EMAIL",
      "ADDRESS",
    ]);
    expect(priceCheckout(input({ lines: [] })).problems).toEqual(["EMPTY"]);
  });

  it("uses only the rates for the address's country and region", () => {
    const rates = [
      { id: "a", name: "A", countryCode: "IN", regionCode: null, ratePpm: 1 },
      { id: "b", name: "B", countryCode: "IN", regionCode: "KA", ratePpm: 1 },
      { id: "c", name: "C", countryCode: "IN", regionCode: "MH", ratePpm: 1 },
      { id: "d", name: "D", countryCode: "US", regionCode: null, ratePpm: 1 },
    ];
    expect(applicableTaxRates(rates, address).map((r) => r.id)).toEqual(["a", "b"]);
    expect(applicableTaxRates(rates, null)).toEqual([]);
  });
});

describe("quote hashes and changes", () => {
  it("is stable for the same input and changes with any amount", () => {
    const a = priceCheckout(input());
    expect(quoteHash(priceCheckout(input()))).toBe(quoteHash(a));
    expect(quoteHash(priceCheckout(input({ lines: [line({ unitPrice: 99951n })] })))).not.toBe(
      quoteHash(a),
    );
  });

  it("names the kind of change the shopper must review", () => {
    const base = priceCheckout(input());
    expect(describeQuoteChange(base, priceCheckout(input()))).toBeNull();
    expect(
      describeQuoteChange(base, priceCheckout(input({ lines: [line({ unitPrice: 1n })] }))),
    ).toBe("PRICE_CHANGED");
    expect(
      describeQuoteChange(base, priceCheckout(input({ lines: [line({ quantity: 2 })] }))),
    ).toBe("QUANTITY_CHANGED");
    expect(
      describeQuoteChange(base, priceCheckout(input({ lines: [line({ inStock: false })] }))),
    ).toBe("ITEM_UNAVAILABLE");
    expect(
      describeQuoteChange(base, priceCheckout(input({ discountCode: "X", discount: discount() }))),
    ).toBe("DISCOUNT_CHANGED");
    expect(
      describeQuoteChange(
        base,
        priceCheckout(input({ shippingRates: [{ ...flat, amount: 6000n }] })),
      ),
    ).toBe("SHIPPING_CHANGED");
  });
});
