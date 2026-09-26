// Built-in default templates (ADR-0028 §6): what a store shows for a route
// until it publishes its own page of that kind. Stored in code, rendered by
// the same registry, never written to a store's tables. They contain no
// invented content: the home hero shows the store's own name, and grids show
// the store's own products (or nothing).
import type { PageDocument, PageKind } from "../document/types";

const HOME: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfHomeHero01",
      type: "hero",
      props: {
        heading: "",
        subheading: "",
        cta: { label: "Shop all products", link: { type: "search" } },
        image: null,
        align: "center",
      },
      styles: {},
    },
    {
      id: "dfHomeGrid01",
      type: "section",
      props: { label: "", width: "contained" },
      styles: {},
      children: [
        {
          id: "dfHomeProds1",
          type: "product-grid",
          props: {
            heading: "Latest products",
            source: { type: "catalogue" },
            limit: 8,
            columns: 4,
          },
          styles: {},
        },
      ],
    },
  ],
};

const PRODUCT: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfProdSect01",
      type: "section",
      props: { label: "", width: "contained" },
      styles: { paddingBlock: { $token: "space.lg" } },
      children: [
        { id: "dfProdDetail", type: "product-detail", props: { showVendor: true }, styles: {} },
      ],
    },
  ],
};

const COLLECTION: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfCollSect01",
      type: "section",
      props: { label: "", width: "contained" },
      styles: { paddingBlock: { $token: "space.lg" } },
      children: [
        { id: "dfCollHeader", type: "collection-header", props: {}, styles: {} },
        { id: "dfCollProds1", type: "collection-products", props: { columns: 4 }, styles: {} },
      ],
    },
  ],
};

const SEARCH: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfSrchSect01",
      type: "section",
      props: { label: "", width: "contained" },
      styles: { paddingBlock: { $token: "space.lg" } },
      children: [{ id: "dfSrchResult", type: "search-results", props: { columns: 4 }, styles: {} }],
    },
  ],
};

const NOT_FOUND: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfNotFound01",
      type: "section",
      props: { label: "", width: "contained" },
      styles: { paddingBlock: { $token: "space.3xl" }, textAlign: "center" },
      children: [
        {
          id: "dfNotFoundHd",
          type: "heading",
          props: { text: "Page not found", level: 1 },
          styles: {},
        },
        {
          id: "dfNotFoundTx",
          type: "text",
          props: { text: "The page you were looking for doesn't exist or is no longer available." },
          styles: { color: { $token: "color.muted" } },
        },
        {
          id: "dfNotFoundBt",
          type: "button",
          props: { label: "Back to the home page", link: { type: "home" }, style: "primary" },
          styles: {},
        },
      ],
    },
  ],
};

/** Default documents per page kind; standard pages have none (a missing one is a 404). */
export const DEFAULT_TEMPLATES: Readonly<Record<Exclude<PageKind, "STANDARD">, PageDocument>> = {
  HOME,
  PRODUCT_TEMPLATE: PRODUCT,
  COLLECTION_TEMPLATE: COLLECTION,
  SEARCH_TEMPLATE: SEARCH,
  NOT_FOUND,
};
