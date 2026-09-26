import { describe, expect, it } from "vitest";
import { TagCache } from "./cache";
import { escapeHtml, simplePage, unknownHostPage } from "./pages-html";
import { linkHref } from "./render-context";
import type { RouteData } from "./route-data";
import { routeHandle } from "./route-data";
import { signStoreHeader, verifyStoreHeader, type StoreRequestContext } from "./store-header";

const KEY = Buffer.alloc(32, 7);
const NOW = Date.UTC(2026, 8, 26, 12);
const store: StoreRequestContext = {
  storeId: "0190f2a4-0000-7000-8000-000000000001",
  organisationId: "0190f2a4-0000-7000-8000-000000000002",
  name: "Clay & Co",
  currency: "INR",
  locale: "en-IN",
  country: "IN",
  hostname: "clay.storevia.site",
  canonicalHostname: "clay.storevia.site",
  availability: "live",
  preview: false,
  iat: Math.floor(NOW / 1000),
};

describe("signed store header", () => {
  it("round-trips for the request it was made for", () => {
    expect(verifyStoreHeader(signStoreHeader(store, KEY), KEY, NOW)).toEqual(store);
  });

  it("is refused when forged, altered, re-keyed or stale", () => {
    const header = signStoreHeader(store, KEY);
    const [payload, mac] = header.split(".");
    const other = Buffer.from(
      JSON.stringify({ ...store, storeId: "0190f2a4-0000-7000-8000-000000000009" }),
    ).toString("base64url");
    expect(verifyStoreHeader(`${other}.${mac ?? ""}`, KEY, NOW)).toBeNull();
    expect(verifyStoreHeader(header, Buffer.alloc(32, 8), NOW)).toBeNull();
    expect(verifyStoreHeader(`${payload ?? ""}.${mac ?? ""}.x`, KEY, NOW)).toBeNull();
    expect(verifyStoreHeader(header, KEY, NOW + 5 * 60_000)).toBeNull();
    for (const junk of [null, undefined, "", "abc", "a.b", "x".repeat(5000)]) {
      expect(verifyStoreHeader(junk, KEY, NOW)).toBeNull();
    }
  });
});

describe("tag cache", () => {
  const cache = () => new TagCache({ ttlMs: 1_000, maxEntries: 3 });

  it("serves hits, expires entries and invalidates by tag", async () => {
    const c = cache();
    let loads = 0;
    const load = (value: string, tags: string[]) => () => {
      loads += 1;
      return Promise.resolve({ value, tags });
    };
    let t = 0;
    const now = () => t;
    expect(await c.get("a", load("A", ["store:1"]), now)).toBe("A");
    expect(await c.get("a", load("A2", ["store:1"]), now)).toBe("A");
    expect(loads).toBe(1);
    t = 2_000;
    expect(await c.get("a", load("A3", ["store:1"]), now)).toBe("A3");
    expect(c.invalidate(["store:1"])).toBe(1);
    expect(await c.get("a", load("A4", ["store:1"]), now)).toBe("A4");
  });

  it("shares one load between concurrent misses", async () => {
    const c = cache();
    let loads = 0;
    const load = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { value: loads, tags: ["t:1"] };
    };
    const results = await Promise.all([c.get("k", load), c.get("k", load), c.get("k", load)]);
    expect(results).toEqual([1, 1, 1]);
    expect(loads).toBe(1);
  });

  it("never stores a load that raced an invalidation of its tags", async () => {
    const c = cache();
    let release: () => void = () => undefined;
    const slow = c.get("k", async () => {
      await new Promise<void>((r) => (release = r));
      return { value: "stale", tags: ["product:1"] };
    });
    c.invalidate(["product:1"]);
    release();
    expect(await slow).toBe("stale");
    // The stale value was not kept, and a new request loads afresh.
    expect(await c.get("k", () => Promise.resolve({ value: "fresh", tags: ["product:1"] }))).toBe(
      "fresh",
    );
    // Unrelated invalidations don't stop caching.
    let resolveOther: () => void = () => undefined;
    const other = c.get("o", async () => {
      await new Promise<void>((r) => (resolveOther = r));
      return { value: "kept", tags: ["product:2"] };
    });
    c.invalidate(["product:1"]);
    resolveOther();
    await other;
    expect(
      await c.get("o", () => Promise.resolve({ value: "reloaded", tags: ["product:2"] })),
    ).toBe("kept");
  });

  it("evicts the least recently used entry past its bound", async () => {
    const c = cache();
    for (const k of ["a", "b", "c"]) await c.get(k, () => Promise.resolve({ value: k, tags: [] }));
    await c.get("a", () => Promise.resolve({ value: "a2", tags: [] }));
    await c.get("d", () => Promise.resolve({ value: "d", tags: [] }));
    expect(c.size).toBe(3);
    expect(await c.get("b", () => Promise.resolve({ value: "b2", tags: [] }))).toBe("b2");
    expect(await c.get("a", () => Promise.resolve({ value: "a3", tags: [] }))).toBe("a");
  });
});

describe("html and routes", () => {
  it("escapes everything interpolated into status pages", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      "&#60;script&#62;&#34;x&#34;&#38;&#39;y&#39;&#60;/script&#62;",
    );
    const page = simplePage({
      title: "<t>",
      heading: "<h>",
      message: "<m>",
      lang: '"><script>',
      nonce: '"x',
    });
    expect(page).not.toMatch(/<(t|h|m|script)>/);
    expect(unknownHostPage()).not.toContain("store.");
  });

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
