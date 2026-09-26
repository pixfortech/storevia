// Page documents, the style vocabulary, the registry and the renderers
// (07-page-builder-document.md, ADR-0028 §5).
import { toTypeId } from "@storevia/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_LIMITS,
  collectRefs,
  styleErrors,
  styleValueCss,
  validateDocument,
  type BuilderNode,
  type PageDocument,
  type PageKind,
} from "./document";
import { DEFAULT_REGISTRY, dataRequestKey, type RenderContext, type RenderData } from "./registry";
import { BASE_CSS, RenderDocument, collectRequirements, compileDocumentCss } from "./render";
import { DEFAULT_TEMPLATES } from "./templates";
import { DEFAULT_THEME, themeCss } from "./theme";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const PRODUCT_ID = toTypeId("product", uuid(1));
const COLLECTION_ID = toTypeId("collection", uuid(2));
const MEDIA_ID = toTypeId("media", uuid(3));

let counter = 0;
const id = () => `node${String(++counter).padStart(8, "0")}`;
const node = (type: string, props: object = {}, extra: Partial<BuilderNode> = {}): BuilderNode => ({
  id: id(),
  type,
  props: props as BuilderNode["props"],
  styles: {},
  ...extra,
});
const doc = (...root: BuilderNode[]): PageDocument => ({ schemaVersion: 1, root });
const validate = (input: unknown, pageKind: PageKind = "HOME") =>
  validateDocument(input, { registry: DEFAULT_REGISTRY, pageKind });
