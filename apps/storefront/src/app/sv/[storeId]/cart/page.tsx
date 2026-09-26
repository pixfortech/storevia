import { readCart } from "@storevia/commerce/storefront";
import { formatPrice, Image } from "@storevia/editor/render";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cartStore, cartToken } from "@/lib/cart";
import { isBrowsable, requestStore } from "@/lib/request-store";
import { removeCartLineAction, updateCartLineAction } from "./actions";

// The cart (06-storefront.md §3: dynamic, private, no-store). Prices are
// computed on the server from current variant prices every time.

export const metadata: Metadata = { title: "Cart", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  "sold-out": "Sorry, that item just sold out.",
  unavailable: "That item is no longer available.",
  busy: "Too many changes at once. Please wait a moment and try again.",
  full: "Your cart is full. Remove something before adding more.",
};

interface Props {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CartPage({ params, searchParams }: Props) {
  const [{ storeId }, search] = await Promise.all([params, searchParams]);
  const store = await requestStore(storeId);
  if (!isBrowsable(store)) redirect("/");
  const cart = await readCart(cartStore(store), await cartToken());
  const error = typeof search["error"] === "string" ? ERRORS[search["error"]] : undefined;
  const price = (p: { amount: string; currency: string }) => formatPrice(p, store.locale);
  return (
    <main id="main" className="sv-container sv-cart">
      <h1>Your cart</h1>
      {error ? (
        <p className="sv-notice" role="alert">
          {error}
        </p>
      ) : null}
      {cart.lines.length === 0 ? (
        <>
          <p className="sv-empty">Your cart is empty.</p>
          <a className="sv-button" href="/search">
            Browse products
          </a>
        </>
      ) : (
        <>
          <ul className="sv-cart-lines" aria-label="Items in your cart">
            {cart.lines.map((line) => (
              <li className="sv-cart-line" key={line.variantId}>
                {line.image ? (
                  <Image image={line.image} sizes="5rem" />
                ) : (
                  <div className="sv-cart-thumb" aria-hidden="true" />
                )}
                <div>
                  <a href={`/products/${line.productHandle}`}>{line.productTitle}</a>
                  {line.variantTitle !== "Default" ? (
                    <p className="sv-muted">{line.variantTitle}</p>
                  ) : null}
                  <p className="sv-muted">
                    {price(line.unitPrice)} each
                    {line.available ? null : " · no longer available"}
                  </p>
                </div>
                <div>
                  <form action={updateCartLineAction}>
                    <input type="hidden" name="variantId" value={line.variantId} />
                    <label className="sv-visually-hidden" htmlFor={`qty-${line.variantId}`}>
                      Quantity of {line.productTitle}
                    </label>
                    <input
                      id={`qty-${line.variantId}`}
                      className="sv-cart-qty"
                      type="number"
                      name="quantity"
                      min={0}
                      max={99}
                      defaultValue={line.quantity}
                    />
                    <button className="sv-button sv-button-secondary" type="submit">
                      Update
                    </button>
                  </form>
                  <form action={removeCartLineAction}>
                    <input type="hidden" name="variantId" value={line.variantId} />
                    <button className="sv-link-button" type="submit">
                      Remove<span className="sv-visually-hidden"> {line.productTitle}</span>
                    </button>
                  </form>
                  <p>
                    <strong>{price(line.lineTotal)}</strong>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="sv-cart-summary">
            <span>Subtotal</span>
            <strong>{price(cart.subtotal)}</strong>
          </div>
          {cart.hasUnavailableLines ? (
            <p className="sv-muted">
              Items that are no longer available aren't included in the subtotal.
            </p>
          ) : null}
          <p className="sv-muted">
            Taxes and shipping are calculated at checkout. Checkout isn&apos;t available yet.
          </p>
        </>
      )}
    </main>
  );
}
