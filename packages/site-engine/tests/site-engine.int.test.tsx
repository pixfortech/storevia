// The architectural test (ADR-0029 §2): with no Storevia Commerce module
// loaded, the Site Engine resolves a merchant hostname, establishes the
// signed public context, enforces access state (live, coming soon,
// unavailable, preview), delivers safe media URLs, produces canonical URLs,
// robots and a sitemap, reads published content, and renders a
// merchant-branded shell. (The boundary unit test proves no commerce module
// is reachable from here.)
process.env["STOREFRONT_PREVIEW_SECRET"] = "site-engine-test-preview-secret-00000000";
process.env["STOREFRONT_REVALIDATE_SECRET"] = "site-engine-test-revalidate-secret-00000";
process.env["STOREFRONT_PROTOCOL"] = "http";
process.env["STOREFRONT_ROOT_DOMAIN"] = "site.test";
process.env["MEDIA_UPLOAD_SECRET"] ??= "site-engine-test-media-secret-000000000000";

import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { signPreviewToken } from "@storevia/domains";
import { invalidateHostCache } from "@storevia/domains/resolver";
import { toTypeId } from "@storevia/types";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pageDataCache } from "../src/cache";
import { isSiteCacheTag } from "../src/cache-tags";
import { STORE_HEADER, verifyStoreHeader, type StoreRequestContext } from "../src/context";
import { internalHeaderKey } from "../src/env";
import { handlePublicRequest } from "../src/pipeline";
import { readPublicSite } from "../src/read";
import { handleRevalidation, revalidationHeaders } from "../src/revalidate";
import { canonicalUrl, robotsTxt, sitemapXml } from "../src/seo";
import { SiteShell } from "../src/shell";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const ORG = uuid(1);
const LIVE = uuid(2);
const DRAFT = uuid(3);
const CLOSED = uuid(4);
const OTHER_ORG = uuid(5);
const OTHER = uuid(6);
const MEDIA = uuid(7);
const OPTIONS = { internalPaths: new Set(["/api/health"]) };

async function store(id: string, org: string, slug: string, status: string, hosts: string[]) {
  const db = migratorDb();
  const name = slug === "clay" ? "Clay & Co" : slug;
  await db.$executeRaw`
    INSERT INTO "Store" (id, "organisationId", name, slug, status, currency, locale, timezone, country, "updatedAt")
    VALUES (${id}::uuid, ${org}::uuid, ${name}, ${slug}, ${status}::"StoreStatus", 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`;
  for (const [i, host] of hosts.entries()) {
    const primary = i === 0;
    await db.$executeRaw`
      INSERT INTO "StoreDomain" (id, "organisationId", "storeId", hostname, type, status, "verificationToken", "isPrimary", "updatedAt")
      VALUES (gen_random_uuid(), ${org}::uuid, ${id}::uuid, ${host}, 'PLATFORM_SUBDOMAIN', 'ACTIVE', 'x', ${primary}, now())`;
  }
}

async function page(storeId: string, org: string, pageId: number, handle: string) {
  const db = migratorDb();
  const p = uuid(pageId);
  const v = uuid(pageId + 1);
  await db.$transaction([
    db.$executeRaw`INSERT INTO "Page" (id, "organisationId", "storeId", kind, title, handle, "updatedAt")
      VALUES (${p}::uuid, ${org}::uuid, ${storeId}::uuid, 'STANDARD', 'About us', ${handle}, now())`,
    db.$executeRaw`INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state, "schemaVersion", document, "documentHash", "publishedAt", "updatedAt")
      VALUES (${v}::uuid, ${org}::uuid, ${storeId}::uuid, ${p}::uuid, 1, 'PUBLISHED', 1, '{"schemaVersion":1,"root":[]}', ${"a".repeat(64)}, now(), now())`,
    db.$executeRaw`UPDATE "Page" SET "publishedVersionId" = ${v}::uuid WHERE id = ${p}::uuid`,
  ]);
  return p;
}

let aboutPage = "";

