"use client";

// Overlays (docs/design/design-plan.md §5, §7): Dialog, Drawer, Sheet and the
// DropdownMenu family. Radix supplies focus trapping, dismissal, scroll
// locking and keyboard behaviour; this file supplies the Storevia look.
//
// Motion: panels enter on the emphasised curve (200 ms dialogs, 320 ms
// drawers and sheets) and leave on a 120 ms fade. The global reduced-motion
// rule in theme.css collapses both, and Radix still unmounts on animationend.
//
// Focus return lives in overlays-focus.ts: every layer records where focus
// goes when it closes, so overlays opened on top of a closing one (⌘K after
// Esc, a menu item that opens a dialog) hand focus back correctly.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, X, type LucideIcon } from "lucide-react";
import { cloneElement, isValidElement, useRef, type HTMLAttributes, type ReactNode } from "react";
import { IconButton } from "./button";
import { cn } from "./cn";
import { Icon } from "./icons";
import {
  focusPanel,
  keepFocusInNewerModal,
  openingOrigin,
  registerLayerReturn,
  restoreFocus,
  type FocusResolver,
} from "./overlays-focus";

/* ----------------------------------------------------------------------------
 * Shared motion
 * ------------------------------------------------------------------------- */

// Radix waits for an exit animation only when its name differs from the
// entrance's, so each exit reuses a different token keyframe played in reverse.
const EXIT_FADE =
  "data-[state=closed]:animate-[fade-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]";

// Navy at 32%, no blur. The overlay fades in; its exit (scale-in reversed)
// shrinks it 3%, so it is drawn 4rem past every viewport edge to stay covering.
const OVERLAY = cn(
  "fixed -inset-16 z-(--z-overlay) bg-[rgb(11_21_48/0.32)]",
  "data-[state=open]:animate-fade-in",
  "data-[state=closed]:animate-[scale-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]",
);

/* ----------------------------------------------------------------------------
 * Dialog, Drawer and Sheet
 * ------------------------------------------------------------------------- */

type Placement = "center" | "left" | "right" | "bottom";

export interface DialogBaseProps {
  /** Controlled open state (omit both for an uncontrolled dialog with a trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens it (rendered with asChild). */
  trigger?: ReactNode;
  /** The accessible name and visible heading. */
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Actions pinned under the body, behind a hairline (e.g. Cancel + Save). */
  footer?: ReactNode;
  /** Hides the × button (the footer or the content must still offer a way out). */
  hideClose?: boolean;
  /** Accessible name of the × button. */
  closeLabel?: string;
  /**
   * alertdialog: a confirmation that interrupts, such as a destructive action.
   * Clicking outside doesn't dismiss it; Esc and its buttons still do, and
   * focus starts on the first button (put Cancel first).
   */
  role?: "dialog" | "alertdialog";
  /** Class names for the panel. */
  className?: string;
}

/** Shape of each panel, shared by the live overlay and its static preview. */
const PANEL_SHAPE: Record<Placement, string> = {
  center: "rounded-panel border border-line",
  left: "border-r border-line",
  right: "border-l border-line",
  bottom: "rounded-t-panel border border-b-0 border-line",
};

/** Where the live panel sits in the viewport, and how it enters and leaves. */
const PANEL_LIVE: Record<Placement, string> = {
  center: cn(
    "top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
    "data-[state=open]:animate-scale-in",
    EXIT_FADE,
  ),
  left: cn(
    "inset-y-0 left-0 h-dvh w-[min(20rem,calc(100vw-3rem))]",
    "data-[state=open]:animate-drawer-in",
    EXIT_FADE,
  ),
  right: cn(
    "inset-y-0 right-0 h-dvh w-[min(24rem,calc(100vw-3rem))]",
    "data-[state=open]:animate-drawer-in-right",
    EXIT_FADE,
  ),
  bottom: cn(
    "inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-xl",
    "data-[state=open]:animate-sheet-in",
    "data-[state=closed]:animate-[rise-in_var(--duration-base)_var(--ease-exit)_reverse_forwards]",
  ),
};

