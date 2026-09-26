import { describe, expect, it } from "vitest";
import {
  commerceCacheTagsForEvent,
  isStorefrontCacheTag,
  storefrontCacheTagsForEvent,
} from "./cache-tags";

// Commerce's cache tags composed into the Site Engine's (ADR-0029): the
// worker and the storefront use the same composed mapping and grammar.
const STORE = "0190f2a4-0000-7000-8000-000000000001";
const OTHER = "0190f2a4-0000-7000-8000-000000000002";
const event = (type: string, payload: unknown = {}) => ({
  type,
  storeId: STORE,
  entityType: "Product",
  entityId: OTHER,
  payload,
});

describe("storefront cache tags", () => {
  it("map catalogue events, and leave the rest to the Site Engine", () => {
    for (const type of ["product.changed", "product.availability_changed"]) {
      expect(storefrontCacheTagsForEvent(event(type))).toEqual([
        `product:${OTHER}`,
        `catalogue:${STORE}`,
      ]);
    }
    expect(storefrontCacheTagsForEvent(event("collection.changed"))).toEqual([
      `catalogue:${STORE}`,
    ]);
    expect(commerceCacheTagsForEvent(event("page.changed"))).toBeNull();
    expect(storefrontCacheTagsForEvent(event("page.changed"))).toEqual([`pages:${STORE}`]);
    expect(storefrontCacheTagsForEvent(event("store.changed"))).toEqual([`store:${STORE}`]);
    expect(storefrontCacheTagsForEvent(event("something.new"))).toEqual([`store:${STORE}`]);
    expect(
      storefrontCacheTagsForEvent(event("domain.changed", { hostnames: ["a.example", 1] })),
    ).toEqual([`store:${STORE}`, "host:a.example"]);
  });

  it("accept the site's and commerce's namespaces only", () => {
    for (const tag of [
      `store:${STORE}`,
      `pages:${STORE}`,
      `catalogue:${STORE}`,
      `product:${OTHER}`,
      "host:shop.example.com",
    ]) {
      expect(isStorefrontCacheTag(tag)).toBe(true);
    }
    for (const bad of ["product:x", `order:${STORE}`, `product:${OTHER} `, "host:", 1, null]) {
      expect(isStorefrontCacheTag(bad)).toBe(false);
    }
  });
});
