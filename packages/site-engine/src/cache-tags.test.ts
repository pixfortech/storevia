import { describe, expect, it } from "vitest";
import {
  composeEventTags,
  designTag,
  hostTag,
  isSiteCacheTag,
  pagesTag,
  siteCacheTagsForEvent,
  storeTag,
} from "./cache-tags";

const STORE = "0192f0a0-0000-7000-8000-000000000001";
const event = (type: string, payload: unknown = {}) => ({
  type,
  storeId: STORE,
  entityType: "X",
  entityId: STORE,
  payload,
});

describe("site cache tags (ADR-0030 §10)", () => {
  it("a page change refreshes pages and the design (menus link to pages)", () => {
    expect(siteCacheTagsForEvent(event("page.changed"))).toEqual([
      pagesTag(STORE),
      designTag(STORE),
    ]);
  });

  it("theme and menu changes refresh only the store's design", () => {
    expect(siteCacheTagsForEvent(event("theme.changed"))).toEqual([designTag(STORE)]);
    expect(siteCacheTagsForEvent(event("navigation.changed"))).toEqual([designTag(STORE)]);
  });

  it("a domain change evicts the store and every hostname it names (ADR-0032 §7)", () => {
    // A primary switch names both hosts: the old primary must start
    // redirecting and the new one must stop.
    expect(
      siteCacheTagsForEvent(
        event("domain.changed", { hostnames: ["shop.abc.com", "clay.storevia.site"] }),
      ),
    ).toEqual([storeTag(STORE), hostTag("shop.abc.com"), hostTag("clay.storevia.site")]);
    expect(siteCacheTagsForEvent(event("domain.changed", { hostnames: [42, null] }))).toEqual([
      storeTag(STORE),
    ]);
    expect(isSiteCacheTag(hostTag("shop.abc.com"))).toBe(true);
    expect(isSiteCacheTag("host:shop abc")).toBe(false);
  });

  it("anything unknown refreshes the whole site", () => {
    expect(siteCacheTagsForEvent(event("something.new"))).toEqual([storeTag(STORE)]);
  });

  it("a composition's mappers come first, then the Site Engine's", () => {
    const tags = composeEventTags((e) => (e.type === "product.changed" ? [storeTag("x")] : null));
    expect(tags(event("product.changed"))).toEqual(["store:x"]);
    expect(tags(event("theme.changed"))).toEqual([designTag(STORE)]);
  });

  it("design tags are well-formed and store-scoped", () => {
    expect(isSiteCacheTag(designTag(STORE))).toBe(true);
    expect(isSiteCacheTag("design:not-a-uuid")).toBe(false);
    expect(isSiteCacheTag(`theme:${STORE}`)).toBe(false);
  });
});
