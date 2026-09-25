// A storefront as a merchant might design it on Storevia: a browser window
// with the store's header, a hero and a product grid. Storefronts are on the
// roadmap, so this is a concept, not a theme catalogue; the store, products
// and prices are sample content. Responds to its own width.
import { buttonClasses, cn, Icon } from "@storevia/ui";
import { Search, ShoppingBag } from "lucide-react";
import { Mockup, WindowFrame } from "./frame";
import { ProductArt } from "./product-art";
import { SAMPLE_DASHBOARDS, SAMPLE_PRODUCTS, SAMPLE_STORE_ADDRESS } from "./sample-data";

const STORE = SAMPLE_DASHBOARDS.ECOMMERCE.store;

export interface StorefrontPreviewProps {
  className?: string;
  /** Show only the first N products (compact placements). Default all four. */
  products?: number;
  /** Accessible name for the whole mockup. */
  label?: string;
}

export function StorefrontPreview({ className, products = 4, label }: StorefrontPreviewProps) {
  return (
    <Mockup
      label={
        label ??
        "Illustration: a sample storefront designed on Storevia, with a hero and a product grid."
      }
      className={className}
    >
      <WindowFrame address={SAMPLE_STORE_ADDRESS} className="h-full">
        <div className="@container/store flex h-full flex-col overflow-hidden bg-surface">
          <div className="flex h-11 shrink-0 items-center gap-5 border-b border-line px-4 @md/store:px-5">
            <span className="font-display text-[13px] font-bold tracking-[-0.02em] text-ink">
              {STORE}
            </span>
            <span className="hidden gap-4 text-[11.5px] text-ink-muted @md/store:flex">
              <span className="text-ink">Shop</span>
              <span>Journal</span>
              <span>About</span>
            </span>
            <span className="ml-auto flex items-center gap-3 text-ink-muted">
              <Icon icon={Search} size="xs" />
              <span className="relative">
                <Icon icon={ShoppingBag} size="xs" />
                <span className="absolute -top-1 -right-1.5 flex size-3 items-center justify-center rounded-full bg-brand-600 text-[8px] font-semibold text-white">
                  2
                </span>
              </span>
            </span>
          </div>
          <div className="grid shrink-0 items-center gap-4 px-4 py-4 @md/store:grid-cols-[1fr_0.9fr] @md/store:px-5 @md/store:py-5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-brand-700 uppercase">
                New season
              </p>
              <p className="mt-1.5 font-display text-[19px] leading-[1.15] font-semibold tracking-[-0.02em] text-ink @lg/store:text-[22px]">
                The autumn collection
              </p>
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-muted">
                Stoneware, linen and oak, made in small batches.
              </p>
              <span className={buttonClasses("primary", "sm", "mt-3 h-7 px-3 text-[11.5px]")}>
                Shop the collection
              </span>
            </div>
            <div className="hidden h-full min-h-28 items-end justify-center gap-1 rounded-card bg-surface-sunken px-3 pt-3 @md/store:flex">
              <ProductArt kind="vase" className="size-24" />
              <ProductArt kind="mug" className="-ml-5 size-18" />
            </div>
          </div>
          <div className="min-h-0 flex-1 px-4 pb-4 @md/store:px-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-semibold text-ink">Bestsellers</p>
              <p className="text-[11px] text-ink-faint">View all</p>
            </div>
            <ul
              className={cn(
                "mt-2.5 grid grid-cols-2 gap-3",
                products > 2 && "@lg/store:grid-cols-4",
              )}
            >
              {SAMPLE_PRODUCTS.slice(0, products).map((product) => (
                <li key={product.name} className="min-w-0">
                  <div className="flex aspect-square items-center justify-center rounded-control bg-surface-sunken">
                    <ProductArt kind={product.art} className="size-3/4" />
                  </div>
                  <p className="mt-1.5 truncate text-[11.5px] font-medium text-ink">
                    {product.name}
                  </p>
                  <p className="text-[11px] text-ink-muted tabular-nums">{product.price}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </WindowFrame>
    </Mockup>
  );
}