beforeAll(async () => {
  await truncateAll();
  const db = migratorDb();
  await db.$executeRaw`INSERT INTO "Organisation" (id, name, "updatedAt") VALUES (${ORG}::uuid, 'Org', now()), (${OTHER_ORG}::uuid, 'Other', now())`;
  await store(LIVE, ORG, "clay", "ACTIVE", ["clay.site.test", "old-clay.site.test"]);
  await store(DRAFT, ORG, "soon", "DRAFT", ["soon.site.test"]);
  await store(CLOSED, ORG, "closed", "SUSPENDED", ["closed.site.test"]);
  await store(OTHER, OTHER_ORG, "other", "ACTIVE", ["other.site.test"]);
  aboutPage = await page(LIVE, ORG, 100, "about");
  await page(OTHER, OTHER_ORG, 200, "secret");
  const key = (name: string) => `${ORG}/${LIVE}/${MEDIA}/${name}`;
  const original = key("original.jpg");
  const renditions = JSON.stringify([
    { key: key("w320.webp"), width: 320, height: 240, format: "webp", bytes: 10 },
    { key: `uploads/${ORG}/${LIVE}/${MEDIA}`, width: 640, height: 480, format: "webp", bytes: 10 },
  ]);
  await db.$executeRaw`
    INSERT INTO "MediaAsset" (id, "organisationId", "storeId", kind, status, filename, "declaredMimeType", "mimeType", "sizeBytes", "storageKey", renditions, "updatedAt")
    VALUES (${MEDIA}::uuid, ${ORG}::uuid, ${LIVE}::uuid, 'IMAGE', 'READY', 'a.jpg', 'image/jpeg', 'image/jpeg', 100, ${original}, ${renditions}::jsonb, now())`;
});

beforeEach(() => {
  invalidateHostCache();
});

afterAll(disconnectTestClients);

const request = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { headers: { host: new URL(url).host, ...headers } });

function forwardedContext(response: Response): StoreRequestContext | null {
  return verifyStoreHeader(
    response.headers.get(`x-middleware-request-${STORE_HEADER}`),
    internalHeaderKey(),
  );
}

