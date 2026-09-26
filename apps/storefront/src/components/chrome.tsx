// Store chrome: skip link, preview banner, header (name, collections until
// navigation menus exist in M5, search, cart) and footer. Server components,
// no client JavaScript.
import type { StoreChrome } from "@/lib/route-data";
import type { StoreRequestContext } from "@/lib/store-header";

export const CHROME_CSS = `
.sv-skip{position:absolute;left:-9999px;top:0;z-index:10;background:var(--sv-color-primary);color:var(--sv-color-on-primary);padding:var(--sv-space-sm) var(--sv-space-md)}
.sv-skip:focus{left:var(--sv-space-sm);top:var(--sv-space-sm)}
.sv-preview{background:#fef3c7;color:#78350f;text-align:center;font-size:var(--sv-fontSize-sm);padding:var(--sv-space-xs) var(--sv-space-md)}
.sv-header{border-bottom:1px solid var(--sv-color-border);background:var(--sv-color-background)}
.sv-header-row{display:flex;align-items:center;gap:var(--sv-space-lg);min-height:4rem;flex-wrap:wrap;padding-block:var(--sv-space-sm)}
.sv-brand{font-family:var(--sv-font-heading);font-size:var(--sv-fontSize-xl);font-weight:600;text-decoration:none;margin-right:auto}
.sv-nav{display:flex;gap:var(--sv-space-md);flex-wrap:wrap;list-style:none;margin:0;padding:0}
.sv-nav a,.sv-header-links a{text-decoration:none;display:inline-flex;align-items:center;min-height:2.75rem}
.sv-nav a:hover,.sv-header-links a:hover{text-decoration:underline}
.sv-header-links{display:flex;gap:var(--sv-space-md)}
.sv-footer{border-top:1px solid var(--sv-color-border);margin-top:var(--sv-space-3xl);padding-block:var(--sv-space-xl);color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm)}
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
@media (max-width:640px){.sv-header-row{gap:var(--sv-space-sm)}.sv-cart-line{grid-template-columns:4rem minmax(0,1fr)}.sv-cart-line>:last-child{grid-column:2}}
`
  .replace(/\n/g, "")
  .trim();

export function StoreHeader({
  store,
  chrome,
  cartCount,
}: {
  store: StoreRequestContext;
  chrome: StoreChrome;
  cartCount: number;
}) {
  return (
    <>
      <a className="sv-skip" href="#main">
        Skip to content
      </a>
      {store.preview ? (
        <p className="sv-preview" role="status">
          Preview:{" "}
          {store.availability === "live"
            ? "shoppers see this store."
            : "this store isn't live yet; only you can see it."}
        </p>
      ) : null}
      <header className="sv-header">
        <div className="sv-container sv-header-row">
          <a className="sv-brand" href="/">
            {store.name}
          </a>
          {chrome.collections.length > 0 ? (
            <nav aria-label="Collections">
              <ul className="sv-nav">
                {chrome.collections.map((c) => (
                  <li key={c.handle}>
                    <a href={`/collections/${c.handle}`}>{c.title}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="sv-header-links">
            <a href="/search">Search</a>
            <a href="/cart">
              Cart{cartCount > 0 ? ` (${String(cartCount)})` : ""}
              <span className="sv-visually-hidden">
                {cartCount === 1 ? ", 1 item" : `, ${String(cartCount)} items`}
              </span>
            </a>
          </div>
        </div>
      </header>
    </>
  );
}

export function StoreFooter({ store }: { store: StoreRequestContext }) {
  return (
    <footer className="sv-footer">
      <div className="sv-container">
        <p>
          © {new Date().getFullYear()} {store.name}
        </p>
      </div>
    </footer>
  );
}
