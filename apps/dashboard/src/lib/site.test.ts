import { describe, expect, it } from "vitest";
import { previewPathFrom, previewPath } from "./site";

describe("previewPathFrom", () => {
  it("opens the store's own home or content pages", () => {
    expect(previewPathFrom("/")).toBe("/");
    expect(previewPathFrom("/pages/about-us")).toBe("/pages/about-us");
    expect(previewPathFrom(null)).toBe("/");
  });

  it("falls back to the home page for anything else", () => {
    for (const path of [
      "//evil.example/pages/x",
      "https://evil.example/",
      "/pages/../admin",
      "/pages/About",
      "/pages/",
      "/products/mug",
      "/pages/a?x=1",
      "/pages/a#x",
      "\\\\evil.example",
      "javascript:alert(1)",
      `/pages/${"a".repeat(120)}`,
    ]) {
      expect(previewPathFrom(path), path).toBe("/");
    }
  });

  it("passes the path to the preview route encoded", () => {
    expect(previewPath("s1", "/pages/about-us")).toBe("/s/s1/preview?path=%2Fpages%2Fabout-us");
    expect(previewPath("s1")).toBe("/s/s1/preview");
  });
});
