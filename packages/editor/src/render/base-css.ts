// The base stylesheet for the Site Engine's components: layout primitives,
// buttons, the hero and the section blocks. Everything is driven by the
// theme's custom properties, so a theme change restyles it. Emitted once per
// page in a nonce'd <style> after the Site Engine's document rules
// (SITE_BASE_CSS); shared by the public site and the builder canvas. A
// composition appends its own (Storevia commerce: product cards, product
// page, listings).
//
// Contrast: the theme engine derives every text token to read (4.5:1) on
// both the page background and the surface. A brand-colour section
// (.sv-bg-accent) re-points the muted, status and accent tokens at the
// on-primary colour, so every element styled through tokens stays readable
// there without per-element overrides.
export const BASE_CSS = `
.sv-section{padding-block:var(--sv-space-section)}
.sv-container-narrow{max-width:var(--sv-container-narrow)}
.sv-columns{display:grid;grid-template-columns:repeat(var(--sv-columns,2),minmax(0,1fr));gap:var(--sv-space-lg)}
.sv-spacer{height:var(--sv-spacer,var(--sv-space-xl))}
.sv-divider{border:0;border-top:1px solid var(--sv-color-border);margin-block:var(--sv-space-xl)}
.sv-muted{color:var(--sv-color-muted)}
.sv-empty{color:var(--sv-color-muted);padding-block:var(--sv-space-xl)}
.sv-figure{margin:0}.sv-figure img{width:100%;border-radius:var(--sv-radius-md)}.sv-figure figcaption{color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm);margin-top:var(--sv-space-sm)}
.sv-prose>:last-child{margin-bottom:0}.sv-prose a{color:inherit;text-decoration-color:var(--sv-color-accent);text-decoration-thickness:2px;text-underline-offset:2px}.sv-prose blockquote{margin:0 0 var(--sv-space-md);padding-left:var(--sv-space-md);border-left:3px solid var(--sv-color-border)}.sv-prose ul,.sv-prose ol{margin:0 0 var(--sv-space-md);padding-left:1.4em}
.sv-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:0 var(--sv-space-lg);border-radius:var(--sv-radius-button);background:var(--sv-button-background);color:var(--sv-button-text);border:2px solid var(--sv-button-border);font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.sv-button:hover{opacity:.9}.sv-button[disabled]{opacity:.5;cursor:not-allowed}
.sv-button-secondary{background:transparent;color:inherit;border-color:currentColor}
.sv-actions{display:flex;flex-wrap:wrap;gap:var(--sv-space-sm);margin-top:var(--sv-space-lg)}
.sv-align-center{text-align:center}.sv-align-center .sv-actions{justify-content:center}.sv-align-center .sv-block-intro{margin-inline:auto}
.sv-hero{position:relative;padding-block:var(--sv-space-3xl);background:var(--sv-color-surface);overflow:hidden}
.sv-hero-compact{padding-block:var(--sv-space-2xl)}.sv-hero-tall{padding-block:calc(var(--sv-space-3xl) * 2)}
.sv-hero-center{text-align:center}.sv-hero-center .sv-hero-sub{margin-inline:auto}.sv-hero-center .sv-actions{justify-content:center}
.sv-hero-heading{font-size:var(--sv-fontSize-4xl);margin-bottom:var(--sv-space-md)}
.sv-hero-sub{max-width:40rem;color:var(--sv-color-muted);font-size:var(--sv-fontSize-lg);margin-bottom:0}
.sv-hero-image{color:#fff;background:#1c1917}.sv-hero-image .sv-hero-sub{color:inherit}.sv-hero-image .sv-button-secondary{color:#fff}
.sv-hero-backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.5)}
.sv-hero-body{position:relative}
.sv-block{padding-block:var(--sv-space-section)}
.sv-pad-compact{padding-block:calc(var(--sv-space-section) * .5)}.sv-pad-spacious{padding-block:calc(var(--sv-space-section) * 1.5)}
.sv-bg-surface{background:var(--sv-color-surface)}
.sv-bg-accent{background:var(--sv-color-primary);color:var(--sv-color-on-primary);--sv-color-muted:var(--sv-color-on-primary);--sv-color-secondary:var(--sv-color-on-primary);--sv-color-success:var(--sv-color-on-primary);--sv-color-warning:var(--sv-color-on-primary);--sv-color-danger:var(--sv-color-on-primary);--sv-color-accent:var(--sv-color-on-primary)}.sv-bg-accent .sv-button{background:var(--sv-color-on-primary);color:var(--sv-color-primary);border-color:var(--sv-color-on-primary)}.sv-bg-accent .sv-button-secondary{background:transparent;color:inherit;border-color:currentColor}
.sv-block-heading{margin-bottom:var(--sv-space-lg)}.sv-block-heading-small{font-size:var(--sv-fontSize-lg);text-align:center}
.sv-block-intro{max-width:44rem;color:var(--sv-color-muted);font-size:var(--sv-fontSize-lg);margin-bottom:var(--sv-space-xl)}
.sv-block-grid{list-style:none;margin:0;padding:0;display:grid;gap:var(--sv-space-lg);grid-template-columns:repeat(var(--sv-block-columns,3),minmax(0,1fr))}
.sv-aspect-square img{aspect-ratio:1/1;object-fit:cover}.sv-aspect-landscape img{aspect-ratio:4/3;object-fit:cover}.sv-aspect-portrait img{aspect-ratio:3/4;object-fit:cover}
.sv-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--sv-space-2xl);align-items:center}
.sv-split-reverse .sv-split-media{order:2}
.sv-split-media img{width:100%;border-radius:var(--sv-radius-md)}
.sv-feature img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--sv-radius-md);margin-bottom:var(--sv-space-md)}.sv-feature h3{margin-bottom:var(--sv-space-sm)}.sv-feature p{margin:0;color:var(--sv-color-muted)}
.sv-faq details{border-bottom:1px solid var(--sv-color-border);padding-block:var(--sv-space-md)}.sv-faq details:first-child{border-top:1px solid var(--sv-color-border)}
.sv-faq summary{cursor:pointer;font-weight:600;min-height:2.75rem;display:flex;align-items:center}.sv-faq details p{margin:var(--sv-space-sm) 0 0}
.sv-testimonial{margin:0;height:100%;padding:var(--sv-space-lg);border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);display:flex;flex-direction:column;gap:var(--sv-space-md)}
.sv-testimonial blockquote{margin:0;font-size:var(--sv-fontSize-lg)}.sv-testimonial blockquote p{margin:0}
.sv-testimonial figcaption{display:grid}.sv-testimonial-name{font-weight:600}.sv-testimonial-detail{color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm)}
.sv-logos{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:var(--sv-space-xl)}
.sv-logos img{max-height:3rem;width:auto;max-width:10rem;object-fit:contain}.sv-logos a{display:inline-flex;min-height:2.75rem;align-items:center}
.sv-contact{margin:0;display:grid;gap:var(--sv-space-md)}.sv-contact dt{font-weight:600}.sv-contact dd{margin:0}.sv-line{display:block}
.sv-input{flex:1;min-width:0;min-height:2.75rem;padding:0 var(--sv-space-md);border:1px solid var(--sv-color-border);border-radius:var(--sv-radius-md);font:inherit;background:var(--sv-color-background);color:var(--sv-color-text)}
@media (max-width:1024px){.sv-block-grid{grid-template-columns:repeat(min(var(--sv-block-columns,3),3),minmax(0,1fr))}}
@media (max-width:768px){.sv-split{grid-template-columns:minmax(0,1fr);gap:var(--sv-space-lg)}.sv-split-reverse .sv-split-media{order:0}}
@media (max-width:640px){
.sv-section,.sv-block{padding-block:calc(var(--sv-space-section) * .6)}
.sv-pad-compact{padding-block:calc(var(--sv-space-section) * .4)}
.sv-columns-stack{grid-template-columns:minmax(0,1fr)}
.sv-block-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.sv-features,.sv-testimonials{grid-template-columns:minmax(0,1fr)}
.sv-hero{padding-block:var(--sv-space-2xl)}.sv-hero-tall{padding-block:var(--sv-space-3xl)}
.sv-hero-heading{font-size:var(--sv-fontSize-3xl)}
h1{font-size:var(--sv-fontSize-2xl)}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`
  .replace(/\n/g, "")
  .trim();
