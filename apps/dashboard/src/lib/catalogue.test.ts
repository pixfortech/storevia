import { describe, expect, it } from "vitest";
import { toTypeId } from "@storevia/types";
import { productsPath, stockSummary } from "./catalogue";

const item = (overrides: Partial<Parameters<typeof stockSummary>[0]> = {}) => ({
  trackedVariants: 1,
  available: 10,
  outOfStockVariants: 0,
  lowStockVariants: 0,
  variantCount: 1,
  ...overrides,
});

describe("stockSummary", () => {
  it("says when stock isn't tracked", () => {
    expect(stockSummary(item({ trackedVariants: 0 }))).toEqual({ text: "Not tracked", tone: null });
  });

  it("gives the units in stock, in words, with a tone only when something needs attention", () => {
    expect(stockSummary(item())).toEqual({ text: "10 in stock", tone: null });
    expect(stockSummary(item({ available: 2, lowStockVariants: 1 }))).toEqual({
      text: "2 in stock · low",
      tone: "warning",
    });
    expect(stockSummary(item({ available: 0, outOfStockVariants: 1 }))).toEqual({
      text: "Out of stock",
      tone: "danger",
    });
  });

  it("counts the variants that are out or low when only some are", () => {
    const planter = item({ trackedVariants: 2, variantCount: 2, available: 14 });
    expect(stockSummary({ ...planter, outOfStockVariants: 1 })).toEqual({
      text: "14 in stock · 1 variant out",
      tone: "warning",
    });
    expect(stockSummary({ ...planter, lowStockVariants: 2 })).toEqual({
      text: "14 in stock · 2 variants low",
      tone: "warning",
    });
  });
});

describe("productsPath", () => {
  it("gives the same path for a store's internal or public id", () => {
    const uuid = "01928f2e-7a3b-7c4d-8e5f-6a7b8c9d0e1f";
    const expected = `/s/${toTypeId("store", uuid)}/products/new`;
    expect(productsPath(uuid, "/new")).toBe(expected);
    expect(productsPath(toTypeId("store", uuid), "/new")).toBe(expected);
  });
});
