import type { ProductView, VariantView } from "@storevia/editor/registry";
import { addToCartAction } from "@/app/sv/[storeId]/cart/actions";

/** The editor's AddToCart slot: a plain form posting to a server action (no client JS). */
export function AddToCart({
  product,
  variant,
}: {
  product: ProductView;
  variant: VariantView | null;
}) {
  if (!variant) return null;
  return (
    <form className="sv-add-to-cart" action={addToCartAction}>
      <input type="hidden" name="variantId" value={variant.id} />
      <input type="hidden" name="product" value={product.handle} />
      <label>
        Quantity
        <input
          className="sv-cart-qty"
          type="number"
          name="quantity"
          min={1}
          max={99}
          defaultValue={1}
          required
        />
      </label>
      <button className="sv-button" type="submit" disabled={!variant.available}>
        {variant.available ? "Add to cart" : "Sold out"}
      </button>
    </form>
  );
}
