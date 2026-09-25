"use client";

// Overlays (docs/design/design-plan.md §5, §7): Dialog, Drawer and Sheet
// (the DropdownMenu family is in dropdown-menu.tsx, so pages with only a
// dialog don't ship menu code). Radix supplies focus trapping, dismissal, scroll
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
import { X } from "lucide-react";
import { useRef, type HTMLAttributes, type ReactNode } from "react";
import { IconButton } from "./button";
import { cn } from "./cn";
import {
  focusPanel,
  openingOrigin,
  registerLayerReturn,
  restoreFocus,
  type FocusResolver,
} from "./overlays-focus";
import { EXIT_FADE } from "./overlays-shared";

/* ----------------------------------------------------------------------------
 * Shared motion
 * ------------------------------------------------------------------------- */

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
