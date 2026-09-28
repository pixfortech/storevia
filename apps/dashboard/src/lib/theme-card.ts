// What a theme library card shows (08-themes.md §10.7): its state badges and
// its five actions, always in the same order so both cards line up: View
// demo · Install / Installed · Customise · Preview on my store · Publish /
// Make live. An action that doesn't apply yet stays in its place, disabled,
// rather than disappearing. Presentation only: the services check
// permissions and state again. Pure and client-safe (unit-tested).
import type { ThemeLibraryEntry } from "@storevia/site-admin";

export type ThemeBadgeLabel =
  "Live" | "Installed" | "Previewing" | "Unpublished changes" | "Not installed";

export interface ThemeBadge {
  readonly label: ThemeBadgeLabel;
  readonly tone: "success" | "neutral" | "info" | "warning";
}

type EntryState = Pick<
  ThemeLibraryEntry,
  "installed" | "live" | "previewing" | "hasUnpublishedChanges" | "revision" | "incompatibility"
>;

/** The card's state, written out (never colour alone). */
export function themeBadges(entry: EntryState): ThemeBadge[] {
  const badges: ThemeBadge[] = [];
  if (entry.live) badges.push({ label: "Live", tone: "success" });
  else if (entry.installed) badges.push({ label: "Installed", tone: "neutral" });
  else badges.push({ label: "Not installed", tone: "neutral" });
  // The live theme is what the preview shows by default: only another theme is worth marking.
  if (entry.installed && entry.previewing && !entry.live) {
    badges.push({ label: "Previewing", tone: "info" });
  }
  // A theme that isn't live always differs from what visitors see; only the live one can have "changes".
  if (entry.live && entry.hasUnpublishedChanges) {
    badges.push({ label: "Unpublished changes", tone: "warning" });
  }
  return badges;
}

export type ThemeActionKey = "demo" | "install" | "customise" | "preview" | "publish";

export interface ThemeCardAction {
  readonly key: ThemeActionKey;
  /** The visible label (the same on every card). */
  readonly label: string;
  /**
   * link: navigates in the dashboard; external: opens the store preview in
   * a new tab; button: runs an action; disabled: shown in its place, unusable.
   */
  readonly kind: "link" | "external" | "button" | "disabled";
  readonly variant: "primary" | "secondary";
  /** The service call a button makes. */
  readonly run?: "install" | "preview" | "publish";
}

export interface ThemeCardPermissions {
  /** design.edit on a store that can be changed. */
  readonly canEdit: boolean;
  /** theme.publish on a store that can be changed. */
  readonly canPublish: boolean;
}

/** The card's five actions, in their fixed order. */
export function themeCardActions(
  entry: EntryState,
  { canEdit, canPublish }: ThemeCardPermissions,
): ThemeCardAction[] {
  const usable = canEdit && entry.incompatibility === null;
  const install: ThemeCardAction = entry.installed
    ? { key: "install", label: "Installed", kind: "disabled", variant: "secondary" }
    : {
        key: "install",
        label: "Install",
        kind: usable ? "button" : "disabled",
        variant: "primary",
        run: "install",
      };
  const preview: ThemeCardAction = !entry.installed
    ? { key: "preview", label: "Preview on my store", kind: "disabled", variant: "secondary" }
    : entry.previewing
      ? { key: "preview", label: "Preview on my store", kind: "external", variant: "secondary" }
      : {
          key: "preview",
          label: "Preview on my store",
          kind: usable ? "button" : "disabled",
          variant: "secondary",
          run: "preview",
        };
  const publishable = entry.live
    ? entry.hasUnpublishedChanges
    : entry.installed && entry.revision !== null;
  const publish: ThemeCardAction = {
    key: "publish",
    label: entry.live ? "Publish" : "Make live",
    kind: usable && canPublish && publishable ? "button" : "disabled",
    variant: "primary",
    run: "publish",
  };
  return [
    { key: "demo", label: "View demo", kind: "link", variant: "secondary" },
    install,
    {
      key: "customise",
      label: "Customise",
      kind: entry.installed ? "link" : "disabled",
      variant: "secondary",
    },
    preview,
    publish,
  ];
}

/** One line under the actions when some of them can't be used, or null. */
export function themeCardNote(
  entry: EntryState,
  { canEdit, canPublish }: ThemeCardPermissions,
): string | null {
  if (entry.incompatibility !== null) return null; // The card shows why already.
  if (!canEdit) return "This store can't be changed right now.";
  if (!entry.installed)
    return "Install it to customise it, preview it on your store and make it live.";
  if (!canPublish) return "Your role can't publish themes. Ask an owner or admin to make it live.";
  return null;
}

/** The theme's layout in words: what its miniature shows, for everyone. */
export function themeLayoutFacts(chrome: ThemeLibraryEntry["chrome"]): string[] {
  return [
    chrome.header === "centred" ? "Name centred above the menu" : "Name and menu on one row",
    chrome.navigation === "uppercase" ? "uppercase menu" : "menu as written",
    chrome.productCard === "portrait" ? "tall portrait product cards" : "square product cards",
    chrome.productPage === "gallery" ? "gallery product page" : "two-column product page",
  ];
}
