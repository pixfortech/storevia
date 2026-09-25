import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HANDLE_MAX_LENGTH, HANDLE_RE, handleProblem, slugify, uniqueHandle } from "./handles";

describe("slugify", () => {
  it.each([
    ["Linen Shirt", "linen-shirt"],
    ["  Crème brûlée — 250g  ", "creme-brulee-250g"],
    ["Straße & Søn", "strasse-and-son"],
    ["100% cotton!!", "100-cotton"],
    ["कुर्ता", ""],
    ["---", ""],
  ])("%s → %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("always produces a valid handle or an empty string (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        const handle = slugify(text);
        if (handle !== "") {
          expect(handle).toMatch(HANDLE_RE);
          expect(handle.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
        }
      }),
    );
  });
});

describe("handles", () => {
  it("refuses reserved, malformed and long handles", () => {
    expect(handleProblem("checkout")).toBe("reserved");
    expect(handleProblem("Linen-Shirt")).toBe("format");
    expect(handleProblem("linen--shirt")).toBe("format");
    expect(handleProblem("-linen")).toBe("format");
    expect(handleProblem("../admin")).toBe("format");
    expect(handleProblem("a".repeat(101))).toBe("too_long");
    expect(handleProblem("")).toBe("empty");
    expect(handleProblem("linen-shirt")).toBeNull();
  });

  it("suffixes generated handles on collision and avoids reserved ones", () => {
    expect(uniqueHandle("Linen shirt", new Set())).toBe("linen-shirt");
    expect(uniqueHandle("Linen shirt", new Set(["linen-shirt", "linen-shirt-2"]))).toBe(
      "linen-shirt-3",
    );
    expect(uniqueHandle("Search", new Set())).toBe("search-1");
    expect(uniqueHandle("कुर्ता", new Set(["product"]))).toBe("product-2");
    const long = "word ".repeat(40);
    const first = uniqueHandle(long, new Set());
    const second = uniqueHandle(long, new Set([first]));
    expect(second.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
    expect(second).toMatch(/-2$/);
  });
});
