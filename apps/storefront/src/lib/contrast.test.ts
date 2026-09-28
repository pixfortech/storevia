// Contrast regression (M8), stylesheet half: the storefront's CSS colours
// text only with tokens the theme engine guarantees at 4.5:1 (checked per
// preset and over a merchant colour grid in
// packages/site-engine/src/contrast.test.ts), and brand-colour sections
// re-point the muted, status and accent tokens at the on-primary colour.
import { COMMERCE_BLOCK_CSS } from "@storevia/commerce/blocks";
import { BASE_CSS } from "@storevia/editor/render";
import { SITE_BASE_CSS } from "@storevia/site-engine/base-css";
import { THEME_DEMO_CSS } from "@storevia/site-engine/demo";
import { THEMES } from "@storevia/site-engine/theme";
import { describe, expect, it } from "vitest";
import { COMMERCE_CSS } from "../components/chrome";

const THEME_CSS = Object.values(THEMES)
  .map((theme) => theme.stylesheet)
  .join("\n");
// Everything a storefront page (or a theme demo) can emit, in any order.
const ALL_CSS = [
  SITE_BASE_CSS,
  BASE_CSS,
  COMMERCE_BLOCK_CSS,
  COMMERCE_CSS,
  THEME_DEMO_CSS,
  THEME_CSS,
].join("\n");

// The tokens text may be coloured with: each is derived to 4.5:1 on the
// background and the surface (on-primary: on the brand colour).
const TEXT_TOKENS = new Set([
  "color-text",
  "color-muted",
  "color-secondary",
  "color-success",
  "color-warning",
  "color-danger",
  "color-on-primary",
  "button-text",
]);

/** Every `color:var(--sv-…)` declaration with the selector it's in. */
function colourDeclarations(css: string): { selector: string; token: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].flatMap(([, selector = "", body = ""]) =>
    [...body.matchAll(/(?:^|;)color:var\(--sv-([a-z-]+)\)/g)].map((m) => ({
      selector: selector.trim(),
      token: m[1] ?? "",
    })),
  );
}

describe("storefront stylesheets", () => {
  it("colour text only with tokens the engine guarantees", () => {
    const declarations = colourDeclarations(ALL_CSS);
    expect(declarations.length).toBeGreaterThan(20);
    const unexpected = declarations.filter((d) => !TEXT_TOKENS.has(d.token));
    // The one exception: the inverted button inside a brand-colour section,
    // whose fill is on-primary (so primary on on-primary, the same pair).
    expect(unexpected).toEqual([{ selector: ".sv-bg-accent .sv-button", token: "color-primary" }]);
    expect(BASE_CSS).toContain(
      ".sv-bg-accent .sv-button{background:var(--sv-color-on-primary);color:var(--sv-color-primary)",
    );
  });

  it("brand-colour sections re-point every muted, status and accent token", () => {
    const rule = /\.sv-bg-accent\{([^}]*)\}/.exec(BASE_CSS)?.[1] ?? "";
    expect(rule).toContain("background:var(--sv-color-primary)");
    expect(rule).toContain("color:var(--sv-color-on-primary)");
    for (const token of ["muted", "secondary", "success", "warning", "danger", "accent"]) {
      expect(rule).toContain(`--sv-color-${token}:var(--sv-color-on-primary)`);
    }
  });

  it("never fades text with opacity inside brand-colour sections", () => {
    expect(ALL_CSS).not.toMatch(/\.sv-bg-accent[^{]*\{[^}]*opacity/);
  });

  it("text boxes on the background fill set the text colour, not inherit it", () => {
    expect(BASE_CSS).toMatch(
      /\.sv-input\{[^}]*background:var\(--sv-color-background\);color:var\(--sv-color-text\)/,
    );
    expect(COMMERCE_BLOCK_CSS).toMatch(
      /\.sv-search-form input\{[^}]*background:var\(--sv-color-background\);color:var\(--sv-color-text\)/,
    );
  });

  it("the theme demo shows the storefront's real colours (no contrast workaround)", () => {
    expect(THEME_DEMO_CSS).not.toContain("sv-hero-sub");
  });
});
