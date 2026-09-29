import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  gramsToWeight,
  hsnCodeSchema,
  updateProductSchema,
  weightToGrams,
} from "./catalogue";

describe("weightToGrams", () => {
  it("converts kilograms and grams exactly", () => {
    expect(weightToGrams("1.25", "kg")).toBe(1250);
    expect(weightToGrams("0.001", "kg")).toBe(1);
    expect(weightToGrams("2", "kg")).toBe(2000);
    expect(weightToGrams("250", "g")).toBe(250);
    expect(weightToGrams(" 1,200 ", "g")).toBe(1200);
    expect(weightToGrams("250.0", "g")).toBe(250);
  });

  it("reads empty as no weight", () => {
    expect(weightToGrams("", "g")).toBeNull();
    expect(weightToGrams("   ", "kg")).toBeNull();
  });

  it("refuses what can't be stored", () => {
    for (const [text, unit] of [
      ["-1", "g"],
      ["1.5", "g"],
      ["0.0005", "kg"],
      ["abc", "kg"],
      ["1e3", "g"],
      ["1001", "kg"],
    ] as const) {
      expect(weightToGrams(text, unit), `${text} ${unit}`).toBe("invalid");
    }
  });
});

describe("gramsToWeight", () => {
  it("shows kilograms from 1 kg and grams below", () => {
    expect(gramsToWeight(null)).toEqual({ value: "", unit: "g" });
    expect(gramsToWeight(250)).toEqual({ value: "250", unit: "g" });
    expect(gramsToWeight(1000)).toEqual({ value: "1", unit: "kg" });
    expect(gramsToWeight(1250)).toEqual({ value: "1.25", unit: "kg" });
    expect(gramsToWeight(1005)).toEqual({ value: "1.005", unit: "kg" });
  });

  it("round-trips", () => {
    for (const grams of [0, 1, 999, 1000, 1001, 12_345, 1_000_000]) {
      const { value, unit } = gramsToWeight(grams);
      expect(weightToGrams(value, unit)).toBe(grams);
    }
  });
});

describe("hsnCodeSchema", () => {
  it("accepts 4, 6 or 8 digits, ignoring spaces", () => {
    expect(hsnCodeSchema.parse("6109")).toBe("6109");
    expect(hsnCodeSchema.parse("610910")).toBe("610910");
    expect(hsnCodeSchema.parse("6109 1000")).toBe("61091000");
  });

  it("clears on empty", () => {
    expect(hsnCodeSchema.parse("")).toBeNull();
    expect(hsnCodeSchema.parse("  ")).toBeNull();
    expect(hsnCodeSchema.parse(null)).toBeNull();
    expect(hsnCodeSchema.parse(undefined)).toBeUndefined();
  });

  it("refuses other lengths and non-digits", () => {
    for (const value of ["610", "61091", "6109100", "610910001", "61O9", "HSN6109", "61-09"]) {
      const result = hsnCodeSchema.safeParse(value);
      expect(result.success, value).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Enter an HSN code of 4, 6 or 8 digits.");
    }
  });

  it("is part of the product schemas", () => {
    expect(createProductSchema.parse({ title: "Mug", hsnCode: "6912" }).hsnCode).toBe("6912");
    expect(updateProductSchema.safeParse({ hsnCode: "12" }).success).toBe(false);
  });
});

describe("createProductSchema", () => {
  it("carries the free-product confirmation only as a boolean", () => {
    expect(createProductSchema.parse({ title: "Mug" }).confirmFree).toBeUndefined();
    expect(createProductSchema.parse({ title: "Mug", confirmFree: true }).confirmFree).toBe(true);
    expect(createProductSchema.safeParse({ title: "Mug", confirmFree: "yes" }).success).toBe(false);
  });
});
