import { CART_LIMITS, readCart, type CartLineView } from "@storevia/commerce/storefront";
import { formatPrice } from "@storevia/commerce/blocks";
import { Image } from "@storevia/editor/render";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cartStore, cartToken } from "@/lib/cart";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import { startCheckoutAction } from "../checkout/actions";
import { removeCartLineAction, updateCartLineAction } from "./actions";

// The cart (06-storefront.md §3: dynamic, private, no-store). Prices are
// computed on the server from current variant prices every time.

export const metadata: Metadata = { title: "Cart", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  "sold-out": "Sorry, that item is sold out.",
  limit: `You can have at most ${String(CART_LIMITS.maxQuantity)} of an item in your cart.`,
  quantity: "Enter a whole number for the quantity.",
  unavailable: "That item is no longer available.",
  busy: "Too many changes at once. Please wait a moment and try again.",
  full: "Your cart is full. Remove something before adding more.",
  fix: "Some items can't be bought as they are. Change or remove them to check out.",
  checkout: "We couldn't start checkout. Your cart may be empty or have changed; please try again.",
};

/** "Only 2 are available." — the count comes from the redirect, bounded to 0–100. */
function stockMessage(search: Record<string, string | string[] | undefined>): string | undefined {
  const n = typeof search["n"] === "string" ? Number(search["n"]) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 100) return undefined;
  return `Only ${String(n)} ${n === 1 ? "is" : "are"} available. Your quantity wasn't changed.`;
}

const onlyAvailable = (n: number) => `Only ${String(n)} available`;

/** What a line's stock state tells the shopper (null when there's nothing to say). */
function lineNote(line: CartLineView): { text: string; problem: boolean } | null {
  switch (line.stock) {
    case "limited":
      return { text: onlyAvailable(line.maxQuantity), problem: false };
    case "insufficient":
      return {
        text: `${onlyAvailable(line.maxQuantity)}. Lower the quantity to ${String(line.maxQuantity)} or remove it.`,
        problem: true,
      };
    case "sold_out":
      return { text: "Sold out. Remove it to check out.", problem: true };
    default:
      return null;
  }
}

interface Props {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CartPage({ params, searchParams }: Props) {
  const [{ storeId }, search] = await Promise.all([params, searchParams]);
  const store = await requestStore(storeId);
  if (!isBrowsable(store)) redirect("/");
  const cart = await readCart(cartStore(store), await cartToken());
  const code = typeof search["error"] === "string" ? search["error"] : null;
  const error = code === "stock" ? stockMessage(search) : code ? ERRORS[code] : undefined;
  // A refused quantity change is also shown on its own line.
  const errorLine = typeof search["line"] === "string" ? search["line"] : null;
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
                  <p className="sv-muted">{price(line.unitPrice)} each</p>
                  {(() => {
                    const note = lineNote(line);
                    if (!note) return null;
                    return (
                      <p
                        id={`stock-${line.variantId}`}
                        className={note.problem ? "sv-line-problem" : "sv-muted"}
                      >
                        {note.text}
                      </p>
                    );
                  })()}
                  {errorLine === line.variantId && error ? (
                    <p className="sv-field-error" id={`qty-error-${line.variantId}`}>
                      {error}
                    </p>
                  ) : null}
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
                      max={Math.max(line.maxQuantity, line.quantity)}
                      defaultValue={line.quantity}
                      aria-invalid={
                        !line.available || errorLine === line.variantId ? true : undefined
                      }
                      aria-describedby={
                        [
                          lineNote(line) ? `stock-${line.variantId}` : null,
                          errorLine === line.variantId && error
                            ? `qty-error-${line.variantId}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
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
                    {line.available ? (
                      <strong>{price(line.lineTotal)}</strong>
                    ) : (
                      <span className="sv-muted">Not included</span>
                    )}
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
            <p className="sv-notice" role="status" id="cart-attention">
              Some items can&apos;t be bought as they are and aren&apos;t included in the subtotal.
              Change or remove them to check out.
            </p>
          ) : null}
          <p className="sv-muted">Taxes and shipping are calculated at checkout.</p>
          <form action={startCheckoutAction}>
            <button
              className="sv-button"
              type="submit"
              disabled={cart.hasUnavailableLines}
              aria-describedby={cart.hasUnavailableLines ? "cart-attention" : undefined}
            >
              Check out
            </button>
          </form>
        </>
      )}
    </main>
  );
}
