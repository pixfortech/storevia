// Staff navigation (presentation only). Pages still enforce their own
// permissions; hiding a link is a courtesy, not access control.

export type AdminNavId = "organisations" | "jobs" | "account";

export interface AdminNavItem {
  readonly id: AdminNavId;
  readonly href: string;
  readonly label: string;
}

export function adminNavItems(access: { readonly canViewJobs: boolean }): AdminNavItem[] {
  return [
    { id: "organisations", href: "/organisations", label: "Organisations" },
    ...(access.canViewJobs ? [{ id: "jobs" as const, href: "/jobs", label: "Jobs" }] : []),
    { id: "account", href: "/account", label: "Account" },
  ];
}

/** The item is the current section: its page or anything below it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// An organisation page with a well-formed public ID (the TypeID suffix rule
// in @storevia/types, restated here because that package's index pulls in
// node:crypto, which can't ship to the browser).
const ORGANISATION_PAGE = /^\/organisations\/org_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

/**
 * Where the step-up form sends staff back to. Only an organisation page is
 * accepted, so the parameter can never become an open redirect or carry
 * arbitrary paths.
 */
export function stepUpReturnPath(value: string | null | undefined): string | null {
  return value && ORGANISATION_PAGE.test(value) ? value : null;
}

/** The password confirmation form, remembering the organisation page when there is one. */
export function stepUpHref(from?: string | null): string {
  const back = stepUpReturnPath(from);
  return back ? `/account?from=${encodeURIComponent(back)}#confirm` : "/account#confirm";
}
