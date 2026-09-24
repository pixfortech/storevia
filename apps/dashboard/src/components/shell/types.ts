import type { NAV_ICONS } from "./icons";

export interface ShellLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: keyof typeof NAV_ICONS;
  readonly badge?: string | undefined;
  readonly primaryOnMobile?: boolean | undefined;
}

export interface ShellOption {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly description?: string | undefined;
}

export interface ShellData {
  readonly user: { readonly name: string; readonly email: string };
  readonly organisation: { readonly id: string; readonly name: string; readonly href: string };
  readonly organisations: readonly ShellOption[];
  /** Present in store-scoped pages. */
  readonly store?:
    { readonly id: string; readonly name: string; readonly href: string } | undefined;
  readonly stores: readonly ShellOption[];
  readonly canCreateStore: boolean;
  readonly createStoreHref: string;
  readonly links: readonly ShellLink[];
}
