// Site Engine unit tests (ADR-0029): the signed public context, the tag
// cache, status-page escaping, the SEO builders, the shell and cache tags.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TagCache } from "./cache";
import {
  cacheTagGrammar,
  composeEventTags,
  isSiteCacheTag,
  siteCacheTagsForEvent,
} from "./cache-tags";
import { signStoreHeader, verifyStoreHeader, type StoreRequestContext } from "./context";
import { escapeHtml, simplePage, unknownHostPage } from "./html";
import { canonicalUrl, jsonLdJson, robotsTxt, sitemapXml } from "./seo";
import { JsonLd, SiteShell } from "./shell";

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

describe("html", () => {
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
});

describe("seo", () => {
  it("builds canonical URLs on the primary host only from site-relative paths", () => {
    expect(canonicalUrl(store, "/pages/about")).toBe("https://clay.storevia.site/pages/about");
    expect(() => canonicalUrl(store, "//evil.test/x")).toThrow();
    expect(() => canonicalUrl(store, "https://evil.test")).toThrow();
  });

  it("robots.txt hides everything unless the site is live and not a preview", () => {
    expect(robotsTxt(store, { disallow: ["/cart"] })).toBe(
      "User-agent: *\nDisallow: /cart\nSitemap: https://clay.storevia.site/sitemap.xml\n",
    );
    expect(robotsTxt({ ...store, preview: true }, { disallow: [] })).toBe(
      "User-agent: *\nDisallow: /\n",
    );
    expect(robotsTxt({ ...store, availability: "coming-soon" }, { disallow: [] })).toBe(
      "User-agent: *\nDisallow: /\n",
    );
  });

  it("sitemaps escape paths and use the canonical host", () => {
    const xml = sitemapXml(store, [
      { path: "/pages/a&b", updatedAt: new Date(Date.UTC(2026, 0, 1)) },
      { path: "/", updatedAt: null },
    ]);
    expect(xml).toContain("<loc>https://clay.storevia.site/pages/a&#38;b</loc>");
    expect(xml).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<loc>https://clay.storevia.site/</loc>");
  });

  it("JSON-LD can't close its script element", () => {
    const json = jsonLdJson({ name: "</script><script>alert(1)</script>&" });
    expect(json).not.toMatch(/[<>&]/);
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script>&" });
    const html = renderToStaticMarkup(<JsonLd data={{ a: "</script>" }} nonce="n" />);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe("shell", () => {
  it("renders the site's name and theme with the composition's slots, escaped", () => {
    const html = renderToStaticMarkup(
      <SiteShell
        site={{ ...store, name: "<Clay & Co>" }}
        nonce="abc"
        nav={<nav>menu</nav>}
        actions={<a href="/x">action</a>}
      >
        <main id="main">body</main>
      </SiteShell>,
    );
    expect(html).toContain('<html lang="en-IN">');
    expect(html).toContain("--sv-color-primary");
    expect(html).toContain('nonce="abc"');
    expect(html).toContain("&lt;Clay &amp; Co&gt;");
    expect(html).not.toContain("<Clay");
    expect(html).toContain("<nav>menu</nav>");
    expect(html).toContain('<main id="main">body</main>');
    expect(html).not.toContain("Preview:");
    expect(
      renderToStaticMarkup(
        <SiteShell site={{ ...store, preview: true }} nonce={undefined}>
          x
        </SiteShell>,
      ),
    ).toContain("Preview:");
  });
});

describe("cache tags", () => {
  const STORE = store.storeId;
  const OTHER = store.organisationId;
  const event = (type: string, payload: unknown = {}) => ({
    type,
    storeId: STORE,
    entityType: "Page",
    entityId: OTHER,
    payload,
  });

  it("map site events, and anything unknown to the whole site", () => {
    expect(siteCacheTagsForEvent(event("page.changed"))).toEqual([`pages:${STORE}`]);
    expect(siteCacheTagsForEvent(event("store.changed"))).toEqual([`store:${STORE}`]);
    expect(siteCacheTagsForEvent(event("something.new"))).toEqual([`store:${STORE}`]);
    expect(siteCacheTagsForEvent(event("domain.changed", { hostnames: ["a.example", 1] }))).toEqual(
      [`store:${STORE}`, "host:a.example"],
    );
  });

  it("compose a composition's mapper before the site's", () => {
    const mapped = composeEventTags((e) => (e.type === "x.changed" ? [`x:${e.entityId}`] : null));
    expect(mapped(event("x.changed"))).toEqual([`x:${OTHER}`]);
    expect(mapped(event("page.changed"))).toEqual([`pages:${STORE}`]);
  });

  it("accept only well-formed tags in known namespaces", () => {
    expect(isSiteCacheTag(`store:${STORE}`)).toBe(true);
    expect(isSiteCacheTag(`pages:${STORE}`)).toBe(true);
    expect(isSiteCacheTag("host:shop.example.com")).toBe(true);
    for (const bad of [
      "store:x",
      "host:",
      "host:A B",
      `other:${STORE}`,
      `store:${STORE} `,
      1,
      null,
    ]) {
      expect(isSiteCacheTag(bad)).toBe(false);
    }
    expect(cacheTagGrammar(["store", "product"])(`product:${STORE}`)).toBe(true);
    expect(() => cacheTagGrammar(["bad ns"])).toThrow();
    expect(() => cacheTagGrammar(["host"])).toThrow();
  });
});
