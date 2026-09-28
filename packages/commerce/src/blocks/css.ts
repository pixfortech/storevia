// Commerce block styles: product cards and grids, the product page, variant
// choices, collection cards, listings and search. Appended to the Site
// Engine's BASE_CSS by the storefront and the builder canvas; driven by the
// theme's custom properties.
export const COMMERCE_BLOCK_CSS = `
.sv-product-grid{padding-block:var(--sv-space-xl)}
.sv-grid{list-style:none;margin:0;padding:0;display:grid;gap:var(--sv-space-lg) var(--sv-space-md);grid-template-columns:repeat(var(--sv-grid-columns,4),minmax(0,1fr))}
.sv-card{position:relative;min-width:0}
.sv-card-link{text-decoration:none;display:block}
.sv-card-media{display:block;aspect-ratio:1/1;border-radius:var(--sv-radius-md);overflow:hidden;background:var(--sv-color-surface);margin-bottom:var(--sv-space-sm)}
.sv-card-media img{width:100%;height:100%;object-fit:cover}
.sv-card-placeholder{display:block;width:100%;height:100%;aspect-ratio:1/1;background:var(--sv-color-surface)}
.sv-card-title{font-family:var(--sv-font-body);font-size:var(--sv-fontSize-base);font-weight:500;margin:0 0 var(--sv-space-xs)}
.sv-card-link:hover .sv-card-title{text-decoration:underline}
.sv-collection-card{display:block;text-decoration:none}.sv-collection-card-title{font-weight:600}.sv-collection-card:hover .sv-collection-card-title{text-decoration:underline}
.sv-price{margin:0;font-variant-numeric:tabular-nums}.sv-price-sale{color:var(--sv-color-danger);font-weight:600}.sv-price-compare{color:var(--sv-color-muted);margin-left:var(--sv-space-xs)}
.sv-badge{display:inline-block;margin:var(--sv-space-xs) 0 0;font-size:var(--sv-fontSize-xs);text-transform:uppercase;letter-spacing:.04em;color:var(--sv-color-muted)}
.sv-product{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--sv-space-2xl);padding-block:var(--sv-space-xl)}
.sv-product-main{width:100%;border-radius:var(--sv-radius-md);background:var(--sv-color-surface)}
.sv-product-thumbs{list-style:none;margin:var(--sv-space-sm) 0 0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sv-space-sm)}
.sv-product-thumbs img{border-radius:var(--sv-radius-sm);aspect-ratio:1/1;object-fit:cover}
.sv-product-vendor{color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sv-space-xs)}
.sv-product-title{font-size:var(--sv-fontSize-3xl)}
.sv-product-info .sv-price{font-size:var(--sv-fontSize-xl);margin-bottom:var(--sv-space-lg)}
.sv-product-description{margin-top:var(--sv-space-xl)}
.sv-variants{margin-bottom:var(--sv-space-lg)}.sv-variants-label{font-weight:600;margin-bottom:var(--sv-space-sm)}
.sv-variants ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:var(--sv-space-sm)}
.sv-variant{display:inline-flex;align-items:center;min-height:2.75rem;padding:0 var(--sv-space-md);border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);text-decoration:none}
.sv-variant[aria-current="true"]{border-color:var(--sv-color-primary);box-shadow:inset 0 0 0 1px var(--sv-color-primary)}
.sv-variant-unavailable{color:var(--sv-color-muted);text-decoration:line-through}
.sv-collection-header{padding-top:var(--sv-space-xl)}
.sv-search{padding-block:var(--sv-space-xl)}
.sv-search-form{display:flex;gap:var(--sv-space-sm);margin-bottom:var(--sv-space-lg);max-width:36rem}
.sv-search-form input{flex:1;min-width:0;min-height:2.75rem;padding:0 var(--sv-space-md);border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);font:inherit;background:var(--sv-color-background);color:var(--sv-color-text)}
.sv-pagination{display:flex;align-items:center;justify-content:space-between;gap:var(--sv-space-md);margin-top:var(--sv-space-xl)}
.sv-pagination a{min-height:2.75rem;display:inline-flex;align-items:center}
@media (max-width:1024px){.sv-grid{grid-template-columns:repeat(min(var(--sv-grid-columns,4),3),minmax(0,1fr))}}
@media (max-width:640px){
.sv-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.sv-product{grid-template-columns:minmax(0,1fr);gap:var(--sv-space-lg)}
.sv-product-title{font-size:var(--sv-fontSize-2xl)}
}
`
  .replace(/\n/g, "")
  .trim();
