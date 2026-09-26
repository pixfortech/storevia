// Commerce components for the M4 routes (ADR-0028 §5). They read resolved
// data from the render context and never fetch; interactive leaves (the cart
// form) come from the host through `ctx.slots`.
import { z } from "zod";
import { dataSourceSchema, plainText } from "../../document/refs";
import { Image, Pagination, Price, ProductGridList } from "../../render/parts";
import { RichText } from "../../render/rich-text";
import { cx, defineComponent } from "../define";
import type { ProductView, RenderContext, VariantView } from "../types";

const gridColumns = z.number().int().min(2).max(6);
const columnsVariable = (props: { columns?: number }) =>
  props.columns ? { "--sv-grid-columns": String(props.columns) } : {};

export const productGrid = defineComponent({
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
    { prop: "source", kind: "data-source", label: "Products" },
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

export const productDetail = defineComponent({
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

export const collectionHeader = defineComponent({
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

export const collectionProducts = defineComponent({
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

export const searchResults = defineComponent({
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
