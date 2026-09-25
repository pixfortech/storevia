"use client";
// The marketing header's mega-menu (docs/design/design-plan.md §8), on Radix
// NavigationMenu, which supplies roving focus and menu behaviour. Kept apart
// from navigation.tsx so pages with tabs or breadcrumbs don't ship it.
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Glyph, Icon, type GlyphName } from "./icons";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * Panels open in a shared viewport under the menu. By default it is placed
 * against the menu itself; give the menu className="static" to place it
 * against the nearest positioned ancestor instead (e.g. a full-width header).
 * Items need a `value` for `value`/`defaultValue` to address them.
 */
export interface NavigationMenuProps extends Omit<
  ComponentPropsWithRef<typeof NavigationMenuPrimitive.Root>,
  "aria-label"
> {
  /**
   * Names the navigation landmark (e.g. "Main"). Required: Radix would call
   * every menu "Main", and a page can hold more than one.
   */
  "aria-label": string;
  /** Render the shared viewport (panels animate size between items). Default true. */
  viewport?: boolean;
  /** Where panels open under the menu. Default "center". */
  viewportAlign?: "start" | "center" | "end";
}

export function NavigationMenu({
  className,
  children,
  viewport = true,
  viewportAlign = "center",
  ...props
}: NavigationMenuProps) {
  return (
    <NavigationMenuPrimitive.Root
      className={cn("relative flex items-center", className)}
      {...props}
    >
      {children}
      {viewport ? <NavigationMenuViewport align={viewportAlign} /> : null}
    </NavigationMenuPrimitive.Root>
  );
}

export type NavigationMenuListProps = ComponentPropsWithRef<typeof NavigationMenuPrimitive.List>;

export function NavigationMenuList({ className, ...props }: NavigationMenuListProps) {
  return (
    <NavigationMenuPrimitive.List
      className={cn("m-0 flex list-none items-center gap-0.5 p-0", className)}
      {...props}
    />
  );
}

export const NavigationMenuItem = NavigationMenuPrimitive.Item;

const TOP_LEVEL = cn(
  "group relative inline-flex h-9 select-none items-center gap-1 rounded-control px-3 text-body-sm font-medium text-ink-muted",
  "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
  "hover:bg-subtle hover:text-ink data-[state=open]:text-ink data-active:text-ink",
  "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1",
  FOCUS_RING,
);

export type NavigationMenuTriggerProps = ComponentPropsWithRef<
  typeof NavigationMenuPrimitive.Trigger
>;

export function NavigationMenuTrigger({
  className,
  children,
  ...props
}: NavigationMenuTriggerProps) {
  return (
    <NavigationMenuPrimitive.Trigger className={cn(TOP_LEVEL, className)} {...props}>
      {children}
      <Icon
        icon={ChevronDown}
        size="xs"
        className="text-ink-faint transition-transform duration-(--duration-base) ease-(--ease-standard) group-data-[state=open]:rotate-180 group-data-[state=open]:text-ink"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

export type NavigationMenuContentProps = ComponentPropsWithRef<
  typeof NavigationMenuPrimitive.Content
>;

export function NavigationMenuContent({ className, ...props }: NavigationMenuContentProps) {
  return (
    <NavigationMenuPrimitive.Content
      className={cn(
        "top-0 left-0 w-full p-2 sm:absolute sm:w-auto",
        // Entrance and exit use different keyframes: Radix Presence only waits
        // for an exit animation whose name differs from the one before it.
        "data-[motion^=from-]:animate-[scale-in_var(--duration-base)_var(--ease-emphasised)]",
        "data-[motion^=to-]:animate-[fade-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]",
        className,
      )}
      {...props}
    />
  );
}

export interface NavigationMenuLinkProps extends Omit<
  ComponentPropsWithRef<typeof NavigationMenuPrimitive.Link>,
  "title"
> {
  /** Makes a panel row: title, optional description and icon. Without it, a top-level link. */
  title?: ReactNode;
  description?: ReactNode;
  /**
   * A Storevia product glyph for the row's tile: use it for product concepts
   * (builder, online-store, analytics…). A string, so server components can pass it.
   */
  glyph?: GlyphName;
  /** A Lucide icon for the tile, or any node to use as the tile itself. */
  icon?: LucideIcon | ReactNode;
}

const LINK_TILE =
  "flex size-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface shadow-xs transition-colors duration-(--duration-fast) group-hover/link:border-line-strong";

function isComponent(icon: unknown): icon is LucideIcon {
  // Lucide icons are forwardRef objects; elements are nodes, not components.
  return (
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && "$$typeof" in icon && !isValidElement(icon))
  );
}

function linkVisual(glyph: GlyphName | undefined, icon: LucideIcon | ReactNode): ReactNode {
  if (glyph) {
    return (
      <span className={cn(LINK_TILE, "text-ink")}>
        <Glyph name={glyph} className="size-5" />
      </span>
    );
  }
  if (isComponent(icon)) {
    return (
      <span className={cn(LINK_TILE, "text-ink-muted group-hover/link:text-brand-600")}>
        <Icon icon={icon} size="nav" />
      </span>
    );
  }
  return icon ?? null;
}

/**
 * A link in the menu. With `title` it is a panel row (glyph or icon tile,
 * title, description); without, a top-level item like "Pricing". With
 * `asChild`, pass one link element (e.g. next/link) and the row content goes
 * inside it.
 */
export function NavigationMenuLink({
  title,
  description,
  glyph,
  icon,
  className,
  children,
  asChild,
  ...props
}: NavigationMenuLinkProps) {
  const row = title !== undefined;
  const content = row ? (
    <>
      {linkVisual(glyph, icon)}
      <span className="min-w-0">
        <span className="block text-body-sm font-medium text-ink">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-body-sm leading-snug text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
    </>
  ) : (
    children
  );
  const classes = cn(
    row
      ? cn(
          "group/link flex items-start gap-3 rounded-control p-3 transition-colors duration-(--duration-fast) ease-(--ease-standard)",
          "hover:bg-subtle data-active:bg-subtle",
          FOCUS_RING,
        )
      : TOP_LEVEL,
    className,
  );
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ children?: ReactNode }>;
    return (
      <NavigationMenuPrimitive.Link asChild className={classes} {...props}>
        {row ? cloneElement(child, undefined, content) : child}
      </NavigationMenuPrimitive.Link>
    );
  }
  return (
    <NavigationMenuPrimitive.Link className={classes} {...props}>
      {content}
    </NavigationMenuPrimitive.Link>
  );
}

export interface NavigationMenuViewportProps extends ComponentPropsWithRef<
  typeof NavigationMenuPrimitive.Viewport
> {
  align?: "start" | "center" | "end";
}

export function NavigationMenuViewport({
  className,
  align = "center",
  ...props
}: NavigationMenuViewportProps) {
  return (
    <div
      className={cn(
        "absolute top-full left-0 z-(--z-popover) flex w-full",
        align === "start" && "justify-start",
        align === "center" && "justify-center",
        align === "end" && "justify-end",
      )}
    >
      <NavigationMenuPrimitive.Viewport
        className={cn(
          "relative mt-2 h-(--radix-navigation-menu-viewport-height) w-full shrink-0 origin-top overflow-hidden rounded-card border border-line bg-surface shadow-popover",
          "sm:w-(--radix-navigation-menu-viewport-width)",
          "transition-[width,height] duration-(--duration-base) ease-(--ease-standard)",
          "data-[state=open]:animate-[scale-in_var(--duration-base)_var(--ease-emphasised)]",
          "data-[state=closed]:animate-[fade-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]",
          className,
        )}
        {...props}
      />
    </div>
  );
}
