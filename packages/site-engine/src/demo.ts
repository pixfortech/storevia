// Theme demos (08-themes.md §10.7): Storevia-owned demo content that every
// first-party theme is previewed with in the dashboard's theme library, and
// what a preview needs from a theme package to render it: the preset's
// tokens, the stylesheet in the order the storefront emits it, and the
// theme's identity as data attributes. The content is fixed and invented by
// Storevia (never a merchant's catalogue), so two themes are compared on
// the same page, and a preview needs no database. Pure and client-safe.
//
// The Site Engine knows no commerce: the content is plain data here. The
// dashboard composes it into page documents and catalogue views and renders
// them with the storefront's own registry inside SiteChrome.
import type { MenuLink } from "./chrome";
import { SITE_BASE_CSS } from "./base-css";
import {
  resolveTheme,
  themePreset,
  type ThemeDefinition,
  type ThemePreset,
  type ThemeTokens,
} from "./theme-core";
import { themeCss } from "./theme";

/** An amount in minor units as a decimal string (like the catalogue's price views). */
export interface DemoPrice {
  readonly amount: string;
  readonly currency: string;
}

export interface DemoProduct {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly vendor: string;
  readonly price: DemoPrice;
  /** Set when the product is on sale (higher than `price`). */
  readonly compareAtPrice: DemoPrice | null;
  /** Paragraphs of plain text. */
  readonly description: readonly string[];
  /** One option (e.g. Colour) and its values; each value is a variant. */
  readonly option: { readonly name: string; readonly values: readonly string[] };
}

export interface ThemeDemoContent {
  readonly brand: string;
  readonly locale: string;
  readonly announcement: string;
  readonly menu: readonly MenuLink[];
  readonly footerMenu: readonly MenuLink[];
  readonly actions: { readonly search: string; readonly cart: string };
  readonly hero: {
    readonly heading: string;
    readonly subheading: string;
    readonly cta: string;
    readonly secondaryCta: string;
  };
  readonly collection: { readonly title: string; readonly cta: string };
  readonly products: readonly DemoProduct[];
  /** The product the demo product page shows (one of `products`). */
  readonly featuredProductId: string;
}

const inr = (rupees: number): DemoPrice => ({ amount: String(rupees * 100), currency: "INR" });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** The demo store every theme is previewed with. Invented by Storevia; deterministic. */
export const THEME_DEMO: ThemeDemoContent = deepFreeze({
  brand: "Harbour & Loom",
  locale: "en-IN",
  announcement: "Free delivery on orders over ₹2,000",
  menu: [
    { key: "demo-shop", label: "Shop", href: "/collections/all" },
    { key: "demo-new", label: "New in", href: "/collections/new" },
    { key: "demo-journal", label: "Journal", href: "/pages/journal" },
    { key: "demo-about", label: "About", href: "/pages/about" },
  ],
  footerMenu: [
    { key: "demo-shipping", label: "Shipping", href: "/pages/shipping" },
    { key: "demo-returns", label: "Returns", href: "/pages/returns" },
    { key: "demo-contact", label: "Contact", href: "/pages/contact" },
  ],
  actions: { search: "Search", cart: "Cart" },
  hero: {
    heading: "Made slowly, used every day",
    subheading: "Stoneware, linen and small-batch goods for a calmer home.",
    cta: "Shop the collection",
    secondaryCta: "Our story",
  },
  collection: { title: "The autumn edit", cta: "View the collection" },
  products: [
    {
      id: "demo-product-mug",
      handle: "stoneware-mug",
      title: "Stoneware mug",
      vendor: "Harbour & Loom",
      price: inr(1450),
      compareAtPrice: null,
      description: ["Thrown by hand and glazed in small batches. Holds 300 ml."],
      option: { name: "Glaze", values: ["Oat", "Moss"] },
    },
    {
      id: "demo-product-runner",
      handle: "linen-table-runner",
      title: "Linen table runner",
      vendor: "Harbour & Loom",
      price: inr(2200),
      compareAtPrice: inr(2800),
      description: [
        "Stonewashed European linen with a hand-rolled hem. Softens with every wash.",
        "200 × 40 cm. Machine washable at 40°.",
      ],
      option: { name: "Colour", values: ["Natural", "Charcoal", "Rust"] },
    },
    {
      id: "demo-product-candle",
      handle: "beeswax-candle",
      title: "Beeswax pillar candle",
      vendor: "Harbour & Loom",
      price: inr(890),
      compareAtPrice: null,
      description: ["Pure beeswax, cotton wick, around 40 hours of burn time."],
      option: { name: "Size", values: ["Small", "Large"] },
    },
    {
      id: "demo-product-board",
      handle: "walnut-serving-board",
      title: "Walnut serving board",
      vendor: "Harbour & Loom",
      price: inr(3600),
      compareAtPrice: null,
      description: ["Oiled walnut, cut from a single board. Every grain is different."],
      option: { name: "Size", values: ["Medium", "Large"] },
    },
  ],
  featuredProductId: "demo-product-runner",
});

