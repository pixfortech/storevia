// The Site Engine's document-level stylesheet, driven by the theme's custom
// properties. Pure and client-safe (the builder canvas uses it too).
/** Document-level rules every public page needs, driven by the theme's custom properties. */
export const SITE_BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--sv-color-background);color:var(--sv-color-text);font-family:var(--sv-font-body);font-size:var(--sv-fontSize-base);line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
:focus-visible{outline:2px solid var(--sv-color-accent);outline-offset:2px}
h1,h2,h3,h4{font-family:var(--sv-font-heading);line-height:1.2;margin:0 0 var(--sv-space-md);font-weight:600}
h1{font-size:var(--sv-fontSize-3xl)}h2{font-size:var(--sv-fontSize-2xl)}h3{font-size:var(--sv-fontSize-lg)}
p{margin:0 0 var(--sv-space-md)}
.sv-visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.sv-container{width:100%;max-width:var(--sv-container-width);margin-inline:auto;padding-inline:var(--sv-space-md)}
.sv-skip{position:absolute;left:-9999px;top:0;z-index:10;background:var(--sv-color-primary);color:var(--sv-color-on-primary);padding:var(--sv-space-sm) var(--sv-space-md)}
.sv-skip:focus{left:var(--sv-space-sm);top:var(--sv-space-sm)}
.sv-preview{background:#fef3c7;color:#78350f;text-align:center;font-size:var(--sv-fontSize-sm);padding:var(--sv-space-xs) var(--sv-space-md)}
.sv-header{border-bottom:1px solid var(--sv-color-border);background:var(--sv-color-background)}
.sv-header-row{display:flex;align-items:center;gap:var(--sv-space-lg);min-height:4rem;flex-wrap:wrap;padding-block:var(--sv-space-sm)}
.sv-brand{font-family:var(--sv-font-heading);font-size:var(--sv-fontSize-xl);font-weight:600;text-decoration:none;margin-right:auto}
.sv-footer{border-top:1px solid var(--sv-color-border);padding-block:var(--sv-space-xl);color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm)}
.sv-footer-row{display:flex;flex-wrap:wrap;gap:var(--sv-space-md) var(--sv-space-xl);align-items:center;justify-content:space-between}.sv-footer p{margin:0}
.sv-menu{display:flex;gap:var(--sv-space-xs) var(--sv-space-md);flex-wrap:wrap;list-style:none;margin:0;padding:0}
.sv-menu a{text-decoration:none;display:inline-flex;align-items:center;min-height:2.75rem}.sv-menu a:hover,.sv-menu a[aria-current="page"]{text-decoration:underline;text-underline-offset:4px}
.sv-header-top{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:var(--sv-space-md);min-height:4.5rem;padding-block:var(--sv-space-sm)}
.sv-header-top .sv-brand{grid-column:2;margin:0;text-align:center}.sv-header-end{grid-column:3;justify-self:end;display:flex;align-items:center}
.sv-header-nav{display:flex;justify-content:center}
.sv-nav-uppercase .sv-menu a{text-transform:uppercase;letter-spacing:.12em;font-size:var(--sv-fontSize-sm)}
.sv-footer-centred .sv-footer-row{flex-direction:column;justify-content:center;text-align:center}
@media (max-width:640px){.sv-header-row{gap:var(--sv-space-sm)}.sv-header-row nav{order:3;width:100%}.sv-header-top{grid-template-columns:minmax(0,1fr) auto}.sv-header-top .sv-brand{grid-column:1;text-align:left}.sv-header-end{grid-column:2}.sv-header-nav{justify-content:flex-start}}
`
  .replace(/\n/g, "")
  .trim();
