import { STOREVIA_REGISTRY, STOREVIA_TEMPLATES } from "@storevia/commerce/blocks";
import { validateDocument, type PageDocument } from "@storevia/editor/document";
import { THEME_DEMO, THEME_DEMO_NOT_OFFERED, THEME_DEMO_PAGES } from "@storevia/site-engine/demo";
import { THEMES } from "@storevia/site-engine/theme";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeDemoDocument } from "@/components/themes/theme-demo";
import { DEMO_PAGES, DEMO_PRODUCT } from "./theme-demo";

// The theme demo composed from the storefront's own blocks (08-themes.md
// §10.7): valid page documents, rendered by the real registry inside each
// theme's chrome, with the theme's identity on the demo's root.

const render = (themeKey: string, page: "home" | "product", presetKey?: string) =>
  renderToStaticMarkup(createElement(ThemeDemoDocument, { themeKey, page, presetKey }));

const attribute = (html: string, name: string) =>
  new RegExp(`<div class="sv-demo"[^>]* ${name}="([^"]+)"`).exec(html)?.[1];

describe("theme demo pages", () => {
  it("are valid documents for their page kinds", () => {
    for (const page of THEME_DEMO_PAGES) {
      const { document, kind } = DEMO_PAGES[page];
      const result = validateDocument(document, { registry: STOREVIA_REGISTRY, pageKind: kind });
      expect(result.ok ? [] : result.issues, page).toEqual([]);
    }
  });

  it("render the demo store with every theme: header, hero, collection, four products with prices and a sale, footer", () => {
    for (const theme of Object.values(THEMES)) {
      const html = render(theme.key, "home");
      expect(html).toContain('<a class="sv-brand" href="/">Harbour &amp; Loom</a>');
      expect(html).toContain(THEME_DEMO.hero.heading);
      expect(html).toContain(THEME_DEMO.collection.title);
      expect(html.match(/<li class="sv-card">/g)).toHaveLength(4);
      expect(html).toContain("₹1,450.00");
      expect(html).toMatch(
        /class="sv-price-sale">₹2,200\.00<\/span>.*<s class="sv-price-compare">₹2,800\.00<\/s>/,
      );
      expect(html).toContain('<footer class="sv-footer');
      // Placeholders, never images.
      expect(html).not.toContain("<img");
      expect(html).toContain('class="sv-card-placeholder"');
    }
  });

  it("render a product page with the storefront's product template", () => {
    for (const theme of Object.values(THEMES)) {
      const html = render(theme.key, "product");
      expect(html).toContain('<div class="sv-product');
      expect(html).toContain(`<h1 class="sv-product-title">${DEMO_PRODUCT.title}</h1>`);
      expect(html).toContain('aria-label="Options"');
      expect(html).toContain("Add to cart");
      expect(html).not.toContain('<li class="sv-card">');
    }
  });

  it("carry each theme's identity and layout, from its package and renderer", () => {
    const storevia = render("storevia", "home");
    const boutique = render("boutique", "home");
    expect(attribute(storevia, "data-sv-theme")).toBe("storevia");
    expect(attribute(boutique, "data-sv-theme")).toBe("boutique");
    expect(attribute(storevia, "data-sv-product-card")).toBe("square");
    expect(attribute(boutique, "data-sv-product-card")).toBe("portrait");
    expect(attribute(storevia, "data-sv-product-page")).toBe("split");
    expect(attribute(boutique, "data-sv-product-page")).toBe("gallery");
    expect(storevia).toContain('data-sv-header="inline"');
    expect(boutique).toContain('data-sv-header="centred"');
    expect(boutique).toContain("sv-nav-uppercase");
    expect(attribute(storevia, "data-sv-preset")).toBe("editorial");
    expect(attribute(boutique, "data-sv-preset")).toBe("atelier");
    expect(attribute(render("boutique", "home", "linen"), "data-sv-preset")).toBe("linen");
    // The same content (the chrome orders it differently): only the theme differs.
    const words = (html: string) =>
      html
        .replace(/<style>.*?<\/style>/g, "")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .sort();
    expect(words(storevia)).toEqual(words(boutique));
    expect(storevia).not.toBe(boutique);
  });

  it("is deterministic", () => {
    expect(render("boutique", "product")).toBe(render("boutique", "product"));
  });
});

// TH-1: a demo shows only what a store on the theme can really show. Every
// block is one the storefront registers, the product page is the product
// template every store renders (nothing added), and no rendered page shows
// a feature that doesn't exist (THEME_DEMO_NOT_OFFERED).
describe("theme demo fidelity", () => {
  interface Node {
    readonly type: string;
    readonly children?: readonly Node[];
  }
  const blockTypes = (document: PageDocument): string[] => {
    const visit = (nodes: readonly Node[]): string[] =>
      nodes.flatMap((node) => [node.type, ...visit(node.children ?? [])]);
    return visit(document.root);
  };

  it("uses only blocks the storefront registers", () => {
    for (const page of THEME_DEMO_PAGES) {
      const types = blockTypes(DEMO_PAGES[page].document);
      expect(types.length, page).toBeGreaterThan(0);
      for (const type of types) {
        expect(STOREVIA_REGISTRY.get(type), `${page}: ${type}`).toBeDefined();
      }
    }
  });

  it("shows the product page exactly as every store's product template renders it", () => {
    expect(DEMO_PAGES.product.document.root).toEqual(STOREVIA_TEMPLATES.PRODUCT_TEMPLATE.root);
  });

  it("uses on the home page only blocks a store's home page has", () => {
    const home = new Set(blockTypes(STOREVIA_TEMPLATES.HOME));
    for (const type of blockTypes(DEMO_PAGES.home.document)) {
      expect(home.has(type), type).toBe(true);
    }
  });

  it("shows no announcement bar and no feature a store can't have, on any page or theme", () => {
    for (const theme of Object.values(THEMES)) {
      for (const page of THEME_DEMO_PAGES) {
        const html = render(theme.key, page).replace(/<style>[\s\S]*?<\/style>/g, "");
        expect(html).not.toContain("sv-announcement");
        for (const { feature, pattern } of THEME_DEMO_NOT_OFFERED) {
          expect(pattern.test(html), `${theme.key} ${page}: ${feature}`).toBe(false);
        }
      }
    }
  });
});
