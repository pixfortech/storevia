import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteChrome, SiteMenu } from "./chrome";
import {
  THEME_DEMO,
  THEME_DEMO_CSS,
  THEME_DEMO_VIEWPORTS,
  themeDemo,
  themeDemoAttributes,
} from "./demo";
import { BOUTIQUE_THEME, STOREVIA_THEME, THEMES, type ThemeDefinition } from "./theme";

// Theme demos (08-themes.md §10.7): every first-party theme renders the same
// Storevia-owned demo content through the real chrome, and the differences
// between themes come from their packages, not from the demo.

function renderDemo(theme: ThemeDefinition): string {
  const demo = themeDemo(theme, ".composition{}");
  return renderToStaticMarkup(
    <div className="sv-demo" {...demo.attributes}>
      <style>{demo.css}</style>
      <SiteChrome
        name={THEME_DEMO.brand}
        theme={theme}
        announcement={THEME_DEMO.announcement}
        nav={<SiteMenu label="Main" links={THEME_DEMO.menu} />}
        footerNav={<SiteMenu label="Footer" links={THEME_DEMO.footerMenu} />}
        actions={<a href="/cart">{THEME_DEMO.actions.cart}</a>}
      >
        <main id="main">{THEME_DEMO.collection.title}</main>
      </SiteChrome>
    </div>,
  );
}

