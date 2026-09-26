import { describe, expect, it } from "vitest";
import { linkHref } from "./render-context";
import type { RouteData } from "./route-data";
import { routeHandle } from "./route-data";

describe("routes", () => {
  it("route handles are validated before any lookup", () => {
    expect(routeHandle("linen-shirt")).toBe("linen-shirt");
    for (const bad of ["Linen", "a b", "a%2Fb", "../x", "%E0%A4%A", "a".repeat(101), ""]) {
      expect(routeHandle(bad)).toBeNull();
    }
  });

  it("typed links resolve only to this store's handles", () => {
    const data = {
      links: {
        products: [["prod_1", "mug"]],
        collections: [["coll_1", "summer"]],
        pages: [["page_1", "about"]],
      },
    } as unknown as RouteData;
    expect(linkHref(data, { type: "product", id: "prod_1" })).toBe("/products/mug");
    expect(linkHref(data, { type: "product", id: "prod_2" })).toBeNull();
    expect(linkHref(data, { type: "collection", id: "coll_1" })).toBe("/collections/summer");
    expect(linkHref(data, { type: "page", id: "page_1" })).toBe("/pages/about");
    expect(linkHref(data, { type: "home" })).toBe("/");
    expect(linkHref(data, { type: "cart" })).toBe("/cart");
  });
});
