// Commerce components (ADR-0028 §5, ADR-0030 §4): the product, collection and
// search templates' components, and the commerce section blocks merchants
// add to pages. They read resolved data from the render context and never
// fetch; interactive leaves (the cart form) come from the host through
// `ctx.slots`. Server components, no client JavaScript.
import { plainText } from "@storevia/editor/document";
import {
  cx,
  defineComponent,
  SectionFrame,
  sectionPresentation,
  sectionPresentationControls,
  type ComponentDefinition,
  type SchemaKit,
} from "@storevia/editor/registry";
import { Image, RichText } from "@storevia/editor/render";
import { z } from "zod";
import {
  collectionListSourceSchema,
  dataSourceSchema,
  MAX_FEATURED_PRODUCTS,
  MAX_LISTED_COLLECTIONS,
} from "./links";
import { Pagination, Price, ProductGridList } from "./parts";
import type { CommerceRenderContext, ProductView, VariantView } from "./types";

type RenderContext = CommerceRenderContext;

const defineCommerce = <P extends object>(definition: ComponentDefinition<P, RenderContext>) =>
  defineComponent<P, RenderContext>(definition);

const gridColumns = z.number().int().min(2).max(6);
const columnsVariable = (props: { columns?: number }) =>
  props.columns ? { "--sv-grid-columns": String(props.columns) } : {};

export const productGrid = defineCommerce({
  type: "product-grid",
  label: "Product grid",
  icon: "layout-grid",
  category: "commerce",
  defaultProps: { heading: "", source: { type: "catalogue" }, limit: 8, columns: 4 },
  propertySchema: z.strictObject({
    heading: plainText(200),
    source: dataSourceSchema,
    limit: z.number().int().min(1).max(48),
    columns: gridColumns,
  }),
  allowedChildren: "none",
  dataRequirements: (props) => [{ kind: "product-list", source: props.source, limit: props.limit }],
  cssVariables: columnsVariable,
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    { prop: "source", kind: "product-source", label: "Products" },
    { prop: "limit", kind: "number", label: "Number of products" },
    { prop: "columns", kind: "number", label: "Columns" },
  ],
  render: ({ props, className, ctx }) => {
    const products = ctx.data.productList(props.source, props.limit);
    if (products.length === 0) return null;
    return (
      <div className={cx("sv-product-grid", className)}>
        {props.heading ? <h2 className="sv-heading">{props.heading}</h2> : null}
        <ProductGridList products={products} ctx={ctx} label={props.heading || "Products"} />
      </div>
    );
  },
});

/** The selected variant, else the first available one, else the first. */
function chosenVariant(product: ProductView, ctx: RenderContext): VariantView | null {
  return (
    product.variants.find((v) => v.id === ctx.selectedVariantId) ??
    product.variants.find((v) => v.available) ??
    product.variants[0] ??
    null
  );
}

