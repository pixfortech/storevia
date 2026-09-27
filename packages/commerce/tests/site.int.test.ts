// Site services with the Storevia composition (ADR-0030 §5–§8): pages from
// draft to publish, optimistic concurrency, validation and same-store
// references, RBAC, tenant isolation, theme settings and menus, and the
// public read of what was published (or, in a preview, drafted).
import {
  countQueries,
  disconnectTestClients,
  migratorDb,
  truncateAll,
} from "@storevia/database/testing";
import { validateDocument, type PageDocument } from "@storevia/editor/document";
import {
  DRAFT_CONFLICT_MESSAGE,
  createPage,
  deletePage,
  getMenus,
  getStoreTheme,
  listPages,
  openPageDraft,
  publishPage,
  publishTheme,
  savePageDraft,
  saveMenu,
  saveThemeDraft,
  unpublishPage,
  updatePageSettings,
} from "@storevia/site-admin";
import { readPublicSite } from "@storevia/site-engine/read";
import { DEFAULT_THEME_SETTINGS } from "@storevia/site-engine/theme";
import type { StoreContext } from "@storevia/tenancy";
import { toTypeId } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCollection, createProduct } from "../src";
import { STOREVIA_SITE } from "../src/site";
import { STOREVIA_REGISTRY } from "../src/blocks";
import {
  canvasDocument,
  loadCanvasData,
  readStorefront,
  resolveDocumentData,
} from "../src/storefront";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

// Resolving media (the builder canvas, the query budget) signs local media
// URLs; CI provides no secret for them.
process.env["MEDIA_UPLOAD_SECRET"] ??= "commerce-site-test-media-secret-0000000000";

let tenantA: Tenant;
let tenantB: Tenant;
let A: StoreContext;
let B: StoreContext;
let homeA = "";
let homeB = "";

const scope = (ctx: StoreContext) => ({ organisationId: ctx.organisationId, storeId: ctx.storeId });
const section = (id: string, type: string, props: object = {}) => ({ id, type, props, styles: {} });
const doc = (...root: object[]): PageDocument => ({ schemaVersion: 1, root }) as PageDocument;

async function readyMedia(ctx: StoreContext, status = "READY"): Promise<string> {
  const id = crypto.randomUUID();
  await migratorDb().$executeRaw`
    INSERT INTO "MediaAsset" (id, "organisationId", "storeId", kind, status, filename, "declaredMimeType", "storageKey", renditions, "updatedAt")
    VALUES (${id}::uuid, ${ctx.organisationId}::uuid, ${ctx.storeId}::uuid, 'IMAGE', ${status}::"MediaStatus", 'a.jpg', 'image/jpeg',
            ${`${ctx.organisationId}/${ctx.storeId}/${id}/original.jpg`},
            ${JSON.stringify([{ key: `${ctx.organisationId}/${ctx.storeId}/${id}/w640.webp`, width: 640, height: 480, format: "webp", bytes: 1000 }])}::jsonb, now())`;
  return toTypeId("media", id);
}

async function homeId(ctx: StoreContext): Promise<string> {
  const pages = await listPages(ctx);
  const home = pages.find((p) => p.kind === "HOME");
  if (!home) throw new Error("no home page");
  return home.id;
}

beforeAll(async () => {
  await truncateAll();
  tenantA = await makeTenant("site-a");
  tenantB = await makeTenant("site-b");
  A = storeOf(tenantA);
  B = storeOf(tenantB);
  homeA = await homeId(A);
  homeB = await homeId(B);
});

afterAll(async () => {
  await disconnectTestClients();
});

