// The theme demo as Storevia commerce pages (08-themes.md §10.7): the Site
// Engine's demo content (THEME_DEMO) composed into a home page and a product
// page made of the storefront's own blocks, with the catalogue views those
// blocks read. The app composes them because the Site Engine knows no
// commerce. Pure and client-safe; nothing here reads a store's data.
import {
  STOREVIA_TEMPLATES,
  productListKey,
  type DocumentData,
  type ProductCardView,
  type ProductView,
} from "@storevia/commerce/blocks";
import type { PageDocument } from "@storevia/editor/document";
import { THEME_DEMO, type DemoProduct, type ThemeDemoPage } from "@storevia/site-engine/demo";

const CATALOGUE = { type: "catalogue" } as const;
/** The home page's collection: the four demo products. */
const HOME_LIMIT = 4;
/** "You may also like" on the product page: the three others. */
const MORE_LIMIT = 3;

const card = (product: DemoProduct): ProductCardView => ({
  id: product.id,
  handle: product.handle,
  title: product.title,
  price: product.price,
  compareAtPrice: product.compareAtPrice,
  priceVaries: false,
  image: null,
  available: true,
});

function featuredProduct(): DemoProduct {
  const found =
    THEME_DEMO.products.find((p) => p.id === THEME_DEMO.featuredProductId) ??
    THEME_DEMO.products[0];
  if (!found) throw new Error("the theme demo has no products");
  return found;
}

const featured = featuredProduct();

/** The demo product page's product, with one variant per option value. */
export const DEMO_PRODUCT: ProductView = {
  id: featured.id,
  handle: featured.handle,
  title: featured.title,
  vendor: featured.vendor,
  description: {
    type: "doc",
    content: featured.description.map((text) => ({
      type: "paragraph" as const,
      content: [{ type: "text" as const, text }],
    })),
  },
  images: [],
  options: [{ name: featured.option.name, values: featured.option.values }],
  variants: featured.option.values.map((value, i) => ({
    id: `${featured.id}-${String(i + 1)}`,
    title: value,
    price: featured.price,
    compareAtPrice: featured.compareAtPrice,
    available: true,
    optionValues: [value],
    image: null,
  })),
};

/** The catalogue views the demo pages' blocks read. */
export const DEMO_DOCUMENT_DATA: DocumentData = {
  productLists: [
    [productListKey(CATALOGUE, HOME_LIMIT), THEME_DEMO.products.map(card)],
    [
      productListKey(CATALOGUE, MORE_LIMIT),
      THEME_DEMO.products.filter((p) => p.id !== featured.id).map(card),
    ],
  ],
  collectionLists: [],
  links: { products: [], collections: [], pages: [] },
  media: [],
};

const DEMO_HOME: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "demoHomeHero",
      type: "hero",
      props: {
        heading: THEME_DEMO.hero.heading,
        subheading: THEME_DEMO.hero.subheading,
        cta: { label: THEME_DEMO.hero.cta, link: { type: "search" } },
        secondaryCta: { label: THEME_DEMO.hero.secondaryCta, link: { type: "home" } },
        image: null,
        align: "center",
        height: "standard",
      },
      styles: {},
    },
    {
      id: "demoHomeProd",
      type: "featured-products",
      props: {
        heading: THEME_DEMO.collection.title,
        source: CATALOGUE,
        limit: HOME_LIMIT,
        columns: 4,
        action: { label: THEME_DEMO.collection.cta, link: { type: "search" } },
        background: "default",
        spacing: "standard",
      },
      styles: {},
    },
  ],
};

const DEMO_PRODUCT_PAGE: PageDocument = {
  schemaVersion: 1,
  root: [
    // The product template every store renders, as it is.
    ...STOREVIA_TEMPLATES.PRODUCT_TEMPLATE.root,
    {
      id: "demoProdMore",
      type: "featured-products",
      props: {
        heading: "You may also like",
        source: CATALOGUE,
        limit: MORE_LIMIT,
        columns: 3,
        action: null,
        background: "default",
        spacing: "standard",
      },
      styles: {},
    },
  ],
};

export interface DemoPageDefinition {
  readonly document: PageDocument;
  /** The page kind the storefront renders the document as. */
  readonly kind: "HOME" | "PRODUCT_TEMPLATE";
  readonly label: string;
  /** The path the page would have on a store (marks the current menu link). */
  readonly path: string;
}

export const DEMO_PAGES: Readonly<Record<ThemeDemoPage, DemoPageDefinition>> = {
  home: { document: DEMO_HOME, kind: "HOME", label: "Home page", path: "/" },
  product: {
    document: DEMO_PRODUCT_PAGE,
    kind: "PRODUCT_TEMPLATE",
    label: "Product page",
    path: `/products/${featured.handle}`,
  },
};

/**
 * Styles the storefront app adds for its own header links and cart form
 * (apps/storefront COMMERCE_CSS), for the demo's inert equivalents.
 */
export const DEMO_COMPOSITION_CSS = `
.sv-header-links{display:flex;gap:var(--sv-space-md)}
.sv-header-links a{text-decoration:none;display:inline-flex;align-items:center;min-height:2.75rem}
.sv-add-to-cart{display:flex;gap:var(--sv-space-sm);align-items:flex-end;flex-wrap:wrap;margin-bottom:var(--sv-space-lg)}
`
  .replace(/\n/g, "")
  .trim();