export const productDetail = defineCommerce({
  type: "product-detail",
  label: "Product details",
  icon: "shopping-bag",
  category: "commerce",
  defaultProps: { showVendor: true },
  propertySchema: z.strictObject({ showVendor: z.boolean() }),
  allowedChildren: "none",
  allowedPageKinds: ["PRODUCT_TEMPLATE"],
  dataRequirements: () => [{ kind: "current-product" }],
  editorControls: [{ prop: "showVendor", kind: "toggle", label: "Show vendor" }],
  render: ({ props, className, ctx }) => {
    const product = ctx.data.currentProduct;
    if (!product) return null;
    const variant = chosenVariant(product, ctx);
    const images = variant?.image
      ? [variant.image, ...product.images.filter((i) => i.url !== variant.image?.url)]
      : product.images;
    const [first, ...rest] = images;
    const { AddToCart } = ctx.slots;
    return (
      <div className={cx("sv-product", className)}>
        <div className="sv-product-gallery">
          {first ? (
            <Image
              image={first}
              sizes="(max-width:1024px) 100vw, 50vw"
              priority
              className="sv-product-main"
            />
          ) : (
            <div className="sv-card-placeholder" aria-hidden="true" />
          )}
          {rest.length > 0 ? (
            <ul className="sv-product-thumbs" aria-label="More images">
              {rest.map((image) => (
                <li key={image.url}>
                  <Image image={image} sizes="(max-width:1024px) 25vw, 12vw" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="sv-product-info">
          {props.showVendor && product.vendor ? (
            <p className="sv-product-vendor">{product.vendor}</p>
          ) : null}
          <h1 className="sv-product-title">{product.title}</h1>
          {variant ? (
            <Price price={variant.price} compareAt={variant.compareAtPrice} ctx={ctx} />
          ) : null}
          {product.variants.length > 1 ? (
            <nav className="sv-variants" aria-label="Options">
              <p className="sv-variants-label">
                {product.options.map((o) => o.name).join(" / ") || "Option"}
              </p>
              <ul>
                {product.variants.map((v) => (
                  <li key={v.id}>
                    <a
                      href={ctx.variantHref(v.id)}
                      aria-current={v.id === variant?.id ? "true" : undefined}
                      className={cx("sv-variant", !v.available && "sv-variant-unavailable")}
                      rel="nofollow"
                    >
                      {v.title}
                      {v.available ? null : <span className="sv-visually-hidden"> (sold out)</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <AddToCart product={product} variant={variant} />
          <RichText doc={product.description} className="sv-prose sv-product-description" />
        </div>
      </div>
    );
  },
});

export const collectionHeader = defineCommerce({
  type: "collection-header",
  label: "Collection header",
  icon: "folder",
  category: "commerce",
  defaultProps: {},
  propertySchema: z.strictObject({}),
  allowedChildren: "none",
  allowedPageKinds: ["COLLECTION_TEMPLATE"],
  dataRequirements: () => [{ kind: "current-collection" }],
  editorControls: [],
  render: ({ className, ctx }) => {
    const collection = ctx.data.currentCollection;
    if (!collection) return null;
    return (
      <header className={cx("sv-collection-header", className)}>
        <h1 className="sv-heading">{collection.title}</h1>
        <RichText doc={collection.description} />
      </header>
    );
  },
});

export const collectionProducts = defineCommerce({
  type: "collection-products",
  label: "Collection products",
  icon: "layout-grid",
  category: "commerce",
  defaultProps: { columns: 4 },
  propertySchema: z.strictObject({ columns: gridColumns }),
  allowedChildren: "none",
  allowedPageKinds: ["COLLECTION_TEMPLATE"],
  dataRequirements: () => [{ kind: "current-collection" }],
  cssVariables: columnsVariable,
  editorControls: [{ prop: "columns", kind: "number", label: "Columns" }],
  render: ({ className, ctx }) => {
    const collection = ctx.data.currentCollection;
    if (!collection) return null;
    return (
      <div className={cx("sv-product-grid", className)}>
        {collection.products.length === 0 ? (
          <p className="sv-empty">There are no products in this collection yet.</p>
        ) : (
          <ProductGridList
            products={collection.products}
            ctx={ctx}
            label={collection.title}
            priorityCount={4}
          />
        )}
        <Pagination page={collection.page} pageCount={collection.pageCount} ctx={ctx} />
      </div>
    );
  },
});

export const searchResults = defineCommerce({
  type: "search-results",
  label: "Search results",
  icon: "search",
  category: "commerce",
  defaultProps: { columns: 4 },
  propertySchema: z.strictObject({ columns: gridColumns }),
  allowedChildren: "none",
  allowedPageKinds: ["SEARCH_TEMPLATE"],
  dataRequirements: () => [{ kind: "search" }],
  cssVariables: columnsVariable,
  editorControls: [{ prop: "columns", kind: "number", label: "Columns" }],
  render: ({ className, ctx }) => {
    const search = ctx.data.search;
    if (!search) return null;
    const home = ctx.data.link({ type: "search" }) ?? "/search";
    return (
      <div className={cx("sv-search", className)}>
        <h1 className="sv-heading">
          {search.query ? `Results for “${search.query}”` : "All products"}
        </h1>
        <form className="sv-search-form" role="search" action={home} method="get">
          <label className="sv-visually-hidden" htmlFor="sv-search-q">
            Search products
          </label>
          <input
            id="sv-search-q"
            name="q"
            type="search"
            defaultValue={search.query}
            maxLength={100}
            placeholder="Search products"
          />
          <button className="sv-button" type="submit">
            Search
          </button>
        </form>
        {search.products.length === 0 ? (
          <p className="sv-empty">
            {search.query ? `No products match “${search.query}”.` : "There are no products yet."}
          </p>
        ) : (
          <>
            <p className="sv-muted">{`${String(search.total)} ${search.total === 1 ? "product" : "products"}`}</p>
            <ProductGridList
              products={search.products}
              ctx={ctx}
              label="Search results"
              priorityCount={4}
            />
          </>
        )}
        <Pagination page={search.page} pageCount={search.pageCount} ctx={ctx} />
      </div>
    );
  },
});

// ---------------------------------------------------------------------------
// Section blocks.
// ---------------------------------------------------------------------------

const PRESENTATION_DEFAULTS = { background: "default", spacing: "standard" } as const;
const headingId = (nodeId: string) => `h-${nodeId}`;
const blockColumns = z.union([z.literal(2), z.literal(3), z.literal(4)]);
const COLUMNS_CONTROL = {
  prop: "columns",
  kind: "select",
  label: "Columns on large screens",
  help: "Phones show two columns.",
  options: [
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
  ],
} as const;

function BlockHeading({
  id,
  position,
  text,
}: {
  id: string;
  position: number | null;
  text: string;
}) {
  const Tag = position === 0 ? "h1" : "h2";
  return (
    <Tag id={id} className="sv-block-heading">
      {text}
    </Tag>
  );
}

export const featuredProducts = (kit: SchemaKit) =>
  defineCommerce({
    type: "featured-products",
    label: "Products",
    description: "Products from your catalogue, a collection or your own pick.",
    icon: "shopping-bag",
    category: "commerce",
    section: true,
    headingProp: "heading",
    requires: ["catalogue"],
    defaultProps: {
      heading: "",
      source: { type: "catalogue" },
      limit: 8,
      columns: 4,
      action: null,
      ...PRESENTATION_DEFAULTS,
    },
    propertySchema: z.strictObject({
      heading: plainText(200),
      source: dataSourceSchema,
      limit: z.number().int().min(1).max(MAX_FEATURED_PRODUCTS),
      columns: blockColumns,
      action: z.strictObject({ label: plainText(80).min(1), link: kit.link }).nullable(),
      ...sectionPresentation,
    }),
    allowedChildren: "none",
    dataRequirements: (props) => [
      { kind: "product-list", source: props.source, limit: props.limit },
    ],
    cssVariables: (props) => (props.columns ? { "--sv-grid-columns": String(props.columns) } : {}),
    editorControls: [
      { prop: "heading", kind: "text", label: "Heading" },
      { prop: "source", kind: "product-source", label: "Products" },
      {
        prop: "limit",
        kind: "number",
        label: "Most products shown",
        min: 1,
        max: MAX_FEATURED_PRODUCTS,
      },
      COLUMNS_CONTROL,
      { prop: "action", kind: "action", label: "Button" },
      ...sectionPresentationControls,
    ],
    render: ({ props, className, ctx, node, position }) => {
      const products = ctx.data.productList(props.source, props.limit);
      if (products.length === 0) return null;
      const href = props.action ? ctx.data.link(props.action.link) : null;
      return (
        <SectionFrame
          type="products"
          className={className}
          props={props}
          headingId={props.heading ? headingId(node.id) : undefined}
        >
          {props.heading ? (
            <BlockHeading id={headingId(node.id)} position={position} text={props.heading} />
          ) : null}
          <ProductGridList
            products={products}
            ctx={ctx}
            label={props.heading || "Products"}
            priorityCount={position === 0 ? 4 : 0}
          />
          {props.action && href ? (
            <div className="sv-actions">
              <a className="sv-button sv-button-secondary" href={href}>
                {props.action.label}
              </a>
            </div>
          ) : null}
        </SectionFrame>
      );
    },
  });

export const collectionList = defineCommerce({
  type: "collection-list",
  label: "Collections",
  description: "Your collections, each with its image.",
  icon: "folders",
  category: "commerce",
  section: true,
  headingProp: "heading",
  requires: ["catalogue"],
  defaultProps: {
    heading: "",
    source: { type: "all" },
    limit: 8,
    columns: 4,
    ...PRESENTATION_DEFAULTS,
  },
  propertySchema: z.strictObject({
    heading: plainText(200),
    source: collectionListSourceSchema,
    limit: z.number().int().min(1).max(MAX_LISTED_COLLECTIONS),
    columns: blockColumns,
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  dataRequirements: (props) => [
    { kind: "collection-list", source: props.source, limit: props.limit },
  ],
  cssVariables: (props) => (props.columns ? { "--sv-block-columns": String(props.columns) } : {}),
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    { prop: "source", kind: "collections", label: "Collections" },
    {
      prop: "limit",
      kind: "number",
      label: "Most collections shown",
      min: 1,
      max: MAX_LISTED_COLLECTIONS,
    },
    COLUMNS_CONTROL,
    ...sectionPresentationControls,
  ],
  render: ({ props, className, ctx, node, position }) => {
    const collections = ctx.data.collectionList(props.source, props.limit);
    if (collections.length === 0) return null;
    return (
      <SectionFrame
        type="collections"
        className={className}
        props={props}
        headingId={props.heading ? headingId(node.id) : undefined}
      >
        {props.heading ? (
          <BlockHeading id={headingId(node.id)} position={position} text={props.heading} />
        ) : null}
        <ul
          className="sv-block-grid sv-collection-cards"
          aria-label={props.heading || "Collections"}
        >
          {collections.map((collection) => (
            <li key={collection.id}>
              <a
                className="sv-collection-card"
                href={`/collections/${encodeURIComponent(collection.handle)}`}
              >
                <span className="sv-card-media">
                  {collection.image ? (
                    <Image
                      image={{ ...collection.image, alt: "" }}
                      sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
                    />
                  ) : (
                    <span className="sv-card-placeholder" aria-hidden="true" />
                  )}
                </span>
                <span className="sv-collection-card-title">{collection.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </SectionFrame>
    );
  },
});
