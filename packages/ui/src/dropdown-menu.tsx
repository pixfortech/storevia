"use client";

// DropdownMenu (docs/design/design-plan.md §5, §7): Radix supplies keyboard
// navigation, typeahead and focus management; this file supplies the
// Storevia look. Kept apart from overlays.tsx so a page that only opens a
// dialog doesn't ship menu code. Focus return is shared (overlays-focus.ts).
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, type LucideIcon } from "lucide-react";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";
import { keepFocusInNewerModal } from "./overlays-focus";
import { EXIT_FADE } from "./overlays-shared";

/** Accessible dropdown menu (keyboard navigation, focus management via Radix). */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

const MENU_BOX =
  "min-w-[220px] max-w-[calc(100vw-24px)] rounded-card border border-line bg-surface p-1 shadow-popover";

export function DropdownMenuContent({
  children,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={12}
        loop
        onCloseAutoFocus={(event) => {
          keepFocusInNewerModal(event);
        }}
        data-sv-layer=""
        className={cn(
          MENU_BOX,
          "z-(--z-popover) max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto",
          "origin-(--radix-dropdown-menu-content-transform-origin) outline-none",
          "data-[state=open]:animate-scale-in",
          EXIT_FADE,
          className,
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

const LABEL = "truncate px-2.5 pt-2 pb-1 text-caption font-medium text-ink-faint";
const SEPARATOR = "-mx-1 my-1 h-px bg-line";

export function DropdownMenuLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Menu.Label className={cn(LABEL, className)}>{children}</Menu.Label>;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn(SEPARATOR, className)} />;
}

// 36 px rows for a mouse, 44 px on touch screens (the plan's minimum target).
const ITEM = cn(
  "group/item relative flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-body-sm text-ink outline-none select-none pointer-coarse:min-h-11",
  "transition-colors duration-(--duration-fast) data-highlighted:bg-subtle",
  "data-disabled:cursor-default data-disabled:text-ink-faint data-disabled:opacity-60",
);

const DANGER_ITEM = "text-danger-700 data-highlighted:bg-danger-50";

/* Keyboard hints ---------------------------------------------------------- */

// Mac glyph → [key name on Apple platforms, what other platforms write].
const MODIFIER_GLYPHS: Record<string, readonly [mac: string, other: string]> = {
  "⌘": ["Meta", "Ctrl"],
  "⌃": ["Control", "Ctrl"],
  "⌥": ["Alt", "Alt"],
  "⇧": ["Shift", "Shift"],
};
const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift"];

const KEY_WORDS: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  cmd: "Meta",
  command: "Meta",
  meta: "Meta",
  alt: "Alt",
  option: "Alt",
  opt: "Alt",
  shift: "Shift",
  esc: "Escape",
  "↵": "Enter",
  "⏎": "Enter",
  "⌫": "Backspace",
  "⌦": "Delete",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
};

const keyName = (key: string) =>
  KEY_WORDS[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);

/**
 * A menu shortcut written the Mac way ("⌘D", "⇧⌘P", "E") as display text and
 * an aria-keyshortcuts value for the platform: other platforms read "Ctrl+D".
 * Shortcuts already spelled out ("Ctrl+K") keep their text.
 */
export function dropdownMenuShortcut(
  shortcut: string,
  apple: boolean,
): { text: string; keys: string } {
  const value = shortcut.trim();
  if (value.length > 1 && value.includes("+")) {
    return { text: value, keys: value.split("+").map(keyName).join("+") };
  }
  const glyphs: (readonly [string, string])[] = [];
  let key = value;
  for (const glyph of value) {
    const modifier = MODIFIER_GLYPHS[glyph];
    if (!modifier || key.length <= glyph.length) break;
    glyphs.push(modifier);
    key = key.slice(glyph.length);
  }
  if (apple) {
    return { text: value, keys: [...glyphs.map(([mac]) => mac), keyName(key)].join("+") };
  }
  // ⌘ and ⌃ both read Ctrl elsewhere; keep one of each, in Ctrl+Alt+Shift order.
  const modifiers = [...new Set(glyphs.map(([, text]) => text))].sort(
    (a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b),
  );
  return {
    text: [...modifiers, key].join("+"),
    keys: [...modifiers.map(keyName), keyName(key)].join("+"),
  };
}

// Menus render only in the browser (in a portal, once open), so reading the
// platform during render can't cause a hydration mismatch.
function applePlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad|ipod/i.test(data?.platform ?? navigator.userAgent);
}

/** The visible hint: hidden on touch screens and from screen readers (they get aria-keyshortcuts). */
function MenuShortcut({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="ml-auto pl-4 text-caption tracking-[0.04em] text-ink-faint tabular-nums pointer-coarse:hidden"
    >
      {children}
    </span>
  );
}

function ItemIcon({ icon, tone }: { icon: LucideIcon; tone: "default" | "danger" }) {
  return (
    <Icon
      icon={icon}
      size="sm"
      className={cn(
        tone === "danger"
          ? "text-danger-600"
          : "text-ink-faint group-data-highlighted/item:text-ink-muted",
      )}
    />
  );
}

function CheckSlot({ checked }: { checked: ReactNode }) {
  return (
    <span className="absolute left-2.5 flex size-4 items-center justify-center">{checked}</span>
  );
}

const CHECK = <Icon icon={Check} size="sm" className="text-brand-600" />;

