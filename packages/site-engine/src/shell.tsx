// The merchant-branded public shell (ADR-0029, ADR-0030): document, theme
// tokens, base document styles, skip link, preview banner, then the theme's
// chrome (./chrome: header with the site's name and menu in the theme's
// variant, footer with its menu). Server components only, no
// client JavaScript. The composing app fills the header's actions and the
// page body; the Site Engine knows nothing about what they contain.
import type { ReactNode } from "react";
import type { StoreRequestContext } from "./context";
import { jsonLdJson } from "./seo";
import { SITE_BASE_CSS } from "./base-css";
import { SiteChrome, type ShellTheme } from "./chrome";
import { DEFAULT_THEME, DEFAULT_THEME_DEFINITION, themeCss, type ThemeTokens } from "./theme";

export { SITE_BASE_CSS };
export { SiteChrome, SiteMenu, type MenuLink, type ShellTheme } from "./chrome";

type ShellContext = Pick<StoreRequestContext, "name" | "locale" | "preview" | "availability">;

export function SiteShell({
  site,
  nonce,
  css = "",
  tokens = DEFAULT_THEME,
  theme = DEFAULT_THEME_DEFINITION,
  nav,
  footerNav,
  actions,
  previewNote,
  children,
}: {
  site: ShellContext;
  nonce: string | undefined;
  /** The composition's stylesheet, emitted after the theme and base rules. */
  css?: string;
  tokens?: ThemeTokens;
  /** The theme package: chrome variant and first-party stylesheet (the default theme when omitted). */
  theme?: ShellTheme;
  /** Header navigation (e.g. the site's main menu). */
  nav?: ReactNode;
  /** Footer navigation (e.g. the site's footer menu). */
  footerNav?: ReactNode;
  /** Header actions (e.g. search and cart links). */
  actions?: ReactNode;
  /** The composition's wording for the preview banner. */
  previewNote?: string;
  children: ReactNode;
}) {
  return (
    <html lang={site.locale} data-sv-theme={theme.key}>
      <head>
        <style
          nonce={nonce}
        >{`${themeCss(tokens)}${SITE_BASE_CSS}${css}${theme.stylesheet}`}</style>
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
        <SiteChrome
          name={site.name}
          theme={theme}
          nav={nav}
          footerNav={footerNav}
          actions={actions}
        >
          {children}
        </SiteChrome>
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
