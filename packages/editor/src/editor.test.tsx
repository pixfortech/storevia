// Page documents, the style vocabulary, the registry and the renderers of the
// Site Engine's page system (07-page-builder-document.md, ADR-0028 §5,
// ADR-0030). Everything here runs with SITE_REGISTRY: no commerce component
// or link kind exists in this package (commerce's own tests cover the
// Storevia registry).
import { toTypeId } from "@storevia/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  DOCUMENT_LIMITS,
  SITE_LINK_KINDS,
  collectRefs,
  styleErrors,
  styleValueCss,
  validateDocument,
  type BuilderNode,
  type LinkTarget,
  type PageDocument,
  type PageKind,
} from "./document";
import {
  SITE_COMPONENTS,
  SITE_REGISTRY,
  createRegistry,
  defineComponent,
  type SiteRenderContext,
  type SiteRenderData,
} from "./registry";
import {
  BASE_CSS,
  RenderDocument,
  collectRequirements,
  compileDocumentCss,
  firstSectionHasHeading,
} from "./render";
import { NOT_FOUND_DOCUMENT, SITE_HOME_DOCUMENT, contentPageDocument } from "./templates";
import { DEFAULT_THEME, themeCss } from "./theme";

const uuid = (n: number) => `0190f2a4-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const PAGE_ID = toTypeId("page", uuid(1));
const PRODUCT_ID = toTypeId("product", uuid(2));
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
  validateDocument(input, { registry: SITE_REGISTRY, pageKind });
const messages = (input: unknown, pageKind: PageKind = "HOME") => {
  const result = validate(input, pageKind);
  return result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
};
const richText = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("templates", () => {
  it.each([
    ["not found", NOT_FOUND_DOCUMENT, "NOT_FOUND"],
    ["site home", SITE_HOME_DOCUMENT, "HOME"],
    ["content page", contentPageDocument("About us"), "STANDARD"],
  ])("the %s document is valid", (_label, template, kind) => {
    const result = validate(template, kind);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });
});

describe("registry", () => {
  it("the Site Engine's registry has no commerce component or link kind", () => {
    expect(SITE_REGISTRY.types).not.toEqual(
      expect.arrayContaining(["product-grid", "featured-products", "collection-list"]),
    );
    expect(SITE_REGISTRY.linkKinds.map((k) => k.type)).toEqual(["url", "home", "page"]);
    expect(SITE_REGISTRY.sections.map((s) => s.type)).toEqual([
      "hero",
      "text-section",
      "image-section",
      "image-text",
      "gallery",
      "features",
      "call-to-action",
      "faq",
      "testimonials",
      "logo-strip",
      "contact-details",
    ]);
  });

  it("refuses a component or link kind registered twice", () => {
    expect(() =>
      createRegistry({
        linkKinds: SITE_LINK_KINDS,
        components: [...SITE_COMPONENTS, ...SITE_COMPONENTS],
      }),
    ).toThrow(/registered twice/);
    expect(() =>
      createRegistry({ linkKinds: [...SITE_LINK_KINDS, ...SITE_LINK_KINDS], components: [] }),
    ).toThrow(/registered twice/);
  });

  it("a composition's link kinds are accepted only by its own registry", () => {
    const blog = {
      type: "post",
      label: "Post",
      schema: z.strictObject({ type: z.literal("post"), slug: z.string().max(40) }),
    };
    const extended = createRegistry({
      linkKinds: [...SITE_LINK_KINDS, blog],
      components: SITE_COMPONENTS,
    });
    const button = node("button", { label: "Read", link: { type: "post", slug: "hello" } });
    expect(validateDocument(doc(button), { registry: extended, pageKind: "HOME" }).ok).toBe(true);
    expect(messages(doc(button))).not.toEqual([]);
  });

  it("every section block's defaults are valid, and every control names a prop", () => {
    for (const definition of SITE_REGISTRY.sections) {
      expect(definition.propertySchema.safeParse(definition.defaultProps).success).toBe(true);
      const props = Object.keys(definition.defaultProps);
      for (const control of definition.editorControls) expect(props).toContain(control.prop);
    }
  });
});

describe("document validation", () => {
  it("accepts a well-formed document and reports its size", () => {
    const result = validate(
      doc(node("section", {}, { children: [node("heading", { text: "Hi", level: 2 })] })),
    );
    expect(result).toMatchObject({ ok: true, nodeCount: 2, dataBindings: 0, requiredFeatures: [] });
  });

  it.each([
    ["no version", { root: [] }],
    ["a future version", { schemaVersion: 2, root: [] }],
    ["extra envelope keys", { schemaVersion: 1, root: [], script: "x" }],
    ["a non-array root", { schemaVersion: 1, root: {} }],
    ["malformed JSON-like input", '{"schemaVersion":1'],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(validate(input).ok).toBe(false);
  });

  it("rejects unknown components, malformed and duplicate ids, and unknown node keys", () => {
    const dup = node("divider");
    expect(messages(doc(node("marquee")))).toEqual([
      expect.stringContaining('Unknown component "marquee"'),
    ]);
    expect(messages(doc(node("product-grid")))).toEqual([
      expect.stringContaining('Unknown component "product-grid"'),
    ]);
    expect(messages(doc({ ...node("divider"), id: "short" }))).toEqual([
      expect.stringContaining("12 URL-safe"),
    ]);
    expect(messages(doc(dup, dup))).toEqual([expect.stringContaining("unique")]);
    expect(messages(doc({ ...node("divider"), onclick: "x" } as BuilderNode))).not.toEqual([]);
  });

  it("enforces where components may appear", () => {
    expect(messages(doc(node("column")))).toEqual([
      expect.stringContaining("must be inside columns"),
    ]);
    expect(
      messages(doc(node("columns", {}, { children: [node("heading", { text: "x", level: 2 })] }))),
    ).toEqual([expect.stringContaining('"columns" can\'t contain "heading"')]);
    expect(
      messages(doc(node("heading", { text: "x", level: 2 }, { children: [node("divider")] }))),
    ).toEqual([expect.stringContaining("can't have children")]);
    expect(messages(doc(node("faq", {}, { children: [node("divider")] })))).toEqual([
      expect.stringContaining("can't have children"),
    ]);
  });

  it("validates links: safe schemes and ids of the right kind only", () => {
    const button = (link: unknown) =>
      messages(doc(node("button", { label: "Go", link, style: "primary" })));
    expect(button({ type: "url", href: "javascript:alert(1)" })).toEqual([
      expect.stringContaining("Unsafe link"),
    ]);
    for (const href of [
      "data:text/html,x",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "vbscript:x",
      "//evil.test",
      "file:///etc/passwd",
    ]) {
      expect(button({ type: "url", href })).not.toEqual([]);
    }
    expect(button({ type: "url", href: "https://example.com/a?b=c" })).toEqual([]);
    expect(button({ type: "url", href: "mailto:hi@example.com" })).toEqual([]);
    expect(button({ type: "url", href: "tel:+44 20 7946 0000" })).toEqual([]);
    expect(button({ type: "page", id: PAGE_ID })).toEqual([]);
    expect(button({ type: "page", id: PRODUCT_ID })).toEqual([
      expect.stringContaining("Not a page id"),
    ]);
    // The Site Engine has no product links: a commerce kind is refused here.
    expect(button({ type: "product", id: PRODUCT_ID })).not.toEqual([]);
    expect(button({ type: "home", extra: 1 })).not.toEqual([]);
  });

  it("validates block settings: bounded text, enums, rich text, items", () => {
    const hero = (props: object) =>
      messages(doc(node("hero", { ...SITE_REGISTRY.get("hero")?.defaultProps, ...props })));
    expect(hero({ heading: "x".repeat(201) })).not.toEqual([]);
    expect(hero({ heading: "a\u0000b" })).toEqual([expect.stringContaining("control characters")]);
    expect(hero({ align: "right" })).not.toEqual([]);
    expect(hero({ image: { mediaId: "media_nope" } })).not.toEqual([]);
    expect(hero({ style: "color:red" })).not.toEqual([]);
    expect(
      messages(doc(node("text-section", { body: { type: "doc", content: [{ type: "script" }] } }))),
    ).not.toEqual([]);
    expect(
      messages(
        doc(
          node("faq", {
            items: Array.from({ length: 31 }, () => ({ question: "q", answer: "a" })),
          }),
        ),
      ),
    ).not.toEqual([]);
    expect(
      messages(
        doc(
          node("gallery", {
            images: Array.from({ length: 25 }, () => ({ image: null, caption: "" })),
          }),
        ),
      ),
    ).not.toEqual([]);
    expect(messages(doc(node("contact-details", { email: "not an email" })))).not.toEqual([]);
    expect(messages(doc(node("contact-details", { phone: "+44 (0)20 7946 0000" })))).toEqual([]);
  });

  it("enforces section, depth, node count and size limits", () => {
    const sections = Array.from({ length: DOCUMENT_LIMITS.maxSections + 1 }, () => node("divider"));
    expect(messages(doc(...sections))).toEqual([expect.stringContaining("at most 40 sections")]);

    let deep: BuilderNode = node("divider");
    for (let i = 0; i < DOCUMENT_LIMITS.maxDepth; i++)
      deep = node("container", {}, { children: [deep] });
    expect(messages(doc(deep))).toEqual([expect.stringContaining("nested at most 12 deep")]);

    const many = node(
      "section",
      {},
      {
        children: Array.from({ length: DOCUMENT_LIMITS.maxNodes + 1 }, () => node("divider")),
      },
    );
    expect(messages(doc(many))).toEqual([expect.stringContaining("at most 2000 nodes")]);

    const huge = doc(
      node(
        "section",
        {},
        {
          children: Array.from({ length: 220 }, () => node("text", { text: "é".repeat(2_500) })),
        },
      ),
    );
    expect(messages(huge)).toEqual([expect.stringContaining("larger than 1 MiB")]);
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
    const gallery = node(
      "gallery",
      { columns: 4 },
      { id: "gridgridgrid", responsive: { mobile: { props: { columns: 2 } } } },
    );
    const css = compileDocumentCss(doc(heading, gallery), SITE_REGISTRY);
    expect(css).toBe(
      ".n-abcdefghijkl{color:var(--sv-color-accent);padding-block:8px}" +
        ".n-gridgridgrid{--sv-block-columns:4}" +
        "@media (max-width:1024px){.n-abcdefghijkl{display:none}}" +
        "@media (max-width:640px){.n-abcdefghijkl{padding-block:4px}.n-gridgridgrid{--sv-block-columns:2}}",
    );
  });

  it("drops anything outside the vocabulary even if an unvalidated document reaches it", () => {
    const hostile = {
      ...node("divider", {}, { id: "hostilehosti" }),
      styles: { color: "red}body{background:url(//evil)", position: "fixed" },
    };
    expect(compileDocumentCss(doc(hostile), SITE_REGISTRY)).toBe("");
    const badId = { ...node("divider"), id: "x}body{a:b" };
    expect(compileDocumentCss(doc(badId), SITE_REGISTRY)).toBe("");
    const hostileColumns = node(
      "gallery",
      { columns: "4;}body{display:none" },
      { id: "hostilecolum" },
    );
    expect(compileDocumentCss(doc(hostileColumns), SITE_REGISTRY)).toBe("");
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
  it("collects every typed link and media reference once, skipping hidden sections", () => {
    const document = doc(
      node("hero", {
        cta: { label: "Go", link: { type: "page", id: PAGE_ID } },
        image: { mediaId: MEDIA_ID },
      }),
      node("gallery", { images: [{ image: { mediaId: MEDIA_ID }, caption: "" }] }),
      node("logo-strip", {
        logos: [{ image: { mediaId: MEDIA_ID }, name: "Ally", link: { type: "home" } }],
      }),
      node("hero", { image: { mediaId: toTypeId("media", uuid(9)) } }, { hidden: true }),
    );
    const requirements = collectRequirements(document, SITE_REGISTRY);
    expect(requirements.requests).toEqual([]);
    expect(requirements.links).toEqual([{ type: "page", id: PAGE_ID }, { type: "home" }]);
    expect(requirements.media).toEqual([MEDIA_ID]);
  });

  it("collectRefs finds nested references with the registry's link kinds, never inside rich text", () => {
    expect(
      collectRefs(
        {
          a: [{ b: { type: "home" } }],
          c: { mediaId: MEDIA_ID, alt: "x" },
          d: { type: "product", id: PRODUCT_ID },
          e: { type: "doc", content: [{ type: "paragraph" }] },
        },
        SITE_REGISTRY.linkSchema,
      ),
    ).toEqual({ links: [{ type: "home" }], media: [MEDIA_ID] });
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function context(
  overrides: Partial<SiteRenderData> = {},
  extra: Partial<SiteRenderContext> = {},
): SiteRenderContext {
  const data: SiteRenderData = {
    link: (target: LinkTarget) =>
      target.type === "home"
        ? "/"
        : target.type === "page"
          ? "/pages/about"
          : target.type === "url" && "href" in target
            ? target.href
            : null,
    image: (ref) =>
      ref.mediaId === MEDIA_ID
        ? {
            url: "https://media.test/a/w640.webp",
            srcSet: "",
            width: 640,
            height: 480,
            alt: ref.alt ?? "A vase",
          }
        : null,
    ...overrides,
  };
  return { pageKind: "HOME", site: { name: "Clay & Co", locale: "en-IN" }, data, ...extra };
}

const render = (document: PageDocument, ctx: SiteRenderContext = context()) =>
  renderToStaticMarkup(<RenderDocument document={document} registry={SITE_REGISTRY} ctx={ctx} />);

describe("rendering", () => {
  it("the site home page shows the site's own name, escaped, as the page's h1", () => {
    const html = render(SITE_HOME_DOCUMENT);
    expect(html).toContain("Clay &amp; Co");
    expect(html).toMatch(/<h1[^>]*class="sv-hero-heading"/);
    expect(html).not.toContain("<a ");
  });

  it("the first section owns the h1; later sections use h2 and items h3", () => {
    const html = render(
      doc(
        node("text-section", { heading: "About", body: richText("We make mugs.") }),
        node("features", { heading: "Why", items: [{ title: "Glazed", text: "", image: null }] }),
      ),
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">About</h1>");
    expect(html).toContain(">Why</h2>");
    expect(html).toContain("<h3>Glazed</h3>");
    expect(html).toMatch(/<section[^>]*aria-labelledby="h-node\d{8}"/);
    expect(
      firstSectionHasHeading(doc(node("text-section", { heading: "About" })), SITE_REGISTRY),
    ).toBe(true);
    expect(firstSectionHasHeading(doc(node("gallery")), SITE_REGISTRY)).toBe(false);
    expect(firstSectionHasHeading(SITE_HOME_DOCUMENT, SITE_REGISTRY)).toBe(true);
  });

  it("new blocks render nothing until they have content: no invented text", () => {
    for (const definition of SITE_REGISTRY.sections) {
      if (definition.type === "hero") continue;
      expect(
        render(doc(node(definition.type, definition.defaultProps))),
        definition.type,
      ).toBe("");
    }
    // Incomplete items are left out rather than shown half-empty.
    expect(
      render(doc(node("testimonials", { items: [{ quote: "Great", name: "", detail: "" }] }))),
    ).toBe("");
    expect(
      render(
        doc(
          node("logo-strip", { logos: [{ image: { mediaId: MEDIA_ID }, name: "", link: null }] }),
        ),
      ),
    ).toBe("");
  });

  it("renders merchant text as text: script, event handlers and markup are escaped", () => {
    const payload = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    const html = render(
      doc(
        node("hero", { heading: payload, subheading: payload }),
        node("faq", { heading: payload, items: [{ question: payload, answer: payload }] }),
        node("testimonials", { items: [{ quote: payload, name: payload, detail: payload }] }),
        node("contact-details", { heading: payload, address: payload, hours: payload }),
      ),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    // No element carries a handler: the payload only ever appears as text.
    expect(html).not.toMatch(/<[^>]* onerror=/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("links and images resolve through the context; unresolved ones render as nothing", () => {
    const html = render(
      doc(
        node("call-to-action", {
          heading: "Visit",
          action: { label: "About", link: { type: "page", id: PAGE_ID } },
          secondaryAction: { label: "Gone", link: { type: "page", id: toTypeId("page", uuid(8)) } },
        }),
        node("image-section", { image: { mediaId: MEDIA_ID, alt: "Kiln" } }),
        node("image-section", { image: { mediaId: toTypeId("media", uuid(7)) } }),
      ),
      context({
        link: (t) => (t.type === "page" && "id" in t && t.id === PAGE_ID ? "/pages/about" : null),
      }),
    );
    expect(html).toContain('href="/pages/about"');
    expect(html).not.toContain("Gone");
    expect(html).toContain('alt="Kiln"');
    expect(html.match(/<img/g)).toHaveLength(1);
  });

  it("the FAQ needs no JavaScript and contact details link safely", () => {
    const html = render(
      doc(
        node("faq", { items: [{ question: "Open?", answer: "Yes.\n\nDaily." }] }),
        node("contact-details", {
          email: "hi@clay.test",
          phone: "+44 (0)20 7946 0000",
          address: "1 Kiln Lane\nLondon",
        }),
      ),
    );
    expect(html).toContain("<details><summary>Open?</summary><p>Yes.</p><p>Daily.</p></details>");
    expect(html).toContain('href="mailto:hi@clay.test"');
    expect(html).toContain('href="tel:+4402079460000"');
    expect(html).toContain('<span class="sv-line">London</span>');
  });

  it("skips unknown, invalid and hidden nodes, reporting what it skipped", () => {
    const onUnknownComponent = vi.fn();
    const onInvalidComponent = vi.fn();
    const html = render(
      {
        schemaVersion: 1,
        root: [
          node("marquee"),
          node("heading", { text: "Hidden", level: 2 }, { hidden: true }),
          node("heading", { text: "x", level: 9 }),
          node("divider"),
        ],
      },
      context({}, { onUnknownComponent, onInvalidComponent }),
    );
    expect(html).toMatch(/^<hr class="sv-divider n-node\d{8}"\/>$/);
    expect(onUnknownComponent).toHaveBeenCalledWith("marquee");
    expect(onInvalidComponent).toHaveBeenCalledWith("heading");
  });

  it("a tampered rich-text document renders as nothing instead of failing the page", () => {
    const tampered = {
      ...node("rich-text"),
      props: { doc: { type: "doc", content: [{ type: "script", text: "x" }] } },
    };
    expect(render(doc(tampered as BuilderNode))).toBe("");
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
    expect(render(doc({ ...node("rich-text"), props: { doc: unsafeLink } }))).toBe("");
    expect(render(doc(node("text-section", { heading: "", body: unsafeLink })))).toBe("");
  });

  it("rich text renders headings, lists, emphasis and safe links as elements", () => {
    const html = render(
      doc(
        node("text-section", {
          heading: "",
          body: {
            type: "doc",
            content: [
              { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Care" }] },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Wash" }] }],
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "<b>safe</b> ",
                    marks: [{ type: "bold" }, { type: "italic" }],
                  },
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
    );
    expect(html).toContain("<h2><span>Care</span></h2>");
    expect(html).toContain("<ul><li><p><span>Wash</span></p></li></ul>");
    expect(html).toContain("<em><strong>");
    expect(html).toContain("&lt;b&gt;safe&lt;/b&gt;");
    expect(html).toContain(
      '<a href="https://example.com" rel="noopener noreferrer nofollow">ok</a>',
    );
  });
});

describe("a composition's blocks", () => {
  it("render with the composition's context and never reach the Site Engine's registry", () => {
    interface ShopContext extends SiteRenderContext {
      readonly greeting: string;
    }
    const greeting = defineComponent<{ name: string }, ShopContext>({
      type: "greeting",
      label: "Greeting",
      icon: "hand",
      category: "marketing",
      section: true,
      defaultProps: { name: "" },
      propertySchema: z.strictObject({ name: z.string().max(20) }),
      allowedChildren: "none",
      editorControls: [{ prop: "name", kind: "text", label: "Name" }],
      render: ({ props, ctx }) => <p>{`${ctx.greeting}, ${props.name}`}</p>,
    });
    const shop = createRegistry<ShopContext>({
      linkKinds: SITE_LINK_KINDS,
      components: [...SITE_COMPONENTS, greeting],
    });
    const html = renderToStaticMarkup(
      <RenderDocument
        document={doc(node("greeting", { name: "Ada" }))}
        registry={shop}
        ctx={{ ...context(), greeting: "Hello" }}
      />,
    );
    expect(html).toBe("<p>Hello, Ada</p>");
    expect(SITE_REGISTRY.get("greeting")).toBeUndefined();
  });
});