// With asChild the item is the caller's element (e.g. a Link), so the icon and
// shortcut are placed around that element's own children.
function withSlots(children: ReactNode, before: ReactNode, after: ReactNode): ReactNode {
  if (!before && !after) return children;
  if (!isValidElement<{ children?: ReactNode }>(children)) return children;
  return cloneElement(
    children,
    undefined,
    <>
      {before}
      {children.props.children}
      {after}
    </>,
  );
}

export interface DropdownMenuItemProps {
  children: ReactNode;
  className?: string;
  /** Render the single child (e.g. a Link) as the item. */
  asChild?: boolean;
  onSelect?: (event: Event) => void;
  disabled?: boolean;
  /** A leading Lucide icon. */
  icon?: LucideIcon;
  /**
   * A keyboard hint on the right, written the Mac way ("⌘D", "E"). Shown as
   * "Ctrl+D" on other platforms, hidden on touch screens, and announced
   * through aria-keyshortcuts. Display only: the page binds the keys.
   */
  shortcut?: string;
  /** danger: a destructive action (red text; confirm it in an alertdialog). */
  tone?: "default" | "danger";
  /** Indent to line up with items that have an icon. */
  inset?: boolean;
}

export function DropdownMenuItem({
  children,
  className,
  asChild = false,
  onSelect,
  disabled = false,
  icon,
  shortcut,
  tone = "default",
  inset = false,
}: DropdownMenuItemProps) {
  const hint = shortcut ? dropdownMenuShortcut(shortcut, applePlatform()) : null;
  const before = icon ? <ItemIcon icon={icon} tone={tone} /> : null;
  const after = hint ? <MenuShortcut>{hint.text}</MenuShortcut> : null;
  return (
    <Menu.Item
      asChild={asChild}
      disabled={disabled}
      {...(onSelect ? { onSelect } : {})}
      {...(hint ? { "aria-keyshortcuts": hint.keys } : {})}
      className={cn(ITEM, tone === "danger" && DANGER_ITEM, inset && "pl-9", className)}
    >
      {asChild ? (
        withSlots(children, before, after)
      ) : (
        <>
          {before}
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {after}
        </>
      )}
    </Menu.Item>
  );
}

export interface DropdownMenuCheckboxItemProps {
  children: ReactNode;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Radix closes the menu on select; call event.preventDefault() to keep it open. */
  onSelect?: (event: Event) => void;
  disabled?: boolean;
  /** As on DropdownMenuItem. */
  shortcut?: string;
  className?: string;
}

/** A toggle inside a menu (e.g. a visible column). The check marks the state. */
export function DropdownMenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
  onSelect,
  disabled = false,
  shortcut,
  className,
}: DropdownMenuCheckboxItemProps) {
  const hint = shortcut ? dropdownMenuShortcut(shortcut, applePlatform()) : null;
  return (
    <Menu.CheckboxItem
      {...(checked === undefined ? {} : { checked })}
      {...(onCheckedChange ? { onCheckedChange } : {})}
      {...(onSelect ? { onSelect } : {})}
      {...(hint ? { "aria-keyshortcuts": hint.keys } : {})}
      disabled={disabled}
      className={cn(ITEM, "pl-9", className)}
    >
      <CheckSlot checked={<Menu.ItemIndicator>{CHECK}</Menu.ItemIndicator>} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <MenuShortcut>{hint.text}</MenuShortcut> : null}
    </Menu.CheckboxItem>
  );
}

export type DropdownMenuPreviewEntry =
  | { type: "label"; label: ReactNode }
  | { type: "separator" }
  | {
      type?: "item";
      label: ReactNode;
      icon?: LucideIcon;
      shortcut?: string;
      tone?: "default" | "danger";
      disabled?: boolean;
      /** Drawn in the keyboard-highlighted state. */
      highlighted?: boolean;
      inset?: boolean;
    }
  | {
      type: "checkbox";
      label: ReactNode;
      checked?: boolean;
      shortcut?: string;
      disabled?: boolean;
      highlighted?: boolean;
    };

export interface DropdownMenuPreviewProps {
  items: readonly DropdownMenuPreviewEntry[];
  className?: string;
}

/**
 * A static, inert render of an open menu for galleries and product visuals,
 * drawn with the live menu's classes and hidden from assistive technology.
 * Shortcuts show as written (the preview renders on the server too). Icons
 * are Lucide components, which can't be passed from a server component, so
 * render it from a client component when the items have icons.
 */
export function DropdownMenuPreview({ items, className }: DropdownMenuPreviewProps) {
  return (
    <div inert aria-hidden="true" className={cn(MENU_BOX, "text-left", className)}>
      {items.map((entry, i) => {
        if (entry.type === "separator") return <div key={i} className={SEPARATOR} />;
        if (entry.type === "label") {
          return (
            <div key={i} className={LABEL}>
              {entry.label}
            </div>
          );
        }
        const state = {
          "data-highlighted": entry.highlighted ? "" : undefined,
          "data-disabled": entry.disabled ? "" : undefined,
        };
        if (entry.type === "checkbox") {
          return (
            <div key={i} {...state} className={cn(ITEM, "pl-9")}>
              <CheckSlot checked={entry.checked ? CHECK : null} />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.shortcut ? <MenuShortcut>{entry.shortcut}</MenuShortcut> : null}
            </div>
          );
        }
        const tone = entry.tone ?? "default";
        return (
          <div
            key={i}
            {...state}
            className={cn(ITEM, tone === "danger" && DANGER_ITEM, entry.inset && "pl-9")}
          >
            {entry.icon ? <ItemIcon icon={entry.icon} tone={tone} /> : null}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut ? <MenuShortcut>{entry.shortcut}</MenuShortcut> : null}
          </div>
        );
      })}
    </div>
  );
}
