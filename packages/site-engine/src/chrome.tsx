// The theme's chrome (ADR-0030, 08-themes.md §10.5): the announcement line,
// the header in the theme's variant (inline, or the name centred above the
// menu), the page body and the footer in its variant. SiteShell wraps it in
// the public document; the dashboard's theme previews render the same
// component inside an isolated frame (§10.7), so a preview is the renderer's
// output, never a hand-made imitation. Pure and client-safe: no state, no
// effects, no server imports.
import type { ReactNode } from "react";
import type { ThemeDefinition } from "./theme-core";

/** The parts of a theme package the chrome renders: its key, chrome variant and stylesheet. */
export type ShellTheme = Pick<ThemeDefinition, "key" | "chrome" | "stylesheet">;

/** A logo image for the header brand (the site's name is its alt text). */
export interface ChromeLogo {
  readonly url: string;
  readonly srcSet?: string;
  readonly width: number | null;
  readonly height: number | null;
}

export function SiteChrome({
  name,
  theme,
  nav,
  footerNav,
  actions,
  announcement,
  brandHref = "/",
  logo,
  footer,
  children,
}: {
  /** The site's name (the brand in the header and footer). */
  name: string;
  theme: ShellTheme;
  /** Header navigation (e.g. the site's main menu). */
  nav?: ReactNode;
  /** Footer navigation (e.g. the site's footer menu). */
  footerNav?: ReactNode;
  /** Header actions (e.g. search and cart links). */
  actions?: ReactNode;
  /** A short line above the header (e.g. a delivery offer). */
  announcement?: ReactNode;
  brandHref?: string;
  /** The site's logo; the name is shown when there is none. */
  logo?: ChromeLogo | null | undefined;
  /** The footer's content; the footer menu and a copyright line when omitted. */
  footer?: ReactNode | undefined;
  children: ReactNode;
}) {
  const { chrome } = theme;
  const brand = (
    <a className={logo ? "sv-brand sv-brand-logo" : "sv-brand"} href={brandHref}>
      {logo ? (
        <img
          src={logo.url}
          {...(logo.srcSet ? { srcSet: logo.srcSet, sizes: "12rem" } : {})}
          {...(logo.width && logo.height ? { width: logo.width, height: logo.height } : {})}
          alt={name}
        />
      ) : (
        name
      )}
    </a>
  );
  return (
    <>
      {announcement ? <p className="sv-announcement">{announcement}</p> : null}
      <header
        className={`sv-header${chrome.navigation === "uppercase" ? " sv-nav-uppercase" : ""}`}
        data-sv-header={chrome.header}
      >
        {chrome.header === "centred" ? (
          <>
            <div className="sv-container sv-header-top">
              {brand}
              <div className="sv-header-end">{actions}</div>
            </div>
            {nav ? <div className="sv-container sv-header-nav">{nav}</div> : null}
          </>
        ) : (
          <div className="sv-container sv-header-row">
            {brand}
            {nav}
            {actions}
          </div>
        )}
      </header>
      {children}
      <footer className={`sv-footer${chrome.footer === "centred" ? " sv-footer-centred" : ""}`}>
        {footer ?? (
          <div className="sv-container sv-footer-row">
            {footerNav}
            <p>
              © {new Date().getFullYear()} {name}
            </p>
          </div>
        )}
      </footer>
    </>
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