/** The demo pages a full theme demo shows. */
export const THEME_DEMO_PAGES = ["home", "product"] as const;
export type ThemeDemoPage = (typeof THEME_DEMO_PAGES)[number];

/** Layout widths of the viewports a demo is shown at (the builder canvas uses the same). */
export const THEME_DEMO_VIEWPORTS = { desktop: 1280, tablet: 768, mobile: 390 } as const;
export type ThemeDemoViewport = keyof typeof THEME_DEMO_VIEWPORTS;

/**
 * The demo's own presentation: product images are placeholders tinted from
 * the theme's tokens (never an image or an external URL). Scoped under
 * `.sv-demo`; emitted before the theme's stylesheet so a theme can still
 * restyle everything.
 */
export const THEME_DEMO_CSS = `
.sv-demo{min-height:100vh}
.sv-demo .sv-card:nth-child(4n+1) .sv-card-placeholder{background:color-mix(in srgb,var(--sv-color-primary) 16%,var(--sv-color-surface))}
.sv-demo .sv-card:nth-child(4n+2) .sv-card-placeholder{background:color-mix(in srgb,var(--sv-color-accent) 22%,var(--sv-color-surface))}
.sv-demo .sv-card:nth-child(4n+3) .sv-card-placeholder{background:color-mix(in srgb,var(--sv-color-text) 10%,var(--sv-color-surface))}
.sv-demo .sv-card:nth-child(4n+4) .sv-card-placeholder{background:color-mix(in srgb,var(--sv-color-primary) 26%,var(--sv-color-background))}
.sv-demo .sv-product-gallery .sv-card-placeholder{background:color-mix(in srgb,var(--sv-color-accent) 22%,var(--sv-color-surface))}
`
  .replace(/\n/g, "")
  .trim();

export interface ThemeDemo {
  readonly theme: ThemeDefinition;
  readonly preset: ThemePreset;
  readonly tokens: ThemeTokens;
  /**
   * The demo document's stylesheet, in the storefront's order: tokens, the
   * base document rules, the composition's CSS, the demo's placeholders,
   * then the theme's own scoped stylesheet.
   */
  readonly css: string;
  /** The theme's identity and layout as data attributes, for the demo's root element. */
  readonly attributes: ThemeDemoAttributes;
}

export type ThemeDemoAttributes = Readonly<Record<`data-sv-${string}`, string>>;

/** The theme's identity and layout variants as data attributes (tests and tools read these). */
export function themeDemoAttributes(
  theme: Pick<ThemeDefinition, "key" | "chrome">,
): ThemeDemoAttributes {
  return {
    "data-sv-theme": theme.key,
    "data-sv-navigation": theme.chrome.navigation,
    "data-sv-footer": theme.chrome.footer,
    "data-sv-product-card": theme.chrome.productCard,
    "data-sv-product-page": theme.chrome.productPage,
  };
}

/**
 * What a preview of `theme` renders with: one of its presets (its default
 * unless `presetKey` names another), resolved by the same engine as a
 * store's settings, and its stylesheet after `compositionCss`.
 */
export function themeDemo(
  theme: ThemeDefinition,
  compositionCss = "",
  presetKey?: string,
): ThemeDemo {
  const preset = themePreset(theme, presetKey);
  const tokens = resolveTheme(preset.settings);
  return {
    theme,
    preset,
    tokens,
    css: `${themeCss(tokens)}${SITE_BASE_CSS}${compositionCss}${THEME_DEMO_CSS}${theme.stylesheet}`,
    attributes: themeDemoAttributes(theme),
  };
}
