import type { NAV_ICONS } from "./icons";

export type ShellIcon = keyof typeof NAV_ICONS;

export interface ShellLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ShellIcon;
  /** When the area ships (e.g. "Milestone 5"); undefined = available now. */
  readonly soon?: string | undefined;
  /** The plan doesn't include this area. Presentation only; servers enforce. */
  readonly locked?: boolean | undefined;
  /** Shown in the mobile bottom bar; the rest go under "More". */
  readonly primaryOnMobile?: boolean | undefined;
  /** Active only on an exact path match (section homes). */
  readonly exact?: boolean | undefined;
}

export interface ShellOption {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly description?: string | undefined;
}

export interface ShellAction {
  readonly label: string;
  readonly href: string;
  /** Offer this action only under this path (most specific wins); default: everywhere. */
  readonly under?: string | undefined;
}

export interface ShellData {
  readonly user: { readonly name: string; readonly email: string };
  readonly organisation: { readonly id: string; readonly name: string; readonly href: string };
  readonly organisations: readonly ShellOption[];
  /** Present in store-scoped pages. */
  readonly store?:
    | {
        readonly id: string;
        readonly name: string;
        readonly href: string;
        /** Business type label, e.g. "Online store". */
        readonly kind: string;
      }
    | undefined;
  readonly stores: readonly ShellOption[];
  readonly canCreateStore: boolean;
  readonly createStoreHref: string;
  /** Navigation for the current scope (store or organisation). */
  readonly links: readonly ShellLink[];
  /** Organisation shortcuts shown beneath store navigation. */
  readonly organisationLinks: readonly ShellLink[];
  /**
   * Real "create" actions the member may perform. The shell shows the one that
   * fits the current page (e.g. "Invite member" on Members).
   */
  readonly createActions: readonly ShellAction[];
}