const messages = (input: unknown, pageKind: PageKind = "HOME") => {
  const result = validate(input, pageKind);
  return result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("default templates", () => {
  it.each(Object.entries(DEFAULT_TEMPLATES))(
    "the %s template is a valid document",
    (kind, template) => {
      const result = validate(template, kind as PageKind);
      expect(result.ok ? [] : result.issues).toEqual([]);
    },
  );
});

describe("document validation", () => {
  it("accepts a well-formed document and reports its bindings", () => {
    const result = validate(
      doc(
        node(
          "section",
          {},
          { children: [node("heading", { text: "Hi", level: 2 }), node("product-grid")] },
        ),
      ),
    );
    expect(result).toMatchObject({ ok: true, nodeCount: 3, dataBindings: 1, requiredFeatures: [] });
  });

  it.each([
    ["no version", { root: [] }],
    ["a future version", { schemaVersion: 2, root: [] }],
    ["extra envelope keys", { schemaVersion: 1, root: [], script: "x" }],
    ["a non-array root", { schemaVersion: 1, root: {} }],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(validate(input).ok).toBe(false);
  });

  it("rejects unknown components, malformed and duplicate ids, and unknown node keys", () => {
    const dup = node("divider");
    expect(messages(doc(node("marquee")))).toEqual([
      expect.stringContaining('Unknown component "marquee"'),
    ]);
    expect(messages(doc({ ...node("divider"), id: "short" }))).toEqual([
      expect.stringContaining("12 URL-safe"),
    ]);
    expect(messages(doc(dup, dup))).toEqual([expect.stringContaining("unique")]);
    expect(messages(doc({ ...node("divider"), onclick: "x" } as BuilderNode))).not.toEqual([]);
  });

  it("enforces where components may appear", () => {
    expect(messages(doc(node("product-detail")), "HOME")).toEqual([
      expect.stringContaining("can't be used on this kind of page"),
    ]);
    expect(messages(doc(node("product-detail")), "PRODUCT_TEMPLATE")).toEqual([]);
    expect(messages(doc(node("column")))).toEqual([
      expect.stringContaining("must be inside columns"),
    ]);
    expect(
      messages(doc(node("columns", {}, { children: [node("heading", { text: "x", level: 2 })] }))),
    ).toEqual([expect.stringContaining('"columns" can\'t contain "heading"')]);
    expect(
      messages(doc(node("heading", { text: "x", level: 2 }, { children: [node("divider")] }))),
    ).toEqual([expect.stringContaining("can't have children")]);
  });

  it("validates props against the component schema, including typed links and ids", () => {
    const bad = (props: object, type = "button") => messages(doc(node(type, props)));
    expect(
      bad({ label: "Go", link: { type: "url", href: "javascript:alert(1)" }, style: "primary" }),
    ).toEqual([expect.stringContaining("Unsafe link")]);
    expect(
      bad({ label: "Go", link: { type: "url", href: "data:text/html,x" }, style: "primary" }),
    ).not.toEqual([]);
    expect(
      bad({ label: "Go", link: { type: "product", id: COLLECTION_ID }, style: "primary" }),
    ).toEqual([expect.stringContaining("Not a product id")]);
    expect(
      bad({ label: "Go", link: { type: "product", id: PRODUCT_ID }, style: "primary" }),
    ).toEqual([]);
    expect(
      bad({ label: "Go", link: { type: "url", href: "tel:+44 20 7946 0000" }, style: "primary" }),
    ).toEqual([]);
    expect(bad({ text: "x", level: 7 }, "heading")).not.toEqual([]);
    expect(bad({ text: "x", level: 2, extra: true }, "heading")).not.toEqual([]);
    expect(bad({ doc: { type: "doc", content: [{ type: "script" }] } }, "rich-text")).not.toEqual(
      [],
    );
    expect(
      bad({ source: { type: "collection", id: "coll_nope" }, limit: 8 }, "product-grid"),
    ).not.toEqual([]);
    expect(bad({ limit: 49 }, "product-grid")).not.toEqual([]);
  });

  it("validates responsive prop overrides with the same schema", () => {
    const grid = node("product-grid", {}, { responsive: { mobile: { props: { columns: 9 } } } });
    expect(messages(doc(grid))).toEqual([expect.stringContaining("responsive.mobile.props")]);
  });

  it("enforces depth, node count, size and data-binding limits", () => {
    let deep: BuilderNode = node("divider");
    for (let i = 0; i < DOCUMENT_LIMITS.maxDepth; i++)
      deep = node("container", {}, { children: [deep] });
    expect(messages(doc(deep))).toEqual([expect.stringContaining("nested at most 12 deep")]);

    const many = Array.from({ length: DOCUMENT_LIMITS.maxNodes + 1 }, () => node("divider"));
    expect(messages(doc(...many))).toEqual([expect.stringContaining("at most 2000 nodes")]);

    const big = doc(node("text", { text: "x".repeat(5_000) }));
    const huge = {
      ...big,
      root: Array.from({ length: 220 }, () => node("text", { text: "é".repeat(2_500) })),
    };
    expect(messages(huge)).toEqual([expect.stringContaining("larger than 1 MiB")]);

    const grids = Array.from({ length: DOCUMENT_LIMITS.maxDataBindings + 1 }, () =>
      node("product-grid"),
    );
    expect(messages(doc(...grids))).toEqual([expect.stringContaining("at most 200 data bindings")]);
  });
});

describe("style vocabulary", () => {
  it.each([
    ["paddingBlock", { $token: "space.lg" }, "var(--sv-space-lg)"],
    ["paddingBlock", "24px", "24px"],
    ["marginInline", "auto", "auto"],
    ["marginTop", "-1rem", "-1rem"],
    ["color", "#1a1a1a", "#1a1a1a"],
    ["color", "rgb(10, 20, 30)", "rgb(10, 20, 30)"],
    ["color", { $token: "color.primary" }, "var(--sv-color-primary)"],
    ["columns", 3, "repeat(3,minmax(0,1fr))"],
    ["justify", "between", "space-between"],
    ["fontWeight", 600, "600"],
    ["aspectRatio", "16/9", "16/9"],
    ["opacity", 0.5, "0.5"],
    ["shadow", { $token: "shadow.md" }, "var(--sv-shadow-md)"],
  ])("%s: %j → %s", (property, value, css) => {
    expect(styleValueCss(property, value)).toBe(css);
  });

  it.each([
    ["color", "red;background:url(https://evil.test)"],
    ["color", "expression(alert(1))"],
    ["color", "#12345"],
    ["color", { $token: "space.lg" }],
    ["color", { $token: "color.nope" }],
    ["paddingBlock", "1px}body{display:none"],
    ["paddingBlock", "-4px"],
    ["paddingBlock", "5000px"],
    ["paddingBlock", "calc(1px + 2px)"],
    ["width", "var(--x)"],
    ["columns", 13],
    ["fontWeight", 450],
    ["fontFamily", "Comic Sans"],
    ["display", "contents"],
    ["background", "url(x)"],
    ["opacity", 2],
  ])("refuses %s: %j", (property, value) => {
    expect(styleValueCss(property, value)).toBeNull();
  });

  it("refuses unknown properties and non-object style sets", () => {
    expect(styleErrors({ position: "fixed" })).toEqual({ position: "Unknown style property." });
    expect(styleErrors({ __proto__: { color: "red" } })).toEqual({});
    expect(styleErrors("color:red")).toEqual({ "": "Styles must be an object." });
    expect(messages(doc(node("divider", {}, { styles: { position: "fixed" } })))).toEqual([
      expect.stringContaining("Unknown style property"),
    ]);
  });
});

describe("style compiler", () => {
  it("emits one scoped rule per node with breakpoint overrides and visibility", () => {
    const heading = node(
      "heading",
      { text: "Hi", level: 2 },
      {
        id: "abcdefghijkl",
        styles: { color: { $token: "color.accent" }, paddingBlock: "8px" },
        responsive: { mobile: { styles: { paddingBlock: "4px" } } },
        visibility: { tablet: false },
      },
    );
    const grid = node(
      "product-grid",
      { columns: 4 },
      { id: "gridgridgrid", responsive: { mobile: { props: { columns: 2 } } } },
    );
    const css = compileDocumentCss(doc(heading, grid), DEFAULT_REGISTRY);
    expect(css).toBe(
      ".n-abcdefghijkl{color:var(--sv-color-accent);padding-block:8px}" +
        ".n-gridgridgrid{--sv-grid-columns:4}" +
        "@media (max-width:1024px){.n-abcdefghijkl{display:none}}" +
        "@media (max-width:640px){.n-abcdefghijkl{padding-block:4px}.n-gridgridgrid{--sv-grid-columns:2}}",
    );
  });

  it("drops anything outside the vocabulary even if an unvalidated document reaches it", () => {
    const hostile = {
      ...node("divider", {}, { id: "hostilehosti" }),
      styles: { color: "red}body{background:url(//evil)", position: "fixed" },
    };
    const css = compileDocumentCss(doc(hostile), DEFAULT_REGISTRY);
    expect(css).toBe("");
    const badId = { ...node("divider"), id: "x}body{a:b" };
    expect(compileDocumentCss(doc(badId), DEFAULT_REGISTRY)).toBe("");
  });

  it("the theme becomes :root custom properties; unsafe values are dropped", () => {
    expect(themeCss()).toContain("--sv-color-primary:#1c1917");
    expect(themeCss({ ...DEFAULT_THEME, "color.primary": "red;}</style><script>" })).not.toContain(
      "script",
    );
    expect(BASE_CSS).not.toContain("</");
  });
});

describe("data requirements", () => {
  it("collects each distinct request once, with every typed link and media reference", () => {
    const grid = node("product-grid", {
      source: { type: "collection", id: COLLECTION_ID },
      limit: 4,
    });
    const document = doc(
      node("hero", {
        cta: { label: "Go", link: { type: "product", id: PRODUCT_ID } },
        image: { mediaId: MEDIA_ID },
      }),
      grid,
      { ...grid, id: id() },
      node("image", {
        image: { mediaId: MEDIA_ID },
        link: { type: "collection", id: COLLECTION_ID },
      }),
      node("divider", {}, { hidden: true }),
    );
    const requirements = collectRequirements(document, DEFAULT_REGISTRY);
    expect(requirements.requests.map(dataRequestKey)).toEqual([
      `product-list:{"type":"collection","id":"${COLLECTION_ID}"}:4`,
    ]);
    expect(requirements.links).toEqual([
      { type: "product", id: PRODUCT_ID },
      { type: "collection", id: COLLECTION_ID },
    ]);
    expect(requirements.media).toEqual([MEDIA_ID]);
  });

  it("collectRefs finds nested references", () => {
    expect(
      collectRefs({ a: [{ b: { type: "home" } }], c: { mediaId: MEDIA_ID, alt: "x" } }),
    ).toEqual({
      links: [{ type: "home" }],
      media: [MEDIA_ID],
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
  overrides: Partial<RenderData> = {},
  extra: Partial<RenderContext> = {},
): RenderContext {
  const data: RenderData = {
    productList: () => [card(1, "<script>alert(1)</script>"), card(2)],
    currentProduct: null,
    currentCollection: null,
    search: null,
    link: (target) =>
      target.type === "home"
        ? "/"
        : target.type === "search"
          ? "/search"
          : target.type === "url"
            ? target.href
            : null,
    image: () => null,
    ...overrides,
  };
  return {
    pageKind: "HOME",
    store: { name: "Clay & Co", locale: "en-IN", currency: "INR" },
    data,
    slots: {
      AddToCart: ({ variant }) => <form data-variant={variant?.id ?? ""}>add</form>,
    },
    selectedVariantId: null,
    pageHref: (page) => `?page=${String(page)}`,
    variantHref: (variantId) => `?variant=${variantId}`,
    ...extra,
  };
}

const render = (document: PageDocument, ctx: RenderContext) =>
  renderToStaticMarkup(
    <RenderDocument document={document} registry={DEFAULT_REGISTRY} ctx={ctx} />,
  );

describe("rendering", () => {
  it("renders the default home page from the store's own name and products, escaping text", () => {
    const html = render(DEFAULT_TEMPLATES.HOME, context());
    expect(html).toContain("Clay &amp; Co");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="/products/product-1"');
    expect(html).toContain("Sold out");
    expect(html).toContain('class="sv-button" href="/search"');
    expect(html).toMatch(/₹\s?999\.00/);
  });

  it("renders nothing for grids with no products and buttons whose link doesn't resolve", () => {
    const html = render(
      doc(
        node("product-grid", { heading: "Empty" }),
        node("button", {
          label: "Gone",
          link: { type: "product", id: PRODUCT_ID },
          style: "primary",
        }),
      ),
      context({ productList: () => [] }),
    );
    expect(html).toBe("");
  });

  it("skips unknown and hidden nodes, reporting unknown types", () => {
    const onUnknownComponent = vi.fn();
    const html = render(
      {
        schemaVersion: 1,
        root: [
          node("marquee"),
          node("heading", { text: "Hidden", level: 2 }, { hidden: true }),
          node("divider"),
        ],
      },
      context({}, { onUnknownComponent }),
    );
    expect(html).toMatch(/^<hr class="sv-divider n-node\d{8}"\/>$/);
    expect(onUnknownComponent).toHaveBeenCalledWith("marquee");
  });

  it("a tampered rich-text document renders as nothing instead of failing the page", () => {
    const tampered = {
      ...node("rich-text"),
      props: { doc: { type: "doc", content: [{ type: "script", text: "x" }] } },
    };
    expect(render(doc(tampered as BuilderNode), context())).toBe("");
    const unsafeLink = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    expect(render(doc({ ...node("rich-text"), props: { doc: unsafeLink } }), context())).toBe("");
  });

  it("rich text renders as elements, dropping unsafe links", () => {
    const html = render(
      doc(
        node("rich-text", {
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "<b>safe</b> ", marks: [{ type: "bold" }] },
                  {
                    type: "text",
                    text: "ok",
                    marks: [{ type: "link", attrs: { href: "https://example.com" } }],
                  },
                ],
              },
            ],
          },
        }),
      ),
      context(),
    );
    expect(html).toContain("<strong>&lt;b&gt;safe&lt;/b&gt; </strong>");
    expect(html).toContain(
      '<a href="https://example.com" rel="noopener noreferrer nofollow">ok</a>',
    );
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
    const html = render(DEFAULT_TEMPLATES.PRODUCT_TEMPLATE, {
      ...context({ currentProduct: product }),
      pageKind: "PRODUCT_TEMPLATE",
    });
    // No selection: the first available variant.
    expect(html).toContain(`data-variant="${v2.id}"`);
    expect(html).toContain("Sale price");
    expect(html).toContain(`href="?variant=${v1.id}"`);
    expect(html).toContain("Handmade.");
    const chosen = render(DEFAULT_TEMPLATES.PRODUCT_TEMPLATE, {
      ...context({ currentProduct: product }),
      selectedVariantId: v1.id,
    });
    expect(chosen).toContain(`data-variant="${v1.id}"`);
  });

  it("collection and search listings paginate and explain empty results", () => {
    const listing = { products: [card(1)], page: 2, pageCount: 3, total: 50 };
    const collection = render(DEFAULT_TEMPLATES.COLLECTION_TEMPLATE, {
      ...context({
        currentCollection: {
          ...listing,
          id: COLLECTION_ID,
          handle: "summer",
          title: "Summer",
          description: null,
          image: null,
        },
      }),
    });
    expect(collection).toContain("<h1");
    expect(collection).toContain('href="?page=1" rel="prev"');
    expect(collection).toContain('href="?page=3" rel="next"');
    const empty = render(DEFAULT_TEMPLATES.SEARCH_TEMPLATE, {
      ...context({ search: { query: "<x>", products: [], page: 1, pageCount: 1, total: 0 } }),
    });
    expect(empty).toContain("No products match “&lt;x&gt;”.");
    expect(empty).toContain('value="&lt;x&gt;"');
  });
});
