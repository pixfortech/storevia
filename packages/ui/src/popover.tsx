"use client";
// Popover (docs/design/design-plan.md §5, §7): on Radix Popover, which supplies
// focus management and dismissal. Its own module so a page with tooltips
// doesn't ship it.
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { type ComponentPropsWithRef } from "react";
import { cn } from "./cn";
import { registerControlledLayer } from "./overlays-focus";
import { POP_ENTER, POP_EXIT } from "./overlays-shared";

/* ----------------------------------------------------------------------------
 * Popover
 * ------------------------------------------------------------------------- */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export type PopoverContentProps = ComponentPropsWithRef<typeof PopoverPrimitive.Content>;

/**
 * The floating panel: surface, hairline, card radius, popover shadow. Padded
 * for content (p-4); pass className="p-1" for a list of menu-like items.
 */
export function PopoverContent({
  className,
  sideOffset = 8,
  align = "center",
  collisionPadding = 12,
  onOpenAutoFocus,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-sv-layer=""
        onOpenAutoFocus={(event) => {
          // So a layer opened while this one closes (⌘K) can return focus to its trigger.
          if (event.currentTarget instanceof Element) registerControlledLayer(event.currentTarget);
          onOpenAutoFocus?.(event);
        }}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          "z-(--z-popover) w-72 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-4 text-body-sm text-ink shadow-popover outline-none",
          "origin-(--radix-popover-content-transform-origin)",
          POP_ENTER,
          POP_EXIT,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