/** Every selector of a flat stylesheet (no nested blocks). */
const selectors = (css: string) =>
  [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(([, list]) =>
    (list ?? "").split(",").map((s) => s.trim()),
  );

describe("theme demo content", () => {
  it("is Storevia's own, fixed and complete: brand, announcement, hero, collection and four products", () => {
    expect(THEME_DEMO.brand).toBe("Harbour & Loom");
    expect(THEME_DEMO.announcement.length).toBeGreaterThan(10);
    expect(THEME_DEMO.hero.heading.length).toBeGreaterThan(0);
    expect(THEME_DEMO.collection.title).toBe("The autumn edit");
    expect(THEME_DEMO.menu.length).toBeGreaterThanOrEqual(3);
    expect(
      THEME_DEMO.products.map((p) => [p.title, p.price.amount, p.compareAtPrice?.amount]),
    ).toEqual([
      ["Stoneware mug", "145000", undefined],
      ["Linen table runner", "220000", "280000"],
      ["Beeswax pillar candle", "89000", undefined],
      ["Walnut serving board", "360000", undefined],
    ]);
    const onSale = THEME_DEMO.products.filter(
      (p) => p.compareAtPrice && BigInt(p.compareAtPrice.amount) > BigInt(p.price.amount),
    );
    expect(onSale.length).toBeGreaterThanOrEqual(1);
    expect(new Set(THEME_DEMO.products.map((p) => p.id)).size).toBe(4);
    expect(new Set(THEME_DEMO.products.map((p) => p.handle)).size).toBe(4);
    expect(THEME_DEMO.products.some((p) => p.id === THEME_DEMO.featuredProductId)).toBe(true);
  });

  it("is deterministic: frozen, and the same preview every time", () => {
    expect(Object.isFrozen(THEME_DEMO)).toBe(true);
    expect(Object.isFrozen(THEME_DEMO.products[0]?.price)).toBe(true);
    expect(() => {
      (THEME_DEMO.products as unknown as unknown[]).push({});
    }).toThrow();
    for (const theme of Object.values(THEMES)) {
      expect(themeDemo(theme)).toEqual(themeDemo(theme));
      expect(renderDemo(theme)).toBe(renderDemo(theme));
    }
  });

  it("uses no images, external URLs or unsafe CSS; its styles are scoped to the demo", () => {
    const serialised = JSON.stringify(THEME_DEMO);
    expect(serialised).not.toMatch(/https?:|\/\/|\.(png|jpe?g|webp|avif|svg)\b/);
    expect(THEME_DEMO_CSS).not.toMatch(/@import|url\s*\(|expression\s*\(|javascript:|</i);
    for (const selector of selectors(THEME_DEMO_CSS)) {
      expect(selector.startsWith(".sv-demo"), selector).toBe(true);
    }
  });

  it("offers the builder's viewport widths", () => {
    expect(THEME_DEMO_VIEWPORTS).toEqual({ desktop: 1280, tablet: 768, mobile: 390 });
  });
});

describe("rendering the demo with each theme", () => {
  it("every first-party theme renders it", () => {
    for (const theme of Object.values(THEMES)) {
      const html = renderDemo(theme);
      expect(html, theme.key).toContain(`data-sv-theme="${theme.key}"`);
      expect(html).toContain('<p class="sv-announcement">Free delivery on orders over ₹2,000</p>');
      expect(html).toContain("Harbour &amp; Loom");
      expect(html).toContain('<nav aria-label="Main"><ul class="sv-menu">');
      expect(html).toContain('<nav aria-label="Footer">');
      expect(html).toContain("The autumn edit");
    }
  });

  it("Storevia and Boutique have different identities, chrome and presentation", () => {
    const storevia = renderDemo(STOREVIA_THEME);
    const boutique = renderDemo(BOUTIQUE_THEME);
    expect(storevia).not.toBe(boutique);

    // Identity and layout metadata come from the theme packages.
    expect(themeDemoAttributes(STOREVIA_THEME)).toEqual({
      "data-sv-theme": "storevia",
      "data-sv-navigation": "plain",
      "data-sv-footer": "inline",
      "data-sv-product-card": "square",
      "data-sv-product-page": "split",
    });
    expect(themeDemoAttributes(BOUTIQUE_THEME)).toEqual({
      "data-sv-theme": "boutique",
      "data-sv-navigation": "uppercase",
      "data-sv-footer": "centred",
      "data-sv-product-card": "portrait",
      "data-sv-product-page": "gallery",
    });

    // The header variant is the renderer's: one row, or the name centred above the menu.
    expect(storevia).toContain('<header class="sv-header" data-sv-header="inline">');
    expect(storevia).toContain('class="sv-container sv-header-row"');
    expect(storevia).not.toContain('class="sv-container sv-header-top"');
    expect(boutique).toContain(
      '<header class="sv-header sv-nav-uppercase" data-sv-header="centred">',
    );
    expect(boutique).toContain('class="sv-container sv-header-top"');
    expect(boutique).toContain('class="sv-container sv-header-nav"');
    expect(boutique).toContain('<footer class="sv-footer sv-footer-centred">');
    expect(storevia).toContain('<footer class="sv-footer">');

    // Each preview carries its own theme's preset tokens and scoped stylesheet.
    const [s, b] = [themeDemo(STOREVIA_THEME), themeDemo(BOUTIQUE_THEME, ".composition{}")];
    expect(s.preset.key).toBe("editorial");
    expect(b.preset.key).toBe("atelier");
    expect(s.tokens["color.primary"]).not.toBe(b.tokens["color.primary"]);
    expect(s.tokens["font.heading"]).not.toBe(b.tokens["font.heading"]);
    expect(b.css.endsWith(BOUTIQUE_THEME.stylesheet)).toBe(true);
    expect(b.css).toContain(".sv-card-media{aspect-ratio:3/4");
    expect(s.css).not.toContain('[data-sv-theme="boutique"]');
    // The storefront's order: tokens, base rules, the composition, the demo, the theme.
    const order = [
      ":root{",
      ".sv-header{",
      ".composition{}",
      ".sv-demo{",
      '[data-sv-theme="boutique"]',
    ];
    const positions = order.map((part) => b.css.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });

  it("can preview another of the theme's presets", () => {
    const linen = themeDemo(BOUTIQUE_THEME, "", "linen");
    expect(linen.preset.key).toBe("linen");
    expect(linen.tokens["color.primary"]).toBe("#6b2f3a");
    // An unknown preset falls back to the theme's default.
    expect(themeDemo(BOUTIQUE_THEME, "", "nope").preset.key).toBe("atelier");
  });
});
