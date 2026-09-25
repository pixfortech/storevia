import type { GlyphName } from "@storevia/ui/icons";
import type { NAV_ICONS } from "./icons";

export type ShellIcon = keyof typeof NAV_ICONS;

export interface ShellLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ShellIcon;
  /** When the area ships (e.g. "Milestone 5"); undefined = available now. Shown as "Soon". */
  readonly soon?: string | undefined;
  /** The plan doesn't include this area. Presentation only; servers enforce. */
  readonly locked?: boolean | undefined;
  /** The business type's key areas for phones (drawn from its mobilePrimary list). */
  readonly primaryOnMobile?: boolean | undefined;
  /** Active only on an exact path match (section homes). */
  readonly exact?: boolean | undefined;
}

export interface ShellOption {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly description?: string | undefined;
  /** Storevia glyph for the store's business type. */
  readonly glyph?: GlyphName | undefined;
}

export interface ShellAction {
  /** Picks the icon in the Create sheet. */
  readonly key: "invite-member" | "create-store" | "create-product";
  readonly label: string;
  /** One line under the label in the Create sheet. */
  readonly description: string;
  readonly href: string;
  /** Offer this action only under this path (most specific wins); default: everywhere. */
  readonly under?: string | undefined;
  /** Listed in the Create sheet and command menu, never as the page's primary action. */
  readonly sheetOnly?: boolean | undefined;
  /** Pages that show this action themselves, so the top bar doesn't repeat it there. */
  readonly offeredOn?: readonly string[] | undefined;
}

/** The plan indicator. Present only for members who may read billing. */
export interface ShellPlan {
  /** e.g. "Business plan", or "Free allowance" without a subscription. */
  readonly name: string;
  /** Only when the plan needs attention (trial, past due, cancelled, ended). */
  readonly status?:
    { readonly label: string; readonly tone: "info" | "warning" | "neutral" } | undefined;
  readonly href: string;
  /** The usage line closest to its limit. Real counts only. */
  readonly meter?:
    | {
        readonly label: string;
        readonly used: number;
        readonly limit: number | null;
        /** Measured in bytes (media storage): shown as KB, MB or GB. */
        readonly bytes?: boolean | undefined;
      }
    | undefined;
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
        readonly glyph: GlyphName;
      }
    | undefined;
  readonly stores: readonly ShellOption[];
  /** May create a store and the plan has room for one. */
  readonly canCreateStore: boolean;
  readonly createStoreHref: string;
  /**
   * The member may create stores but the plan's store limit is reached: the
   * switcher says so instead of offering "Create store". `href` is Billing,
   * for members who may read it. Presentation only; createStore enforces.
   */
  readonly storeLimit?: { readonly href?: string | undefined } | undefined;
  /** Navigation for the current scope (store or organisation). */
  readonly links: readonly ShellLink[];
  /** Organisation shortcuts shown beneath store navigation. */
  readonly organisationLinks: readonly ShellLink[];
  /**
   * Real "create" actions the member may perform. The top bar shows the one
   * that fits the current page (e.g. "Invite member" on Members); the phone's
   * Create sheet lists them all.
   */
  readonly createActions: readonly ShellAction[];
  readonly plan?: ShellPlan | undefined;
}
