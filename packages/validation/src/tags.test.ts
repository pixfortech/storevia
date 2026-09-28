// The product tag policy (tags.ts) and the schemas that apply it.
import { describe, expect, it } from "vitest";
import {
  bulkProductActionSchema,
  categoryCodeSchema,
  cleanTag,
  fieldErrors,
  normaliseTags,
  PRODUCT_TAG_LIMIT,
  PRODUCT_TAG_MAX_LENGTH,
  productListQuerySchema,
  tagsSchema,
  updateProductSchema,
} from "./index";

describe("cleanTag", () => {
  it.each([
    ["  summer  ", "summer"],
    ["summer   sale", "summer sale"],
    ["summer\tsale\nnow", "summer sale now"],
    ["a\u0000b\u007fc", "a b c"],
    ["zero​width", "zerowidth"],
    ["‮evil‬", "evil"],
    ["﻿bom", "bom"],
    ["non breaking", "non breaking"],
    ["café", "café"],
    ["👩‍🍳", "👩‍🍳"],
    ["<b>bold</b>", "<b>bold</b>"],
    ["   ", ""],
  ])("%j → %j", (raw, clean) => {
    expect(cleanTag(raw)).toBe(clean);
  });
});

describe("normaliseTags", () => {
  it("splits on commas in text and in list items", () => {
    expect(normaliseTags("summer, sale ,,new").tags).toEqual(["summer", "sale", "new"]);
    expect(normaliseTags(["summer, sale", "new"]).tags).toEqual(["summer", "sale", "new"]);
  });

  it("de-duplicates ignoring case and keeps the first spelling", () => {
    expect(normaliseTags(["Summer", "summer", "SUMMER", "Sale", "sale "]).tags).toEqual([
      "Summer",
      "Sale",
    ]);
    // Composed and decomposed accents are the same tag.
    expect(normaliseTags(["Café", "café"]).tags).toEqual(["Café"]);
  });

  it("keeps HTML-looking text as plain text", () => {
    const { tags, problem } = normaliseTags(["<script>alert(1)</script>"]);
    expect(problem).toBeNull();
    expect(tags).toEqual(["<script>alert(1)</script>"]);
  });

  it("accepts the maximum and reports more on the field", () => {
    const max = Array.from({ length: PRODUCT_TAG_LIMIT }, (_, i) => `tag ${String(i)}`);
    expect(normaliseTags(max)).toEqual({ tags: max, problem: null });
    expect(normaliseTags([...max, "one more"]).problem).toBe(
      `Use at most ${String(PRODUCT_TAG_LIMIT)} tags.`,
    );
    // Duplicates don't count towards the limit.
    expect(normaliseTags([...max, "TAG 0"]).problem).toBeNull();
  });

  it("measures length in characters, not UTF-16 units", () => {
    const longest = "é".repeat(PRODUCT_TAG_MAX_LENGTH);
    expect(normaliseTags([longest]).problem).toBeNull();
    expect(normaliseTags(["🌿".repeat(PRODUCT_TAG_MAX_LENGTH)]).problem).toBeNull();
    expect(normaliseTags([`${longest}x`]).problem).toMatch(/at most 40 characters/);
  });

  it("drops empty tags", () => {
    expect(normaliseTags(["", "  ", ",", "​"])).toEqual({ tags: [], problem: null });
  });
});

describe("tagsSchema", () => {
  it("reports problems on the tags field, not per item", () => {
    const result = updateProductSchema.safeParse({ tags: ["x".repeat(41)] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error))).toEqual(["tags"]);
    }
  });

  it("refuses absurd input before normalising it", () => {
    expect(tagsSchema.safeParse(Array.from({ length: 501 }, () => "a")).success).toBe(false);
    expect(tagsSchema.safeParse("a".repeat(20_001)).success).toBe(false);
    expect(tagsSchema.safeParse(42).success).toBe(false);
  });

  it("feeds bulk tag actions, which need at least one tag", () => {
    const base = { action: "addTags", productIds: ["prod_1"] };
    expect(bulkProductActionSchema.safeParse({ ...base, tags: " , " }).success).toBe(false);
    expect(bulkProductActionSchema.parse({ ...base, tags: "Sale, sale" })).toMatchObject({
      tags: ["Sale"],
    });
  });
});

describe("categoryCodeSchema and list filters", () => {
  it("treats an empty picker value as clearing the category", () => {
    expect(categoryCodeSchema.parse("")).toBeNull();
    expect(categoryCodeSchema.parse("  hg-kd  ")).toBe("hg-kd");
    expect(categoryCodeSchema.parse(undefined)).toBeUndefined();
    expect(categoryCodeSchema.safeParse("x".repeat(65)).success).toBe(false);
  });

  it("ignores malformed tag and category filters", () => {
    expect(productListQuerySchema.parse({ tag: " Summer ", category: "hg" })).toMatchObject({
      tag: "Summer",
      category: "hg",
    });
    expect(productListQuerySchema.parse({ tag: "x".repeat(201), category: 5 })).toMatchObject({
      tag: undefined,
      category: undefined,
    });
  });
});