/** The static preview docks in its flex container as the live panel docks in the viewport. */
const PANEL_PREVIEW: Record<Placement, string> = {
  center: "m-auto w-full",
  left: "mr-auto h-full w-[min(20rem,calc(100%-3rem))]",
  right: "ml-auto h-full w-[min(24rem,calc(100%-3rem))]",
  bottom: "mx-auto mt-auto max-h-[85%] w-full max-w-xl",
};

const HEADER: Record<Placement, string> = {
  center: "px-6 pt-6 pr-14",
  left: "flex min-h-16 items-center border-b border-line px-5 py-3 pr-14",
  right: "flex min-h-16 items-center border-b border-line px-5 py-3 pr-14",
  bottom: "px-5 pt-2 pr-14",
};

const BODY: Record<Placement, string> = {
  center: "px-6 pt-5 pb-6",
  left: "p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
  right: "p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
  bottom: "px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
};

const FOOTER: Record<Placement, string> = {
  center: "px-6 py-4",
  left: "px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
  right: "px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
  bottom: "px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
};

const CLOSE: Record<Placement, string> = {
  center: "top-4 right-4",
  left: "top-4 right-3.5",
  right: "top-4 right-3.5",
  bottom: "top-4 right-3.5",
};

const TITLE: Record<Placement, string> = {
  center: "font-display text-h4 text-ink",
  left: "font-display text-body font-semibold text-ink",
  right: "font-display text-body font-semibold text-ink",
  bottom: "font-display text-body font-semibold text-ink",
};

const DESCRIPTION = "mt-1.5 text-body-sm text-ink-muted";

const DIALOG_SIZES = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" } as const;
const PREVIEW_SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" } as const;

/** A row of dialog actions: stacked full-width on phones, right-aligned from sm. */
export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

/** Handle, header, scrolling body, footer and × (last in the DOM, so last in tab order). */
function PanelLayout({
  placement,
  heading,
  children,
  footer,
  close,
}: {
  placement: Placement;
  heading: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  close: ReactNode;
}) {
  return (
    <>
      {placement === "bottom" ? (
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-pill bg-neutral-200 forced-colors:bg-[GrayText] forced-color-adjust-none"
        />
      ) : null}
      <div className={cn("shrink-0", HEADER[placement])}>
        <div className="min-w-0">{heading}</div>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain text-body-sm text-ink",
          BODY[placement],
          footer && "pb-5",
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className={cn("shrink-0 border-t border-line", FOOTER[placement])}>
          <DialogFooter>{footer}</DialogFooter>
        </div>
      ) : null}
      {close}
    </>
  );
}

const closeButtonClasses = (placement: Placement) =>
  cn("absolute text-ink-faint", CLOSE[placement]);

type DialogSize = keyof typeof DIALOG_SIZES;

