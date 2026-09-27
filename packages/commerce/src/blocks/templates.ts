// Storevia's page templates (ADR-0028 §6, ADR-0030 §9). The home page an
// ecommerce store starts with (the migration and the Store trigger write the
// same document: a test compares them), and the product, collection and
// search templates every store renders until template editing arrives. They
// contain no invented content: the hero shows the store's own name, and the
// catalogue blocks show the store's own collections and products (or
// nothing).
import type { PageDocument } from "@storevia/editor/document";
import { NOT_FOUND_DOCUMENT } from "@storevia/editor/templates";

export const STORE_HOME_DOCUMENT: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfHomeHero01",
      type: "hero",
      props: {
        heading: "",
        subheading: "",
        cta: { label: "Shop all products", link: { type: "search" } },
        secondaryCta: null,
        image: null,
        align: "center",
        height: "standard",
      },
      styles: {},
    },
    {
      id: "dfHomeColls1",
      type: "collection-list",
      props: {
        heading: "Shop by collection",
        source: { type: "all" },
        limit: 8,
        columns: 4,
        background: "default",
        spacing: "standard",
      },
      styles: {},
    },
    {
      id: "dfHomeProds1",
      type: "featured-products",
      props: {
        heading: "Latest products",
        source: { type: "catalogue" },
        limit: 8,
        columns: 4,
        action: null,
        background: "default",
        spacing: "standard",
      },
      styles: {},
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

export type StoreviaPageKind =
  | "HOME"
  | "STANDARD"
  | "PRODUCT_TEMPLATE"
  | "COLLECTION_TEMPLATE"
  | "SEARCH_TEMPLATE"
  | "NOT_FOUND";

/** What a route renders when its page is missing or unusable; standard pages have none (a 404). */
export const STOREVIA_TEMPLATES: Readonly<
  Record<Exclude<StoreviaPageKind, "STANDARD">, PageDocument>
> = {
  HOME: STORE_HOME_DOCUMENT,
  PRODUCT_TEMPLATE: PRODUCT,
  COLLECTION_TEMPLATE: COLLECTION,
  SEARCH_TEMPLATE: SEARCH,
  NOT_FOUND: NOT_FOUND_DOCUMENT,
};
