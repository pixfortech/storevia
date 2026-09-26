// Small building blocks shared by commerce renderers. Server components only:
// no state, no effects, no client JavaScript.
import { format } from "@storevia/commerce/money";
import type { ImageView, PriceView, ProductCardView, RenderContext } from "../registry/types";

export function formatPrice(price: PriceView, locale: string): string {
  try {
    return format({ amount: BigInt(price.amount), currency: price.currency }, locale);
  } catch {
    return "";
  }
}

export function Price({
  price,
  compareAt,
  from,
  ctx,
}: {
  price: PriceView;
  compareAt: PriceView | null;
  from?: boolean;
  ctx: RenderContext;
}) {
  const current = formatPrice(price, ctx.store.locale);
  const onSale = compareAt !== null && BigInt(compareAt.amount) > BigInt(price.amount);
  return (
    <p className="sv-price">
      {onSale ? <span className="sv-visually-hidden">Sale price </span> : null}
      <span className={onSale ? "sv-price-sale" : undefined}>
        {from ? "From " : ""}
        {current}
      </span>
      {onSale ? (
        <>
          {" "}
          <span className="sv-visually-hidden">Regular price </span>
          <s className="sv-price-compare">{formatPrice(compareAt, ctx.store.locale)}</s>
        </>
      ) : null}
    </p>
  );
}

export function Image({
  image,
  sizes,
  priority,
  className,
}: {
  image: ImageView;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <img
      className={className}
      src={image.url}
      srcSet={image.srcSet || undefined}
      sizes={image.srcSet ? sizes : undefined}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      alt={image.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}

export function ProductCard({
  product,
  ctx,
  priority = false,
}: {
  product: ProductCardView;
  ctx: RenderContext;
  priority?: boolean;
}) {
  const href = `/products/${encodeURIComponent(product.handle)}`;
  return (
    <li className="sv-card">
      <a className="sv-card-link" href={href}>
        <div className="sv-card-media">
          {product.image ? (
            <Image
              image={product.image}
              sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
              priority={priority}
            />
          ) : (
            <div className="sv-card-placeholder" aria-hidden="true" />
          )}
        </div>
        <h3 className="sv-card-title">{product.title}</h3>
      </a>
      <Price
        price={product.price}
        compareAt={product.compareAtPrice}
        from={product.priceVaries}
        ctx={ctx}
      />
      {product.available ? null : <p className="sv-badge">Sold out</p>}
    </li>
  );
}

export function ProductGridList({
  products,
  ctx,
  label,
  priorityCount = 0,
}: {
  products: readonly ProductCardView[];
  ctx: RenderContext;
  label: string;
  priorityCount?: number;
}) {
  return (
    <ul className="sv-grid" aria-label={label}>
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} ctx={ctx} priority={i < priorityCount} />
      ))}
    </ul>
  );
}

export function Pagination({
  page,
  pageCount,
  ctx,
}: {
  page: number;
  pageCount: number;
  ctx: RenderContext;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="sv-pagination" aria-label="Pagination">
      {page > 1 ? (
        <a href={ctx.pageHref(page - 1)} rel="prev">
          Previous
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
      <span>
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <a href={ctx.pageHref(page + 1)} rel="next">
          Next
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
