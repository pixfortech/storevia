// Storevia commerce chrome for the Site Engine's shell (ADR-0029, ADR-0030):
// search and cart links, and the cart and add-to-cart styles. Menus are the
// Site Engine's (SiteMenu). Server components, no client JavaScript.

export const COMMERCE_CSS = `
.sv-header-links a{text-decoration:none;display:inline-flex;align-items:center;min-height:2.75rem}
.sv-header-links a:hover{text-decoration:underline}
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
.sv-checkout{padding-block:var(--sv-space-xl)}
.sv-checkout-grid{display:grid;gap:var(--sv-space-xl);grid-template-columns:minmax(0,1fr)}
.sv-checkout-step{border-bottom:1px solid var(--sv-color-border);padding-block:var(--sv-space-lg)}
.sv-checkout-step h2{font-size:var(--sv-fontSize-lg);margin:0 0 var(--sv-space-md)}
.sv-checkout-step form{display:grid;gap:var(--sv-space-md)}
.sv-checkout-actions{display:flex;flex-wrap:wrap;gap:var(--sv-space-sm);align-items:center}
.sv-field-grid{display:grid;gap:var(--sv-space-md);grid-template-columns:repeat(2,minmax(0,1fr))}
.sv-field{display:grid;gap:var(--sv-space-xs);min-width:0;align-content:start}
.sv-field-wide{grid-column:1/-1}
.sv-field label{font-weight:600;font-size:var(--sv-fontSize-sm)}
.sv-field input,.sv-field select{min-height:2.75rem;padding:0 var(--sv-space-sm);border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);font:inherit;width:100%;background:var(--sv-color-background);color:inherit}
.sv-field input[aria-invalid=true],.sv-field select[aria-invalid=true]{border-color:currentColor;border-width:2px}
.sv-field-notes{display:grid;gap:var(--sv-space-xs)}
.sv-field-hint{margin:0;color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm)}
.sv-field-error{font-weight:600;font-size:var(--sv-fontSize-sm);margin:0}
.sv-field-error::before{content:"Error: "}
@supports (grid-template-rows:subgrid){.sv-field-grid>.sv-field,.sv-inline-form>.sv-field{grid-row:span 3;grid-template-rows:subgrid;row-gap:var(--sv-space-xs)}}
.sv-check{display:flex;gap:var(--sv-space-sm);align-items:center;min-height:2.75rem}
.sv-check input{width:1.25rem;height:1.25rem;margin:0;flex:none}
.sv-checkout .sv-billing{display:grid;gap:var(--sv-space-md)}
.sv-billing legend{font-weight:700;padding:0;margin-bottom:var(--sv-space-sm)}
.sv-checkout form:has(#billingSameAsShipping:checked) .sv-billing{display:none}
.sv-option{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:var(--sv-space-sm);align-items:center;min-height:2.75rem;padding:var(--sv-space-sm) var(--sv-space-md);border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);margin-bottom:var(--sv-space-sm)}
.sv-checkout fieldset{border:0;margin:0;padding:0}
.sv-checkout-step .sv-inline-form{grid-template-columns:minmax(0,1fr) auto;column-gap:var(--sv-space-sm);row-gap:0;align-items:center}
.sv-inline-form>.sv-field{grid-column:1}
.sv-inline-form>.sv-field+button{grid-column:2;grid-row:2}
.sv-problems{margin:0 0 var(--sv-space-md);padding-left:1.25rem}
.sv-checkout-summary{border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);padding:var(--sv-space-lg);background:var(--sv-color-background);align-self:start}
.sv-checkout-summary h2{font-size:var(--sv-fontSize-lg);margin:0 0 var(--sv-space-md)}
.sv-summary-lines,.sv-summary-unavailable{list-style:none;margin:0 0 var(--sv-space-md);padding:0}
.sv-summary-lines li{display:flex;justify-content:space-between;gap:var(--sv-space-md);padding-block:var(--sv-space-xs)}
.sv-summary-totals{margin:0;display:grid;gap:var(--sv-space-xs);border-top:1px solid var(--sv-color-border);padding-top:var(--sv-space-md)}
.sv-summary-totals div{display:flex;justify-content:space-between;gap:var(--sv-space-md)}
.sv-summary-totals dd{margin:0;text-align:right}
.sv-summary-total{font-weight:700;font-size:var(--sv-fontSize-lg);border-top:1px solid var(--sv-color-border);padding-top:var(--sv-space-sm)}
.sv-order-number{font-size:var(--sv-fontSize-lg)}
.sv-test-badge{display:inline-block;border:2px dashed currentColor;border-radius:var(--sv-radius-sm);padding:var(--sv-space-xs) var(--sv-space-sm);font-weight:700}
.sv-button[disabled]{opacity:.55;cursor:not-allowed}
@media (min-width:900px){.sv-checkout-grid{grid-template-columns:minmax(0,1fr) 22rem}}
@media (max-width:480px){.sv-field-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){.sv-cart-line{grid-template-columns:4rem minmax(0,1fr)}.sv-cart-line>:last-child{grid-column:2}}
`
  .replace(/\n/g, "")
  .trim();

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