describe("host resolution, context and access state", () => {
  it("an unknown host gets a site-free 404", async () => {
    const response = await handlePublicRequest(request("http://nobody.site.test/"), OPTIONS);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("There&#39;s no site here");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("a secondary host redirects permanently to the primary, keeping path and query", async () => {
    const response = await handlePublicRequest(
      request("http://OLD-clay.site.test./pages/about?x=1"),
      OPTIONS,
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("http://clay.site.test/pages/about?x=1");
  });

  it("a live site is rewritten under its own id with a signed context; a forged one is dropped", async () => {
    const response = await handlePublicRequest(
      request("http://clay.site.test/sv/" + OTHER + "/pages/about", {
        [STORE_HEADER]: "forged.value",
      }),
      OPTIONS,
    );
    expect(new URL(response.headers.get("x-middleware-rewrite") ?? "").pathname).toBe(
      `/sv/${LIVE}/sv/${OTHER}/pages/about`,
    );
    const ctx = forwardedContext(response);
    expect(ctx).toMatchObject({
      storeId: LIVE,
      organisationId: ORG,
      name: "Clay & Co",
      canonicalHostname: "clay.site.test",
      availability: "live",
      preview: false,
    });
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("a draft site shows coming soon, a suspended one is unavailable, both noindex", async () => {
    const soon = await handlePublicRequest(request("http://soon.site.test/pages/about"), OPTIONS);
    expect(new URL(soon.headers.get("x-middleware-rewrite") ?? "").pathname).toBe(
      "/status/coming-soon",
    );
    expect(soon.headers.get("x-robots-tag")).toBe("noindex");
    const closed = await handlePublicRequest(request("http://closed.site.test/"), OPTIONS);
    expect(new URL(closed.headers.get("x-middleware-rewrite") ?? "").pathname).toBe(
      "/status/unavailable",
    );
    expect(forwardedContext(closed)?.availability).toBe("unavailable");
  });

  it("a preview link for this site becomes a host-only cookie; one for another site is ignored", async () => {
    const secret = process.env["STOREFRONT_PREVIEW_SECRET"] ?? "";
    const exchange = await handlePublicRequest(
      request(`http://soon.site.test/pages/about?preview=${signPreviewToken(DRAFT, secret)}`),
      OPTIONS,
    );
    expect(exchange.status).toBe(303);
    expect(exchange.headers.get("location")).toBe("http://soon.site.test/pages/about");
    const cookie = exchange.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^sv_preview=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Domain=/i);
    const token = /^sv_preview=([^;]+)/.exec(cookie)?.[1] ?? "";
    const previewing = await handlePublicRequest(
      request("http://soon.site.test/pages/about", { cookie: `sv_preview=${token}` }),
      OPTIONS,
    );
    expect(forwardedContext(previewing)).toMatchObject({ storeId: DRAFT, preview: true });

    const foreign = await handlePublicRequest(
      request(`http://soon.site.test/?preview=${signPreviewToken(LIVE, secret)}`),
      OPTIONS,
    );
    expect(foreign.headers.get("set-cookie")).toBeNull();
  });
});

describe("content, media, SEO and shell without commerce", () => {
  const ctx = {
    availability: "live",
    preview: false,
    canonicalHostname: "clay.site.test",
  } as const;
  const scope = { organisationId: ORG, storeId: LIVE };

  it("reads published pages, page links, safe media and content sitemap entries for this site only", async () => {
    const result = await readPublicSite(scope, async (site) => ({
      about: await site.publishedPage("STANDARD", "about"),
      secret: await site.publishedPage("STANDARD", "secret"),
      noHandle: await site.publishedPage("STANDARD"),
      links: await site.pageLinks(["page_garbage", toTypeId("page", aboutPage)]),
      media: await site.media([toTypeId("media", MEDIA)]),
      sitemap: await site.sitemapPages(),
    }));
    expect(result.about).toMatchObject({ kind: "STANDARD", handle: "about", title: "About us" });
    expect(result.secret).toBeNull();
    expect(result.noHandle).toBeNull();
    expect([...result.links.values()]).toEqual(["about"]);
    const image = result.media.get(toTypeId("media", MEDIA));
    expect(image?.url).toContain(`${ORG}/${LIVE}/${MEDIA}/w320.webp`);
    // A tampered rendition pointing at the raw upload never becomes a URL.
    expect(image?.srcSet).not.toContain("uploads/");
    expect(result.sitemap.map((e) => e.path)).toEqual(["/pages/about"]);
  });

  it("generates canonical URLs, robots and a sitemap on the primary host", () => {
    expect(canonicalUrl(ctx, "/pages/about")).toBe("http://clay.site.test/pages/about");
    expect(robotsTxt(ctx, { disallow: [] })).toContain(
      "Sitemap: http://clay.site.test/sitemap.xml",
    );
    expect(sitemapXml(ctx, [{ path: "/pages/about", updatedAt: null }])).toContain(
      "<loc>http://clay.site.test/pages/about</loc>",
    );
  });

  it("renders a merchant-branded shell", () => {
    const html = renderToStaticMarkup(
      <SiteShell
        site={{ name: "Clay & Co", locale: "en-IN", preview: false, availability: "live" }}
        nonce="n"
      >
        <main id="main">About us</main>
      </SiteShell>,
    );
    expect(html).toContain("Clay &amp; Co");
    expect(html).toContain("--sv-color-primary");
    expect(html).toContain("About us");
  });

  it("invalidates its caches only on a signed request", async () => {
    const tag = `pages:${LIVE}`;
    await pageDataCache().get("k", () => Promise.resolve({ value: 1, tags: [tag] }));
    const body = JSON.stringify({ tags: [tag] });
    const secret = process.env["STOREFRONT_REVALIDATE_SECRET"] ?? "";
    const unsigned = await handleRevalidation(
      new Request("http://x/api/internal/revalidate", { method: "POST", body }),
      { secret, isTag: isSiteCacheTag },
    );
    expect(unsigned.status).toBe(401);
    const signed = await handleRevalidation(
      new Request("http://x/api/internal/revalidate", {
        method: "POST",
        body,
        headers: revalidationHeaders(body, secret),
      }),
      { secret, isTag: isSiteCacheTag },
    );
    expect(await signed.json()).toEqual({ tags: 1, dropped: 1 });
  });
});
