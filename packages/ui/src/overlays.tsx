"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "./cn";

/** Accessible dropdown menu (keyboard navigation, focus management via Radix). */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  children,
  align = "start",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          "z-50 min-w-56 max-w-[calc(100vw-24px)] rounded-card border border-line bg-surface p-1.5 shadow-[var(--shadow-popover)]",
          className,
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <Menu.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-ink-faint">
      {children}
    </Menu.Label>
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1.5 h-px bg-line" />;
}

export function DropdownMenuItem({
  children,
  className,
  asChild,
  onSelect,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
  onSelect?: (event: Event) => void;
  disabled?: boolean;
}) {
  return (
    <Menu.Item
      asChild={asChild === true}
      disabled={disabled === true}
      {...(onSelect ? { onSelect } : {})}
      className={cn(
        "flex w-full cursor-pointer select-none items-center gap-2 rounded-control px-2.5 py-2 text-sm text-ink outline-none",
        "data-[highlighted]:bg-subtle data-[disabled]:cursor-default data-[disabled]:text-ink-faint",
        className,
      )}
    >
      {children}
    </Menu.Item>
  );
}

/**
 * Modal dialog. `side="bottom"` renders a mobile sheet, `"left"` a navigation
 * drawer and `"right"` a contextual side panel.
 */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  side = "center",
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: "center" | "bottom" | "left" | "right";
}) {
  return (
    <DialogPrimitive.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-fade-in bg-stone-950/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 bg-surface shadow-[var(--shadow-popover)] focus:outline-none",
            side === "center" &&
              "left-1/2 top-1/2 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 animate-rise-in overflow-y-auto rounded-card p-6",
            side === "bottom" &&
              "inset-x-0 bottom-0 max-h-[92dvh] animate-sheet-in overflow-y-auto rounded-t-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
            side === "left" &&
              "inset-y-0 left-0 w-[min(20rem,calc(100vw-48px))] animate-drawer-in overflow-y-auto border-r border-line p-4",
            side === "right" &&
              "inset-y-0 right-0 w-[min(28rem,100vw)] animate-fade-in overflow-y-auto border-l border-line p-6",
          )}
        >
          <DialogPrimitive.Title className="text-base font-semibold text-ink">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1 text-sm text-ink-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
