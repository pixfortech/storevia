// The merchant-branded public shell (ADR-0029): document, theme tokens,
// base document styles, skip link, preview banner, header with the site's
// name, footer. Server components only, no client JavaScript. The composing
// app fills the header's navigation and actions and the page body; the
// Site Engine knows nothing about what they contain.
import type { ReactNode } from "react";
import type { StoreRequestContext } from "./context";
import { jsonLdJson } from "./seo";
import { DEFAULT_THEME, themeCss, type ThemeTokens } from "./theme";

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
.sv-footer{border-top:1px solid var(--sv-color-border);margin-top:var(--sv-space-3xl);padding-block:var(--sv-space-xl);color:var(--sv-color-muted);font-size:var(--sv-fontSize-sm)}
@media (max-width:640px){.sv-header-row{gap:var(--sv-space-sm)}}
`
  .replace(/\n/g, "")
  .trim();

type ShellContext = Pick<StoreRequestContext, "name" | "locale" | "preview" | "availability">;

export function SiteShell({
  site,
  nonce,
  css = "",
  tokens = DEFAULT_THEME,
  nav,
  actions,
  previewNote,
  children,
}: {
  site: ShellContext;
  nonce: string | undefined;
  /** The composition's stylesheet, emitted after the theme and base rules. */
  css?: string;
  tokens?: ThemeTokens;
  /** Header navigation (e.g. the composition's menus). */
  nav?: ReactNode;
  /** Header actions (e.g. search and cart links). */
  actions?: ReactNode;
  /** The composition's wording for the preview banner. */
  previewNote?: string;
  children: ReactNode;
}) {
  return (
    <html lang={site.locale}>
      <head>
        <style nonce={nonce}>{`${themeCss(tokens)}${SITE_BASE_CSS}${css}`}</style>
      </head>
      <body>
        <a className="sv-skip" href="#main">
          Skip to content
        </a>
        {site.preview ? (
          <p className="sv-preview" role="status">
            Preview:{" "}
            {previewNote ??
              (site.availability === "live"
                ? "visitors see this site."
                : "this site isn't live yet; only you can see it.")}
          </p>
        ) : null}
        <header className="sv-header">
          <div className="sv-container sv-header-row">
            <a className="sv-brand" href="/">
              {site.name}
            </a>
            {nav}
            {actions}
          </div>
        </header>
        {children}
        <footer className="sv-footer">
          <div className="sv-container">
            <p>
              © {new Date().getFullYear()} {site.name}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

/** JSON-LD, escaped so no value can close the script element. */
export function JsonLd({ data, nonce }: { data: unknown; nonce: string | undefined }) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: jsonLdJson(data) }}
    />
  );
}