function OverlayPanel({
  placement,
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  hideClose = false,
  // Not "Close": callers' own Cancel/Close buttons keep a unique name.
  closeLabel = "Dismiss",
  role = "dialog",
  className,
  size = "md",
}: DialogBaseProps & { placement: Placement; size?: DialogSize }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<FocusResolver>(() => null);
  const blockOutside =
    role === "alertdialog"
      ? (event: { preventDefault: () => void }) => {
          event.preventDefault();
        }
      : null;
  return (
    <DialogPrimitive.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      {trigger ? (
        <DialogPrimitive.Trigger asChild ref={triggerRef}>
          {trigger}
        </DialogPrimitive.Trigger>
      ) : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={OVERLAY}
          // An alertdialog stays open on a click outside; keep focus in it too
          // (a click on the veil would otherwise move focus to <body>).
          {...(blockOutside ? { onMouseDown: blockOutside } : {})}
        />
        <DialogPrimitive.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          role={role}
          onOpenAutoFocus={(event) => {
            const layer = event.currentTarget as HTMLElement;
            // Where focus goes on close: the trigger, or (for controlled
            // dialogs) wherever the user was, even if that was a menu item.
            returnTo.current = openingOrigin(layer, triggerRef.current);
            registerLayerReturn(layer, returnTo.current);
            if (placement !== "center") focusPanel(event);
          }}
          onCloseAutoFocus={(event) => {
            restoreFocus(event, returnTo.current);
          }}
          {...(blockOutside
            ? { onPointerDownOutside: blockOutside, onInteractOutside: blockOutside }
            : {})}
          data-sv-layer=""
          data-sv-modal=""
          data-placement={placement}
          className={cn(
            "fixed z-(--z-modal) flex flex-col bg-surface shadow-window outline-none",
            PANEL_SHAPE[placement],
            PANEL_LIVE[placement],
            placement === "center" && DIALOG_SIZES[size],
            className,
          )}
        >
          <PanelLayout
            placement={placement}
            heading={
              <>
                <DialogPrimitive.Title className={TITLE[placement]}>{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className={DESCRIPTION}>
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </>
            }
            footer={footer}
            close={
              hideClose ? null : (
                <DialogPrimitive.Close asChild>
                  <IconButton
                    icon={X}
                    size="sm"
                    aria-label={closeLabel}
                    className={closeButtonClasses(placement)}
                  />
                </DialogPrimitive.Close>
              )
            }
          >
            {children}
          </PanelLayout>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface DialogProps extends DialogBaseProps {
  /** center (default) · bottom: a Sheet · left / right: a Drawer. */
  side?: Placement;
  /** Width of a centred dialog: sm 448 · md 512 (default) · lg 672. */
  size?: DialogSize;
}

/**
 * Modal dialog. `side="bottom"` renders a mobile sheet, `"left"` a navigation
 * drawer and `"right"` a contextual side panel. Focus starts on the first
 * control in a centred dialog and on the panel itself in drawers and sheets,
 * and returns to the trigger (or, when controlled, to where the user was).
 */
export function Dialog({ side = "center", ...props }: DialogProps) {
  return <OverlayPanel placement={side} {...props} />;
}

export const DialogClose = DialogPrimitive.Close;

export interface DrawerProps extends DialogBaseProps {
  /** right (default): a contextual panel, 384 px · left: navigation, 320 px. */
  side?: "left" | "right";
}

/** A full-height side panel. */
export function Drawer({ side = "right", ...props }: DrawerProps) {
  return <OverlayPanel placement={side} {...props} />;
}

/** A bottom sheet for phones: grab handle, rounded top, safe-area padding. */
export function Sheet(props: DialogBaseProps) {
  return <OverlayPanel placement="bottom" {...props} />;
}

export interface OverlayPreviewProps {
  /** center: a Dialog · left / right: a Drawer · bottom: a Sheet. */
  side?: Placement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  hideClose?: boolean;
  /** Width of a centred dialog, as on Dialog. */
  size?: DialogSize;
  className?: string;
}

/**
 * A static, inert render of a Dialog, Drawer or Sheet for galleries and
 * product visuals: the same panel, without the portal, veil or focus trap,
 * and hidden from assistive technology. Place it in a flex container with a
 * height: it docks as the live panel docks in the viewport.
 */
export function OverlayPreview({
  side = "center",
  title,
  description,
  children,
  footer,
  hideClose = false,
  size = "md",
  className,
}: OverlayPreviewProps) {
  return (
    <div
      inert
      aria-hidden="true"
      data-placement={side}
      className={cn(
        "relative flex min-h-0 flex-col bg-surface text-left shadow-window",
        PANEL_SHAPE[side],
        PANEL_PREVIEW[side],
        side === "center" && PREVIEW_SIZES[size],
        className,
      )}
    >
      <PanelLayout
        placement={side}
        heading={
          <>
            <div className={TITLE[side]}>{title}</div>
            {description ? <p className={DESCRIPTION}>{description}</p> : null}
          </>
        }
        footer={footer}
        close={
          hideClose ? null : (
            <IconButton
              icon={X}
              size="sm"
              aria-label="Dismiss"
              tabIndex={-1}
              className={closeButtonClasses(side)}
            />
          )
        }
      >
        {children}
      </PanelLayout>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * DropdownMenu
 * ------------------------------------------------------------------------- */

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
