// Storevia commerce chrome for the Site Engine's shell (ADR-0029): collection
// navigation (until menus exist in M5), search and cart links, and the cart
// and add-to-cart styles. Server components, no client JavaScript.
import type { StoreChrome } from "@/lib/route-data";

export const COMMERCE_CSS = `
.sv-nav{display:flex;gap:var(--sv-space-md);flex-wrap:wrap;list-style:none;margin:0;padding:0}
.sv-nav a,.sv-header-links a{text-decoration:none;display:inline-flex;align-items:center;min-height:2.75rem}
.sv-nav a:hover,.sv-header-links a:hover{text-decoration:underline}
.sv-header-links{display:flex;gap:var(--sv-space-md)}
.sv-cart{padding-block:var(--sv-space-xl)}
.sv-cart-lines{list-style:none;margin:0 0 var(--sv-space-xl);padding:0;border-top:1px solid var(--sv-color-border)}
.sv-cart-line{display:grid;grid-template-columns:5rem minmax(0,1fr) auto;gap:var(--sv-space-md);align-items:center;padding-block:var(--sv-space-md);border-bottom:1px solid var(--sv-color-border)}
.sv-cart-line img,.sv-cart-thumb{width:5rem;height:5rem;object-fit:cover;border-radius:var(--sv-radius-sm);background:var(--sv-color-surface)}
.sv-cart-line form{display:flex;gap:var(--sv-space-sm);align-items:center;flex-wrap:wrap}
.sv-cart-qty{width:4.5rem;min-height:2.75rem;padding:0 var(--sv-space-sm);border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);font:inherit}
.sv-link-button{background:none;border:0;padding:0;min-height:2.75rem;color:var(--sv-color-muted);text-decoration:underline;cursor:pointer;font:inherit}
.sv-cart-summary{display:flex;justify-content:space-between;align-items:baseline;gap:var(--sv-space-md);font-size:var(--sv-fontSize-lg)}
.sv-notice{border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);padding:var(--sv-space-sm) var(--sv-space-md);margin-bottom:var(--sv-space-lg);background:var(--sv-color-surface)}
.sv-add-to-cart{display:flex;gap:var(--sv-space-sm);align-items:flex-end;flex-wrap:wrap;margin-bottom:var(--sv-space-lg)}
.sv-add-to-cart label{display:grid;gap:var(--sv-space-xs);font-size:var(--sv-fontSize-sm)}
@media (max-width:640px){.sv-cart-line{grid-template-columns:4rem minmax(0,1fr)}.sv-cart-line>:last-child{grid-column:2}}
`
  .replace(/\n/g, "")
  .trim();

export function StoreNav({ chrome }: { chrome: StoreChrome }) {
  if (chrome.collections.length === 0) return null;
  return (
    <nav aria-label="Collections">
      <ul className="sv-nav">
        {chrome.collections.map((c) => (
          <li key={c.handle}>
            <a href={`/collections/${c.handle}`}>{c.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function StoreActions({ cartCount }: { cartCount: number }) {
  return (
    <div className="sv-header-links">
      <a href="/search">Search</a>
      <a href="/cart">
        Cart{cartCount > 0 ? ` (${String(cartCount)})` : ""}
        <span className="sv-visually-hidden">
          {cartCount === 1 ? ", 1 item" : `, ${String(cartCount)} items`}
        </span>
      </a>
    </div>
  );
}
