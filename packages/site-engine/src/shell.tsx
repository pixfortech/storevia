// The merchant-branded public shell (ADR-0029, ADR-0030): document, theme
// tokens, base document styles, skip link, preview banner, header with the
// site's name and menu, footer with its menu. Server components only, no
// client JavaScript. The composing app fills the header's actions and the
// page body; the Site Engine knows nothing about what they contain.
import type { ReactNode } from "react";
import type { StoreRequestContext } from "./context";
import { jsonLdJson } from "./seo";
import { SITE_BASE_CSS } from "./base-css";
import { DEFAULT_THEME, themeCss, type ThemeTokens } from "./theme";

export { SITE_BASE_CSS };

type ShellContext = Pick<StoreRequestContext, "name" | "locale" | "preview" | "availability">;

export function SiteShell({
  site,
  nonce,
  css = "",
  tokens = DEFAULT_THEME,
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
          <div className="sv-container sv-footer-row">
            {footerNav}
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

export interface MenuLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

/** A menu of resolved links (the composition drops links that no longer resolve). */
export function SiteMenu({
  label,
  links,
  currentPath,
}: {
  label: string;
  links: readonly MenuLink[];
  currentPath?: string | undefined;
}) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={label}>
      <ul className="sv-menu">
        {links.map((link) => (
          <li key={link.key}>
            <a href={link.href} aria-current={link.href === currentPath ? "page" : undefined}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