describe("pages: draft and publish", () => {
  it("every store starts with its published home page", async () => {
    expect(await listPages(A)).toEqual([
      expect.objectContaining({ kind: "HOME", title: "Home", handle: "home", status: "published" }),
    ]);
  });

  it("opening the builder creates one draft from the published version, however many tabs open it", async () => {
    const [one, two] = await Promise.all([
      openPageDraft(A, homeA, STOREVIA_SITE),
      openPageDraft(A, homeA, STOREVIA_SITE),
    ]);
    expect(one.revision).toBe(0);
    expect(two.versionNumber).toBe(one.versionNumber);
    expect(one.versionNumber).toBe(2);
    expect(one.status).toBe("published");
    expect(one.document.root.map((n) => n.type)).toEqual([
      "hero",
      "collection-list",
      "featured-products",
    ]);
    const { count } = (
      await migratorDb().$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM "PageVersion" WHERE "storeId" = ${A.storeId}::uuid AND state = 'DRAFT'`
    )[0] ?? { count: 0n };
    expect(count).toBe(1n);
  });

  it("saves with optimistic concurrency: a stale revision never overwrites", async () => {
    const draft = await openPageDraft(A, homeA, STOREVIA_SITE);
    const tabOne = doc(section("heroSectionA", "hero", { heading: "Tab one" }));
    const tabTwo = doc(section("heroSectionA", "hero", { heading: "Tab two" }));
    const saved = await savePageDraft(
      A,
      homeA,
      { revision: draft.revision, document: tabOne },
      STOREVIA_SITE,
    );
    expect(saved).toEqual({ revision: draft.revision + 1, status: "changes" });
    await expect(
      savePageDraft(A, homeA, { revision: draft.revision, document: tabTwo }, STOREVIA_SITE),
    ).rejects.toMatchObject({ code: "CONFLICT", message: DRAFT_CONFLICT_MESSAGE });
    const reopened = await openPageDraft(A, homeA, STOREVIA_SITE);
    expect(reopened.revision).toBe(saved.revision);
    expect(reopened.document.root[0]?.props["heading"]).toBe("Tab one");
  });

  it("refuses invalid documents: unknown blocks, unsafe links, extra keys, limits", async () => {
    const draft = await openPageDraft(A, homeA, STOREVIA_SITE);
    const save = (document: unknown) =>
      savePageDraft(A, homeA, { revision: draft.revision, document }, STOREVIA_SITE);
    for (const bad of [
      doc(section("unknownBlock", "marquee")),
      doc(
        section("unsafeLink01", "hero", {
          cta: { label: "x", link: { type: "url", href: "javascript:alert(1)" } },
        }),
      ),
      doc(section("scriptProp01", "hero", { heading: "<script>", onload: "x" })),
      doc(section("productPage1", "product-detail")),
      { schemaVersion: 2, root: [] },
      {
        schemaVersion: 1,
        root: Array.from({ length: 41 }, (_, i) =>
          section(`faq${String(i).padStart(9, "0")}`, "faq"),
        ),
      },
      "{",
      null,
    ]) {
      await expectCode(save(bad), "VALIDATION_FAILED");
    }
    // Nothing was written.
    expect((await openPageDraft(A, homeA, STOREVIA_SITE)).revision).toBe(draft.revision);
  });

  it("refuses references to another store's media, pages, products and collections", async () => {
    const draft = await openPageDraft(A, homeA, STOREVIA_SITE);
    const save = (document: unknown) =>
      savePageDraft(A, homeA, { revision: draft.revision, document }, STOREVIA_SITE);
    const foreignMedia = await readyMedia(B);
    const processing = await readyMedia(A, "PROCESSING");
    const { productId } = await createProduct(B, { title: "B's mug" });
    const { collectionId } = await createCollection(B, { title: "B's summer" });
    const cases = [
      section("foreignMedia", "hero", { image: { mediaId: foreignMedia } }),
      section("processingIm", "image-section", { image: { mediaId: processing } }),
      section("foreignPage1", "hero", { cta: { label: "B", link: { type: "page", id: homeB } } }),
      section("foreignProdc", "featured-products", {
        source: { type: "products", ids: [productId] },
      }),
      section("foreignColle", "collection-list", {
        source: { type: "collections", ids: [collectionId] },
      }),
      section("foreignLinkC", "hero", {
        cta: { label: "B", link: { type: "collection", id: collectionId } },
      }),
      // Hidden sections are checked too: they can be shown again later.
      { ...section("hiddenForeig", "hero", { image: { mediaId: foreignMedia } }), hidden: true },
    ];
    for (const bad of cases) await expectCode(save(doc(bad)), "VALIDATION_FAILED");
    // The store's own READY media, products and collections are fine.
    const mine = await readyMedia(A);
    const { productId: own } = await createProduct(A, { title: "A's mug" });
    const ok = await save(
      doc(
        section("heroOwnMedia", "hero", { image: { mediaId: mine, alt: "Kiln" } }),
        section("ownProducts1", "featured-products", { source: { type: "products", ids: [own] } }),
      ),
    );
    expect(ok.revision).toBe(draft.revision + 1);
  });

  it("publishes atomically: old version archived, draft published, pointer moved, site updated", async () => {
    const draft = await openPageDraft(A, homeA, STOREVIA_SITE);
    const published = doc(section("heroSectionA", "hero", { heading: "Autumn is here" }));
    const saved = await savePageDraft(
      A,
      homeA,
      { revision: draft.revision, document: published },
      STOREVIA_SITE,
    );
    // Publishing a revision the merchant hasn't seen is refused.
    await expectCode(
      publishPage(A, homeA, { revision: draft.revision }, STOREVIA_SITE),
      "CONFLICT",
    );
    const before = await readPublicSite(scope(A), (site) => site.page("HOME"));
    expect(before?.document).not.toEqual(published);
    await publishPage(A, homeA, { revision: saved.revision }, STOREVIA_SITE);
    const after = await readPublicSite(scope(A), (site) => site.page("HOME"));
    expect(after).toMatchObject({ state: "PUBLISHED", document: published });
    const states = await migratorDb().$queryRaw<{ state: string; n: bigint }[]>`
      SELECT state::text, count(*) AS n FROM "PageVersion" WHERE "storeId" = ${A.storeId}::uuid GROUP BY 1 ORDER BY 1`;
    expect(states).toEqual([
      { state: "ARCHIVED", n: 1n },
      { state: "PUBLISHED", n: 1n },
    ]);
    const events = await migratorDb().$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "OutboxEvent" WHERE "storeId" = ${A.storeId}::uuid AND type = 'page.changed'`;
    expect(events[0]?.n).toBeGreaterThan(0n);
    // Nothing left to publish until the next edit.
    await expectCode(
      publishPage(A, homeA, { revision: saved.revision }, STOREVIA_SITE),
      "CONFLICT",
    );
    const next = await openPageDraft(A, homeA, STOREVIA_SITE);
    expect(next.versionNumber).toBe(3);
    expect(next.document).toEqual(published);
    expect(next.status).toBe("published");
  });

  it("a draft that became invalid can't be published, and the live page stays as it was", async () => {
    const draft = await openPageDraft(A, homeA, STOREVIA_SITE);
    const media = await readyMedia(A);
    const saved = await savePageDraft(
      A,
      homeA,
      {
        revision: draft.revision,
        document: doc(section("heroWithImag", "hero", { image: { mediaId: media } })),
      },
      STOREVIA_SITE,
    );
    const live = await readPublicSite(scope(A), (site) => site.page("HOME"));
    // The image leaves the library after the save.
    await migratorDb().$executeRaw`
      UPDATE "MediaAsset" SET "deletedAt" = now()
      WHERE "storeId" = ${A.storeId}::uuid AND "deletedAt" IS NULL AND status = 'READY'`;
    await expectCode(
      publishPage(A, homeA, { revision: saved.revision }, STOREVIA_SITE),
      "VALIDATION_FAILED",
    );
    expect(await readPublicSite(scope(A), (site) => site.page("HOME"))).toEqual(live);
  });

  it("previews read the draft; the public site never does", async () => {
    const draft = await openPageDraft(A, homeA, STOREVIA_SITE);
    const secret = doc(section("heroSecret01", "hero", { heading: "Unannounced" }));
    await savePageDraft(A, homeA, { revision: draft.revision, document: secret }, STOREVIA_SITE);
    expect((await readPublicSite(scope(A), (site) => site.page("HOME")))?.document).not.toEqual(
      secret,
    );
    expect(
      (await readPublicSite(scope(A), (site) => site.page("HOME"), { preview: true }))?.document,
    ).toEqual(secret);
    expect(
      (await readPublicSite(scope(B), (site) => site.page("HOME"), { preview: true }))?.document,
    ).not.toEqual(secret);
  });
});

describe("pages: content pages", () => {
  it("creates a draft page with a handle from its title; handles are unique and reserved ones refused", async () => {
    const { pageId } = await createPage(A, { title: "Shipping & Returns" });
    const pages = await listPages(A);
    expect(pages.find((p) => p.id === pageId)).toMatchObject({
      kind: "STANDARD",
      handle: "shipping-returns",
      status: "draft",
    });
    await expect(
      createPage(A, { title: "Other", handle: "shipping-returns" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { handle: "Another page already uses this address." },
    });
    await expectCode(createPage(A, { title: "Cart", handle: "cart" }), "VALIDATION_FAILED");
    await expectCode(createPage(A, { title: "Bad", handle: "Bad Handle" }), "VALIDATION_FAILED");
    await expectCode(createPage(A, { title: "   " }), "VALIDATION_FAILED");
    // Another store may use the same handle.
    expect((await createPage(B, { title: "Shipping & Returns" })).pageId).toBeTruthy();
  });

  it("an unpublished page isn't on the site until it's published; unpublish and delete take it down", async () => {
    const { pageId } = await createPage(A, { title: "About us" });
    const read = () => readPublicSite(scope(A), (site) => site.page("STANDARD", "about-us"));
    expect(await read()).toBeNull();
    const draft = await openPageDraft(A, pageId, STOREVIA_SITE);
    await publishPage(A, pageId, { revision: draft.revision }, STOREVIA_SITE);
    expect(await read()).toMatchObject({ title: "About us", state: "PUBLISHED" });
    const link = await readPublicSite(scope(A), (site) => site.pageLinks([pageId]));
    expect([...link.values()]).toEqual(["about-us"]);

    await updatePageSettings(A, pageId, {
      title: "Our story",
      handle: "our-story",
      seoTitle: "Our story",
      seoDescription: "",
    });
    expect(await read()).toBeNull();
    expect(
      await readPublicSite(scope(A), (site) => site.page("STANDARD", "our-story")),
    ).toMatchObject({
      title: "Our story",
      seoDescription: null,
    });

    await unpublishPage(A, pageId);
    expect(await readPublicSite(scope(A), (site) => site.page("STANDARD", "our-story"))).toBeNull();
    await deletePage(A, pageId);
    expect(await readPublicSite(scope(A), (site) => site.pageLinks([pageId]))).toEqual(new Map());
    expect((await listPages(A)).some((p) => p.id === pageId)).toBe(false);
    await expectCode(openPageDraft(A, pageId, STOREVIA_SITE), "NOT_FOUND");
  });

  it("the home page keeps its address and can't be unpublished or deleted", async () => {
    await updatePageSettings(A, homeA, {
      title: "Welcome",
      handle: "welcome",
      seoTitle: "",
      seoDescription: "",
    });
    expect((await listPages(A)).find((p) => p.id === homeA)).toMatchObject({
      title: "Welcome",
      handle: "home",
    });
    await expectCode(unpublishPage(A, homeA), "CONFLICT");
    await expectCode(deletePage(A, homeA), "CONFLICT");
  });
});

describe("pages: permissions and isolation", () => {
  it("another store's members can't read, edit or publish this store's pages", async () => {
    const draft = await openPageDraft(A, homeA, STOREVIA_SITE);
    await expectCode(openPageDraft(B, homeA, STOREVIA_SITE), "NOT_FOUND");
    await expectCode(
      savePageDraft(B, homeA, { revision: draft.revision, document: doc() }, STOREVIA_SITE),
      "NOT_FOUND",
    );
    await expectCode(
      publishPage(B, homeA, { revision: draft.revision }, STOREVIA_SITE),
      "NOT_FOUND",
    );
    await expectCode(
      updatePageSettings(B, homeA, { title: "x", handle: "x", seoTitle: "", seoDescription: "" }),
      "NOT_FOUND",
    );
    await expectCode(deletePage(B, homeA), "NOT_FOUND");
    expect((await listPages(B)).map((p) => p.id)).not.toContain(homeA);
  });

  it("design.edit edits drafts; only page.publish publishes; viewers do neither", async () => {
    const author = await memberContext(tenantA, "AUTHOR", A);
    const viewer = await memberContext(tenantA, "VIEWER", A);
    const draft = await openPageDraft(author, homeA, STOREVIA_SITE);
    const saved = await savePageDraft(
      author,
      homeA,
      {
        revision: draft.revision,
        document: doc(section("heroAuthor01", "hero", { heading: "By the author" })),
      },
      STOREVIA_SITE,
    );
    await expectCode(
      publishPage(author, homeA, { revision: saved.revision }, STOREVIA_SITE),
      "FORBIDDEN",
    );
    await expectCode(deletePage(author, homeA), "FORBIDDEN");
    await expectCode(openPageDraft(viewer, homeA, STOREVIA_SITE), "FORBIDDEN");
    await expectCode(listPages(viewer), "FORBIDDEN");
    await expectCode(
      savePageDraft(viewer, homeA, { revision: saved.revision, document: doc() }, STOREVIA_SITE),
      "FORBIDDEN",
    );
    const editor = await memberContext(tenantA, "EDITOR", A);
    await publishPage(editor, homeA, { revision: saved.revision }, STOREVIA_SITE);
    const live = (await readPublicSite(scope(A), (site) => site.page("HOME")))?.document as
      PageDocument | undefined;
    expect(live?.root[0]?.props["heading"]).toBe("By the author");
  });

  it("forged or malformed page ids are simply not found", async () => {
    for (const id of [
      "page_nope",
      "",
      homeA.replace("page_", "prod_"),
      toTypeId("page", crypto.randomUUID()),
    ]) {
      await expectCode(openPageDraft(A, id, STOREVIA_SITE), "NOT_FOUND");
    }
  });
});

describe("builder canvas data", () => {
  it("resolves only this store's live records, and only sections that validate", async () => {
    const own = await readyMedia(A);
    const ownInInvalidSection = await readyMedia(A);
    const foreign = await readyMedia(B);
    const { productId: mine } = await createProduct(A, {
      title: "Canvas mug",
      price: "10",
      status: "ACTIVE",
    });
    const { productId: theirs } = await createProduct(B, {
      title: "Other store's mug",
      price: "10",
      status: "ACTIVE",
    });
    const data = await loadCanvasData(
      A,
      doc(
        section("canvasHero01", "hero", { image: { mediaId: own, alt: "" } }),
        section("canvasHero02", "hero", { image: { mediaId: foreign, alt: "" } }),
        section("canvasProds1", "featured-products", {
          source: { type: "products", ids: [mine, theirs] },
        }),
        // Invalid sections are left out, so their references are never read.
        section("canvasBadLnk", "hero", {
          image: { mediaId: ownInInvalidSection, alt: "" },
          cta: { label: "x", link: { type: "url", href: "javascript:alert(1)" } },
        }),
        section("canvasUnknwn", "script", { src: "https://evil.example/x.js" }),
      ),
      "HOME",
    );
    expect(data.media.map(([id]) => id)).toEqual([own]);
    const titles = data.productLists.flatMap(([, items]) => items.map((p) => p.title));
    expect(titles).toEqual(["Canvas mug"]);

    // Another store's member gets nothing of this store, whatever ids they send.
    const other = await loadCanvasData(
      B,
      doc(
        section("canvasHero03", "hero", { image: { mediaId: own, alt: "" } }),
        section("canvasProds2", "featured-products", {
          source: { type: "products", ids: [mine] },
        }),
      ),
      "HOME",
    );
    expect(other.media).toEqual([]);
    expect(other.productLists.flatMap(([, items]) => items)).toEqual([]);

    // At most 40 sections are read, however many the browser sends.
    const beyond = await readyMedia(A);
    const crowded = await loadCanvasData(
      A,
      doc(
        ...Array.from({ length: 40 }, (_, i) =>
          section(`canvasFill${String(i).padStart(2, "0")}`, "text-section", { heading: "x" }),
        ),
        section("canvasBeyond", "hero", { image: { mediaId: beyond, alt: "" } }),
      ),
      "HOME",
    );
    expect(crowded.media).toEqual([]);

    // Viewers can't use it.
    const viewer = await memberContext(tenantA, "VIEWER", A);
    await expectCode(loadCanvasData(viewer, doc(), "HOME"), "FORBIDDEN");
  });

  it("keeps a bounded number of valid sections from whatever the browser sends", () => {
    const hero = (i: number) =>
      section(`canvasMany${String(i).padStart(2, "0")}`, "hero", { heading: `Hero ${String(i)}` });
    const many = canvasDocument(doc(...Array.from({ length: 60 }, (_, i) => hero(i))), "HOME");
    expect(many.root).toHaveLength(40);
    for (const junk of [null, "x", 1, { root: "x" }, { root: [null, 1, "x"] }, []]) {
      expect(canvasDocument(junk, "HOME").root).toEqual([]);
    }
    const huge = section("canvasHuge01", "hero", { heading: "x".repeat(2_000_000) });
    expect(canvasDocument(doc(huge), "HOME").root).toEqual([]);
  });
});

describe("theme", () => {
  it("starts from the default preset, saves drafts with concurrency and publishes on its own permission", async () => {
    const initial = await getStoreTheme(A);
    expect(initial).toMatchObject({
      revision: 0,
      draft: DEFAULT_THEME_SETTINGS,
      hasUnpublishedChanges: false,
    });
    const modern = {
      ...DEFAULT_THEME_SETTINGS,
      preset: "modern",
      buttonStyle: "pill",
      colors: { ...DEFAULT_THEME_SETTINGS.colors, primary: "#4338ca" },
    };
    const saved = await saveThemeDraft(A, { revision: 0, settings: modern });
    expect(saved).toMatchObject({ revision: 1, hasUnpublishedChanges: true });
    await expectCode(saveThemeDraft(A, { revision: 0, settings: modern }), "CONFLICT");
    // A second tab saves on top; the first tab's stale revision is refused.
    expect(await saveThemeDraft(A, { revision: 1, settings: modern })).toMatchObject({
      revision: 2,
    });
    await expectCode(
      saveThemeDraft(A, { revision: 1, settings: { ...modern, preset: "minimal" } }),
      "CONFLICT",
    );
    expect((await getStoreTheme(A)).draft).toMatchObject({ preset: "modern" });
    await expectCode(
      saveThemeDraft(A, {
        revision: 2,
        settings: { ...modern, colors: { ...modern.colors, text: "#fafafa" } },
      }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      saveThemeDraft(A, { revision: 2, settings: { ...modern, css: "body{}" } }),
      "VALIDATION_FAILED",
    );

    expect(await readPublicSite(scope(A), (site) => site.theme())).toBeNull();
    const preview = await readPublicSite(scope(A), (site) => site.theme(), { preview: true });
    expect(preview?.settings).toMatchObject({ preset: "modern" });

    const author = await memberContext(tenantA, "AUTHOR", A);
    await expectCode(publishTheme(author, { revision: 2 }), "FORBIDDEN");
    await expectCode(publishTheme(A, { revision: 1 }), "CONFLICT");
    const live = await publishTheme(A, { revision: 2 });
    expect(live.hasUnpublishedChanges).toBe(false);
    expect((await readPublicSite(scope(A), (site) => site.theme()))?.settings).toMatchObject({
      preset: "modern",
    });
    expect(await readPublicSite(scope(B), (site) => site.theme())).toBeNull();
    const events = await migratorDb().$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "OutboxEvent" WHERE "storeId" = ${A.storeId}::uuid AND type = 'theme.changed'`;
    expect(events[0]?.n).toBe(1n);
  });
});

describe("menus", () => {
  it("save typed links with concurrency; foreign ids and unsafe URLs are refused", async () => {
    const menus = await getMenus(A, STOREVIA_SITE);
    expect(menus.map((m) => [m.handle, m.saved])).toEqual([
      ["main", false],
      ["footer", false],
    ]);
    const { collectionId } = await createCollection(A, { title: "Summer" });
    const items = [
      { id: "menuItemHome", label: "Home", link: { type: "home" } },
      { id: "menuItemColl", label: "Summer", link: { type: "collection", id: collectionId } },
      {
        id: "menuItemSite",
        label: "Blog",
        link: { type: "url", href: "https://blog.example.com" },
      },
    ];
    const saved = await saveMenu(A, "main", { revision: 0, items }, STOREVIA_SITE);
    expect(saved).toMatchObject({ revision: 1, saved: true });
    await expectCode(saveMenu(A, "main", { revision: 0, items }, STOREVIA_SITE), "CONFLICT");
    // A second tab saves on top; the first tab's stale revision is refused.
    const reordered = [items[2], items[0], items[1]];
    expect(
      await saveMenu(A, "main", { revision: 1, items: reordered }, STOREVIA_SITE),
    ).toMatchObject({ revision: 2 });
    await expectCode(saveMenu(A, "main", { revision: 1, items }, STOREVIA_SITE), "CONFLICT");
    // design.edit alone doesn't manage menus: authors and editors can't.
    for (const role of ["AUTHOR", "EDITOR"] as const) {
      const member = await memberContext(tenantA, role, A);
      await expectCode(
        saveMenu(member, "main", { revision: 2, items }, STOREVIA_SITE),
        "FORBIDDEN",
      );
    }
    const { collectionId: foreign } = await createCollection(B, { title: "B only" });
    for (const bad of [
      [{ id: "menuItemBadA", label: "x", link: { type: "collection", id: foreign } }],
      [{ id: "menuItemBadB", label: "x", link: { type: "page", id: homeB } }],
      [{ id: "menuItemBadC", label: "x", link: { type: "url", href: "javascript:alert(1)" } }],
      [{ id: "menuItemBadD", label: "x", link: { type: "url", href: "data:text/html,x" } }],
      [{ id: "menuItemBadE", label: "", link: { type: "home" } }],
      Array.from({ length: 21 }, (_, i) => ({
        id: `menuItem${String(i).padStart(4, "0")}`,
        label: "x",
        link: { type: "home" },
      })),
    ]) {
      await expectCode(
        saveMenu(A, "main", { revision: 1, items: bad }, STOREVIA_SITE),
        "VALIDATION_FAILED",
      );
    }
    await expectCode(
      saveMenu(A, "sidebar", { revision: 0, items: [] }, STOREVIA_SITE),
      "NOT_FOUND",
    );
    const viewer = await memberContext(tenantA, "VIEWER", A);
    await expectCode(getMenus(viewer, STOREVIA_SITE), "FORBIDDEN");
    const stored = await readPublicSite(scope(A), (site) => site.navigation(["main", "footer"]));
    expect(stored.get("main")).toEqual(reordered);
    expect(stored.has("footer")).toBe(false);
    expect((await readPublicSite(scope(B), (site) => site.navigation(["main"]))).size).toBe(0);
  });
});

describe("query budget (M5): stored pages resolve their data in batches", () => {
  /** A page with one of every section, each showing real data where it can. */
  async function everySection(images: number, products: number) {
    const media = await Promise.all(Array.from({ length: images }, () => readyMedia(A)));
    const { collectionId } = await createCollection(A, { title: `Budget ${String(images)}` });
    const ids = await Promise.all(
      Array.from({ length: products }, (_, i) =>
        createProduct(A, {
          title: `Budget ${String(images)}-${String(i)}`,
          price: "10",
          status: "ACTIVE",
        }),
      ),
    );
    const props: Record<string, object> = {
      hero: {
        image: { mediaId: media[0], alt: "" },
        cta: { label: "Home", link: { type: "home" } },
      },
      "image-section": { image: { mediaId: media[0], alt: "" } },
      gallery: { images: media.map((mediaId) => ({ image: { mediaId, alt: "" }, caption: "" })) },
      "call-to-action": {
        heading: "Visit",
        action: { label: "Shop", link: { type: "collection", id: collectionId } },
      },
      "featured-products": { source: { type: "products", ids: ids.map((p) => p.productId) } },
      "collection-list": { source: { type: "collections", ids: [collectionId] } },
    };
    const root = STOREVIA_REGISTRY.sections.map((definition, i) => ({
      id: `budgetSect${String(i).padStart(2, "0")}`,
      type: definition.type,
      props: { ...definition.defaultProps, ...(props[definition.type] ?? {}) },
      styles: {},
    }));
    // Two more product lists of other kinds, as a home page has.
    const featured = STOREVIA_REGISTRY.get("featured-products")?.defaultProps ?? {};
    root.push(
      {
        id: "budgetLatest",
        type: "featured-products",
        props: {
          ...featured,
          source: { type: "catalogue" },
        },
        styles: {},
      },
      {
        id: "budgetCollec",
        type: "featured-products",
        props: {
          ...featured,
          source: { type: "collection", id: collectionId },
        },
        styles: {},
      },
    );
    const result = validateDocument(
      { schemaVersion: 1, root },
      { registry: STOREVIA_REGISTRY, pageKind: "HOME" },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.document;
  }

  const render = (document: PageDocument) =>
    countQueries(() =>
      readStorefront(scope(A), async (reader, site) => {
        await site.page("HOME");
        return resolveDocumentData([document], STOREVIA_REGISTRY, reader, site);
      }),
    );

  it("a page with every section costs a fixed number of queries, however much it shows", async () => {
    const small = await render(await everySection(1, 1));
    const large = await render(await everySection(12, 12));
    expect(small.result.data.media.length).toBe(1);
    expect(large.result.data.media.length).toBe(12);
    expect(large.queries.length).toBe(small.queries.length);
    expect(large.queries.length).toBeLessThanOrEqual(8);
  });

  it("the store chrome (theme, menus and their links) costs a fixed number of queries", async () => {
    const { collectionId } = await createCollection(A, { title: "Menu budget" });
    await saveMenu(
      A,
      "footer",
      {
        revision: 0,
        items: [
          { id: "budgetFoot01", label: "Home", link: { type: "home" } },
          { id: "budgetFoot02", label: "Home page", link: { type: "page", id: homeA } },
          { id: "budgetFoot03", label: "Shop", link: { type: "collection", id: collectionId } },
          { id: "budgetFoot04", label: "Search", link: { type: "search" } },
        ],
      },
      STOREVIA_SITE,
    );
    const chrome = await countQueries(() =>
      readStorefront(scope(A), async (reader, site) => {
        const [, menus] = await Promise.all([site.theme(), site.navigation(["main", "footer"])]);
        const links = [
          ...((menus.get("main") as { link: never }[] | undefined) ?? []),
          ...(menus.get("footer") as { link: never }[]),
        ].map((i) => i.link);
        await resolveDocumentData([], STOREVIA_REGISTRY, reader, site, links);
        await reader.navigationCollections();
      }),
    );
    expect(chrome.queries.length).toBeLessThanOrEqual(6);
  });
});
