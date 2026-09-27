// Storevia commerce composed into the Site Engine's page system (ADR-0030
// §2–§4): the Storevia registry, commerce link kinds and data sources, the
// commerce components and section blocks, templates, and the serialisable
// page data blocks render from.
import { validateDocument, type BuilderNode, type PageDocument } from "@storevia/editor/document";
import { SITE_REGISTRY, dataRequestKey } from "@storevia/editor/registry";
import { RenderDocument, collectRequirements, compileDocumentCss } from "@storevia/editor/render";
import { SITE_HOME_DOCUMENT } from "@storevia/editor/templates";
import { toTypeId } from "@storevia/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  COMMERCE_BLOCK_CSS,
  EMPTY_DOCUMENT_DATA,
  STOREVIA_REGISTRY,
  STOREVIA_TEMPLATES,
  STORE_HOME_DOCUMENT,
  collectCatalogueIds,
  collectionListKey,
  documentRenderData,
  productListKey,
  type CommerceRenderContext,
  type CommerceRenderData,
  type DocumentData,
  type StoreviaPageKind,
} from ".";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const PRODUCT_ID = toTypeId("product", uuid(1));
const COLLECTION_ID = toTypeId("collection", uuid(2));
const MEDIA_ID = toTypeId("media", uuid(3));

