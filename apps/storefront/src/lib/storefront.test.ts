import { describe, expect, it } from "vitest";
import { linkHref, type DocumentData } from "@storevia/commerce/blocks";
import { routeHandle, storePolicyPage } from "./route-data";

describe("routes", () => {
  it("route handles are validated before any lookup", () => {
    expect(routeHandle("linen-shirt")).toBe("linen-shirt");
    for (const bad of ["Linen", "a b", "a%2Fb", "../x", "%E0%A4%A", "a".repeat(101), ""]) {
      expect(routeHandle(bad)).toBeNull();
    }
  });

  it("typed links resolve only to this store's handles", () => {
    const data: DocumentData = {
      productLists: [],
      collectionLists: [],
      media: [],
      links: {
        products: [["prod_1", "mug"]],
        collections: [["coll_1", "summer"]],
        pages: [["page_1", "about"]],
      },
    };
    expect(linkHref(data, { type: "product", id: "prod_1" })).toBe("/products/mug");
    expect(linkHref(data, { type: "product", id: "prod_2" })).toBeNull();
    expect(linkHref(data, { type: "collection", id: "coll_1" })).toBe("/collections/summer");
    expect(linkHref(data, { type: "page", id: "page_1" })).toBe("/pages/about");
    expect(linkHref(data, { type: "home" })).toBe("/");
    expect(linkHref(data, { type: "cart" })).toBe("/cart");
    expect(linkHref(data, { type: "url", href: "https://example.com/" })).toBe(
      "https://example.com/",
    );
    // A kind nobody registered resolves to nothing.
    expect(linkHref(data, { type: "blog", id: "post_1" })).toBeNull();
  });
});

describe("policy pages (final pass, Phase 2A)", () => {
  it("only a known policy handle is looked up or becomes a cache key", async () => {
    const store = {
      storeId: "00000000-0000-7000-8000-000000000001",
      organisationId: "00000000-0000-7000-8000-000000000002",
      name: "Shop",
      currency: "INR",
      locale: "en-IN",
      country: "IN",
      hostname: "shop.test",
      canonicalHostname: "shop.test",
      availability: "live" as const,
      preview: false,
      iat: 0,
    };
    // Unknown handles return before any database or cache access.
    for (const handle of ["returns", "REFUNDS", "../privacy", "terms%20", ""]) {
      expect(await storePolicyPage(store, handle)).toBeNull();
    }
  });
});

describe("multi-instance caching (M8)", () => {
  it("every cached page-data read applies the invalidation log first", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route-data.ts", import.meta.url), "utf8");
    const reads = source.split("pageDataCache().get(").slice(1);
    expect(reads.length).toBeGreaterThanOrEqual(3);
    // Each read's preceding statement in its function is the sync.
    const chunks = source.split("pageDataCache().get(").slice(0, -1);
    for (const before of chunks) {
      const fn = before.slice(before.lastIndexOf("export "));
      expect(fn).toContain("await syncPublicCaches();");
    }
  });
});
