// Boutique: the second first-party theme (M7). A quieter, fashion-house
// presentation of the same pages and blocks: the store's name centred above
// an uppercase, letter-spaced menu, portrait product cards with centred
// serif titles, a wide product gallery beside a sticky details column,
// square corners and uppercase buttons. Everything is first-party CSS
// scoped under [data-sv-theme="boutique"] and driven by the same tokens,
// so every block, every page kind, the cart and checkout render unchanged
// underneath; page documents and commerce data never know which theme is on.
import { THEME_ENGINE_VERSION, defineTheme, themeSettingsSchemaFor } from "../theme-core";

export const BOUTIQUE_PRESET_KEYS = ["atelier", "linen", "gallery"] as const;

const S = '[data-sv-theme="boutique"]';

const BOUTIQUE_CSS = `
${S} h1,${S} h2,${S} h3{font-weight:400;letter-spacing:.01em}
${S} .sv-announcement{text-transform:uppercase;letter-spacing:.14em;font-size:var(--sv-fontSize-xs)}
${S} .sv-header{border-bottom:0}
${S} .sv-brand{font-size:var(--sv-fontSize-2xl);font-weight:400;letter-spacing:.14em;text-transform:uppercase}
${S} .sv-header-nav{border-block:1px solid var(--sv-color-border)}
${S} .sv-header-links a{text-transform:uppercase;letter-spacing:.12em;font-size:var(--sv-fontSize-sm)}
${S} .sv-button{text-transform:uppercase;letter-spacing:.12em;font-size:var(--sv-fontSize-sm)}
${S} .sv-card{text-align:center}
${S} .sv-card-media{aspect-ratio:3/4;border-radius:0;margin-bottom:var(--sv-space-md)}
${S} .sv-card-placeholder{aspect-ratio:3/4}
${S} .sv-card-title{font-family:var(--sv-font-heading);font-size:var(--sv-fontSize-lg);font-weight:400}
${S} .sv-card .sv-price{color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm);letter-spacing:.06em}
${S} .sv-card .sv-price-sale{color:var(--sv-color-danger)}
${S} .sv-collection-card-title{font-family:var(--sv-font-heading);font-weight:400;text-transform:uppercase;letter-spacing:.1em}
${S} .sv-product{grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:var(--sv-space-3xl)}
${S} .sv-product-main,${S} .sv-product-thumbs img{border-radius:0}
${S} .sv-product-info{position:sticky;top:var(--sv-space-lg);align-self:start}
${S} .sv-product-title{font-weight:400}
${S} .sv-product-info .sv-price{font-size:var(--sv-fontSize-lg);letter-spacing:.04em}
${S} .sv-variant{border-radius:0;text-transform:uppercase;letter-spacing:.08em;font-size:var(--sv-fontSize-sm)}
${S} .sv-checkout-summary{border-radius:0;background:var(--sv-color-surface)}
${S} .sv-checkout-step h2,${S} .sv-checkout-summary h2{text-transform:uppercase;letter-spacing:.12em;font-size:var(--sv-fontSize-sm);font-weight:600}
${S} :focus-visible{outline-offset:3px}
@media (max-width:1024px){${S} .sv-product{gap:var(--sv-space-xl)}}
@media (max-width:640px){${S} .sv-product{grid-template-columns:minmax(0,1fr);gap:var(--sv-space-lg)}${S} .sv-product-info{position:static}${S} .sv-brand{font-size:var(--sv-fontSize-xl);letter-spacing:.1em}}
`
  .replace(/\n/g, "")
  .trim();

export const BOUTIQUE_THEME = defineTheme({
  key: "boutique",
  version: 1,
  name: "Boutique",
  description:
    "A fashion-house layout: your name centred above an uppercase menu, tall product cards and a wide product gallery.",
  author: "Storevia",
  compatibility: { engine: [THEME_ENGINE_VERSION], documentSchema: [1] },
  defaultPreset: "atelier",
  settingsSchema: themeSettingsSchemaFor(BOUTIQUE_PRESET_KEYS),
  chrome: {
    header: "centred",
    navigation: "uppercase",
    footer: "centred",
    productCard: "portrait",
    productPage: "gallery",
  },
  stylesheet: BOUTIQUE_CSS,
  presets: [
    {
      key: "atelier",
      name: "Atelier",
      description: "Ivory paper, old-style serif headings and an olive brand colour.",
      settings: {
        preset: "atelier",
        colors: { background: "#fbf8f3", text: "#1f1d1a", primary: "#3f4a3c", accent: "#8a4b2a" },
        headingFont: "old-style",
        bodyFont: "humanist",
        buttonStyle: "solid",
        radius: "none",
        contentWidth: "wide",
        sectionSpacing: "spacious",
      },
    },
    {
      key: "linen",
      name: "Linen",
      description: "Warm linen, transitional serif headings and outlined burgundy buttons.",
      settings: {
        preset: "linen",
        colors: { background: "#f6f1ea", text: "#2b2522", primary: "#6b2f3a", accent: "#7a4e1d" },
        headingFont: "transitional",
        bodyFont: "system-sans",
        buttonStyle: "outline",
        radius: "small",
        contentWidth: "standard",
        sectionSpacing: "standard",
      },
    },
    {
      key: "gallery",
      name: "Gallery",
      description: "White walls, geometric type, black buttons and an amber accent.",
      settings: {
        preset: "gallery",
        colors: { background: "#ffffff", text: "#111111", primary: "#111111", accent: "#b45309" },
        headingFont: "geometric",
        bodyFont: "geometric",
        buttonStyle: "solid",
        radius: "none",
        contentWidth: "wide",
        sectionSpacing: "compact",
      },
    },
  ],
});