let counter = 0;
const node = (type: string, props: object = {}, extra: Partial<BuilderNode> = {}): BuilderNode => ({
  id: `node${String(++counter).padStart(8, "0")}`,
  type,
  props: props as BuilderNode["props"],
  styles: {},
  ...extra,
});
const doc = (...root: BuilderNode[]): PageDocument => ({ schemaVersion: 1, root });
const messages = (input: unknown, pageKind: StoreviaPageKind = "HOME") => {
  const result = validateDocument(input, { registry: STOREVIA_REGISTRY, pageKind });
  return result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("the Storevia registry", () => {
  it("is the Site Engine's registry plus commerce, with nothing replaced", () => {
    for (const type of SITE_REGISTRY.types) expect(STOREVIA_REGISTRY.types).toContain(type);
    expect(STOREVIA_REGISTRY.linkKinds.map((k) => k.type)).toEqual([
      "url",
      "home",
      "page",
      "product",
      "collection",
      "search",
      "cart",
    ]);
    expect(STOREVIA_REGISTRY.sections.map((s) => s.type)).toEqual([
      ...SITE_REGISTRY.sections.map((s) => s.type),
      "featured-products",
      "collection-list",
    ]);
    for (const type of ["featured-products", "collection-list"]) {
      expect(STOREVIA_REGISTRY.get(type)?.requires).toEqual(["catalogue"]);
    }
  });

  it.each(Object.entries(STOREVIA_TEMPLATES))("the %s template is valid", (kind, template) => {
    expect(messages(template, kind as StoreviaPageKind)).toEqual([]);
  });

  it("the ecommerce home starter is valid and names only the store's own data", () => {
    expect(messages(STORE_HOME_DOCUMENT)).toEqual([]);
    expect(messages(SITE_HOME_DOCUMENT)).toEqual([]);
    expect(JSON.stringify(STORE_HOME_DOCUMENT)).not.toMatch(/prod_|coll_|media_/);
  });

  it("generic blocks accept commerce links in a Storevia document", () => {
    const hero = node("hero", {
      cta: { label: "Shop", link: { type: "collection", id: COLLECTION_ID } },
    });
    expect(messages(doc(hero))).toEqual([]);
    expect(
      messages(
        doc(node("hero", { cta: { label: "x", link: { type: "product", id: COLLECTION_ID } } })),
      ),
    ).toEqual([expect.stringContaining("props.cta")]);
  });
});

describe("commerce validation", () => {
  it("validates data sources, limits and page kinds", () => {
    expect(messages(doc(node("product-detail")), "HOME")).toEqual([
      expect.stringContaining("can't be used on this kind of page"),
    ]);
    expect(messages(doc(node("product-detail")), "PRODUCT_TEMPLATE")).toEqual([]);
    expect(
      messages(doc(node("featured-products", { source: { type: "collection", id: "coll_nope" } }))),
    ).not.toEqual([]);
    expect(
      messages(doc(node("featured-products", { source: { type: "collection", id: PRODUCT_ID } }))),
    ).not.toEqual([]);
    expect(messages(doc(node("featured-products", { limit: 49 })))).not.toEqual([]);
    expect(
      messages(doc(node("featured-products", { source: { type: "products", ids: [] } }))),
    ).not.toEqual([]);
    expect(
      messages(
        doc(node("collection-list", { source: { type: "collections", ids: [COLLECTION_ID] } })),
      ),
    ).toEqual([]);
    expect(messages(doc(node("collection-list", { limit: 25 })))).not.toEqual([]);
    expect(
      messages(
        doc(node("product-grid", {}, { responsive: { mobile: { props: { columns: 9 } } } })),
      ),
    ).toEqual([expect.stringContaining("responsive.mobile.props")]);
  });

  it("enforces the data-binding limit", () => {
    const grids = Array.from({ length: 5 }, () =>
      node("section", {}, { children: Array.from({ length: 41 }, () => node("product-grid")) }),
    );
    expect(messages(doc(...grids))).toEqual([expect.stringContaining("at most 200 data bindings")]);
  });

  it("collects each distinct request once, and every catalogue id for the same-store check", () => {
    const source = { type: "collection", id: COLLECTION_ID };
    const document = doc(
      node("featured-products", { source, limit: 4 }),
      node("featured-products", { source, limit: 4 }),
      node("collection-list", { source: { type: "collections", ids: [COLLECTION_ID] } }),
      node("hero", {
        cta: { label: "Go", link: { type: "product", id: PRODUCT_ID } },
        image: { mediaId: MEDIA_ID },
      }),
    );
    const requirements = collectRequirements(document, STOREVIA_REGISTRY);
    expect(requirements.requests.map(dataRequestKey)).toEqual([
      productListKey({ type: "collection", id: COLLECTION_ID }, 4),
      collectionListKey({ type: "collections", ids: [COLLECTION_ID] }, 8),
    ]);
    expect(requirements.links).toContainEqual({ type: "product", id: PRODUCT_ID });
    expect(requirements.media).toEqual([MEDIA_ID]);
    expect(collectCatalogueIds(document.root.map((n) => n.props))).toEqual({
      products: [],
      collections: [COLLECTION_ID, COLLECTION_ID, COLLECTION_ID],
    });
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const price = (amount: string) => ({ amount, currency: "INR" });
const card = (n: number, title = `Product ${String(n)}`) => ({
  id: toTypeId("product", uuid(100 + n)),
  handle: `product-${String(n)}`,
  title,
  price: price("99900"),
  compareAtPrice: null,
  priceVaries: false,
  image: null,
  available: n !== 2,
});

function context(
  overrides: Partial<CommerceRenderData> = {},
  extra: Partial<CommerceRenderContext> = {},
): CommerceRenderContext {
  const base = documentRenderData(EMPTY_DOCUMENT_DATA);
  return {
    pageKind: "HOME",
    site: { name: "Clay & Co", locale: "en-IN" },
    data: {
      ...base,
      productList: () => [card(1, "<script>alert(1)</script>"), card(2)],
      collectionList: () => [{ id: COLLECTION_ID, handle: "summer", title: "Summer", image: null }],
      ...overrides,
    },
    slots: { AddToCart: ({ variant }) => <form data-variant={variant?.id ?? ""}>add</form> },
    selectedVariantId: null,
    pageHref: (page) => `?page=${String(page)}`,
    variantHref: (variantId) => `?variant=${variantId}`,
    ...extra,
  };
}

const render = (document: PageDocument, ctx: CommerceRenderContext) =>
  renderToStaticMarkup(
    <RenderDocument document={document} registry={STOREVIA_REGISTRY} ctx={ctx} />,
  );

describe("rendering", () => {
  it("the ecommerce home shows the store's name, collections and products, escaping text", () => {
    const html = render(STORE_HOME_DOCUMENT, context());
    expect(html).toContain("Clay &amp; Co");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="/products/product-1"');
    expect(html).toContain('href="/collections/summer"');
    expect(html).toContain("Sold out");
    expect(html).toContain('class="sv-button" href="/search"');
    expect(html).toMatch(/₹\s?999\.00/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("catalogue blocks render nothing without data, and links that don't resolve are dropped", () => {
    const html = render(
      doc(
        node("featured-products", { heading: "Empty" }),
        node("collection-list", { heading: "None" }),
        node("button", {
          label: "Gone",
          link: { type: "product", id: PRODUCT_ID },
          style: "primary",
        }),
      ),
      context({ productList: () => [], collectionList: () => [] }),
    );
    expect(html).toBe("");
  });

  it("the product page shows the selected variant and hands it to the cart slot", () => {
    const variant = (n: number, available: boolean) => ({
      id: toTypeId("variant", uuid(200 + n)),
      title: `Size ${String(n)}`,
      price: price(String(1000 * n)),
      compareAtPrice: n === 2 ? price("5000") : null,
      available,
      optionValues: [String(n)],
      image: null,
    });
    const [v1, v2] = [variant(1, false), variant(2, true)];
    const product = {
      id: PRODUCT_ID,
      handle: "mug",
      title: "Mug",
      vendor: "Clay & Co",
      description: {
        type: "doc" as const,
        content: [
          { type: "paragraph" as const, content: [{ type: "text" as const, text: "Handmade." }] },
        ],
      },
      images: [],
      options: [{ name: "Size", values: ["1", "2"] }],
      variants: [v1, v2],
    };
    const html = render(STOREVIA_TEMPLATES.PRODUCT_TEMPLATE, {
      ...context({ currentProduct: product }),
      pageKind: "PRODUCT_TEMPLATE",
    });
    expect(html).toContain(`data-variant="${v2.id}"`);
    expect(html).toContain("Sale price");
    expect(html).toContain(`href="?variant=${v1.id}"`);
    expect(html).toContain("Handmade.");
    const chosen = render(STOREVIA_TEMPLATES.PRODUCT_TEMPLATE, {
      ...context({ currentProduct: product }),
      selectedVariantId: v1.id,
    });
    expect(chosen).toContain(`data-variant="${v1.id}"`);
  });

  it("collection and search listings paginate and explain empty results", () => {
    const listing = { products: [card(1)], page: 2, pageCount: 3, total: 50 };
    const collection = render(
      STOREVIA_TEMPLATES.COLLECTION_TEMPLATE,
      context({
        currentCollection: {
          ...listing,
          id: COLLECTION_ID,
          handle: "summer",
          title: "Summer",
          description: null,
          image: null,
        },
      }),
    );
    expect(collection).toContain("<h1");
    expect(collection).toContain('href="?page=1" rel="prev"');
    expect(collection).toContain('href="?page=3" rel="next"');
    const empty = render(
      STOREVIA_TEMPLATES.SEARCH_TEMPLATE,
      context({ search: { query: "<x>", products: [], page: 1, pageCount: 1, total: 0 } }),
    );
    expect(empty).toContain("No products match “&lt;x&gt;”.");
    expect(empty).toContain('value="&lt;x&gt;"');
  });

  it("compiles the product grid's columns into a scoped custom property", () => {
    const grid = node("featured-products", { columns: 3 }, { id: "gridgridgrid" });
    expect(compileDocumentCss(doc(grid), STOREVIA_REGISTRY)).toBe(
      ".n-gridgridgrid{--sv-grid-columns:3}",
    );
    expect(COMMERCE_BLOCK_CSS).not.toContain("</");
  });
});

describe("page data", () => {
  const data: DocumentData = {
    productLists: [[productListKey({ type: "catalogue" }, 8), [card(1)]]],
    collectionLists: [
      [
        collectionListKey({ type: "all" }, 8),
        [{ id: COLLECTION_ID, handle: "summer", title: "Summer", image: null }],
      ],
    ],
    links: { products: [[PRODUCT_ID, "mug"]], collections: [[COLLECTION_ID, "summer"]], pages: [] },
    media: [
      [MEDIA_ID, { url: "/media/x/w640.webp", srcSet: "", width: 640, height: 480, alt: "Stored" }],
    ],
  };

  it("resolves lists, links and images from what the server resolved, nothing else", () => {
    const view = documentRenderData(data);
    expect(view.productList({ type: "catalogue" }, 8)).toHaveLength(1);
    expect(view.productList({ type: "catalogue" }, 4)).toEqual([]);
    expect(view.collectionList({ type: "all" }, 8)[0]?.handle).toBe("summer");
    expect(view.link({ type: "product", id: PRODUCT_ID })).toBe("/products/mug");
    expect(view.link({ type: "product", id: toTypeId("product", uuid(99)) })).toBeNull();
    expect(view.link({ type: "search" })).toBe("/search");
    expect(view.image({ mediaId: MEDIA_ID })?.alt).toBe("Stored");
    expect(view.image({ mediaId: MEDIA_ID, alt: "Merchant alt" })?.alt).toBe("Merchant alt");
    expect(view.image({ mediaId: toTypeId("media", uuid(98)) })).toBeNull();
    // It survives a JSON round trip (the builder canvas receives it from a server action).
    expect(
      documentRenderData(JSON.parse(JSON.stringify(data)) as DocumentData).link({
        type: "collection",
        id: COLLECTION_ID,
      }),
    ).toBe("/collections/summer");
  });
});
