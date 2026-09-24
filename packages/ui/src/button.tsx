// Buttons (docs/design/design-plan.md §5). Server-safe: no hooks, so
// buttonClasses() can style links in server components.
import type { LucideIcon } from "lucide-react";
import {
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Spinner } from "./spinner";
import { Icon } from "./icons";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  /** Opens a high-risk flow: quiet, but visibly destructive. */
  | "danger-outline"
  /** Secondary action on a dark or brand surface (rare in the white-first system). */
  | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "border border-line-strong bg-surface text-ink shadow-xs hover:border-neutral-300 hover:bg-subtle active:bg-muted",
  ghost: "text-ink-muted hover:bg-muted hover:text-ink active:bg-neutral-150",
  danger: "bg-danger-600 text-white shadow-xs hover:bg-danger-700 active:bg-danger-700",
  "danger-outline":
    "border border-danger-500/35 bg-surface text-danger-700 shadow-xs hover:border-danger-500/60 hover:bg-danger-50",
  inverse: "border border-white/25 text-white hover:bg-white/10 active:bg-white/15",
};

// Heights 32 / 40 / 48. On coarse pointers an invisible ::after extends sm
// and md to a 44 px tall hit area without changing the layout (vertically
// only, so neighbours in a row never steal each other's taps). The ::after
// sits inside the 1 px border, hence 7 and 3 px rather than 6 and 2.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-body-sm pointer-coarse:after:-inset-y-[7px]",
  md: "h-10 gap-2 px-4 text-body-sm pointer-coarse:after:-inset-y-[3px]",
  lg: "h-12 gap-2 px-5 text-body",
};

const BASE = cn(
  // The transparent border costs nothing on screen (the fill shows through)
  // and becomes the button's outline in forced-colours mode, where fills go.
  "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control border border-transparent font-medium",
  "transition-[background-color,border-color,color,box-shadow,translate] duration-(--duration-fast) ease-(--ease-standard)",
  "active:translate-y-px",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0",
  // A pending button keeps its look (it is working, not unavailable).
  "disabled:cursor-not-allowed data-pending:cursor-progress data-pending:active:translate-y-0",
  "[&:disabled:not([data-pending])]:opacity-45 [&:disabled:not([data-pending])]:shadow-none",
  "[&:disabled:not([data-pending])]:active:translate-y-0",
  "aria-disabled:pointer-events-none aria-disabled:opacity-45",
);

/** Class names for anything that should look like a button (e.g. links). */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

/** A Lucide icon (rendered at the button's icon size) or any node. */
export type ButtonIcon = LucideIcon | ReactNode;

function renderIcon(icon: ButtonIcon, size: ButtonSize): ReactNode {
  if (icon === null || icon === undefined || typeof icon === "boolean") return null;
  if (isValidElement(icon) || typeof icon === "string" || typeof icon === "number") return icon;
  // Lucide icons are forwardRef objects, so anything else renderable is a component.
  if (typeof icon === "function" || (typeof icon === "object" && "$$typeof" in icon)) {
    return <Icon icon={icon as LucideIcon} size={size === "lg" ? "md" : "sm"} />;
  }
  return icon as ReactNode;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the width and disables the button (e.g. while a form submits). */
  pending?: boolean;
  /** Icon before the label. */
  leadingIcon?: ButtonIcon;
  /** Icon after the label (e.g. ArrowRight for "Continue"). */
  trailingIcon?: ButtonIcon;
  /** Stretches to the container width. */
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    pending = false,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, cn(fullWidth && "w-full", className))}
      disabled={disabled === true || pending}
      aria-busy={pending || undefined}
      data-pending={pending ? "" : undefined}
      {...props}
    >
      {/* Transparent, not hidden, while pending: the label keeps the width
          and stays the button's accessible name. */}
      <span
        className={cn(
          "inline-flex min-w-0 items-center justify-center gap-[inherit]",
          pending && "opacity-0",
        )}
      >
        {renderIcon(leadingIcon, size)}
        {children}
        {renderIcon(trailingIcon, size)}
      </span>
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={size === "lg" ? "md" : "sm"} />
        </span>
      ) : null}
    </button>
  );
});

/* ----------------------------------------------------------------------------
 * IconButton
 * ------------------------------------------------------------------------- */

export type IconButtonVariant = "ghost" | "secondary" | "primary";

// On coarse pointers the hit area grows to 44 × 44. Unlike text buttons it
// also grows sideways, so loose sm icon buttons need 14 px between them on
// touch screens for a full 44 each (6 px keeps any from covering a
// neighbour). ButtonGroup sets --icon-button-hit-x to 0 because its buttons
// touch, and widens them to 44 px instead.
const ICON_BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "size-8 pointer-coarse:after:-inset-y-[7px] pointer-coarse:after:inset-x-[calc(var(--icon-button-hit-x,1)*-7px)]",
  md: "size-10 pointer-coarse:after:-inset-y-[3px] pointer-coarse:after:inset-x-[calc(var(--icon-button-hit-x,1)*-3px)]",
  lg: "size-12",
};

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  /** The Lucide icon to show. */
  icon: LucideIcon;
  /** Required: an icon alone has no accessible name. */
  "aria-label": string;
  variant?: IconButtonVariant;
  /** sm 32, md 40 (default), lg 48 px. */
  size?: ButtonSize;
  pending?: boolean;
}

/** A square, icon-only button. The label is required (and pairs well with a Tooltip). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    variant = "ghost",
    size = "md",
    pending = false,
    className,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, VARIANTS[variant], ICON_BUTTON_SIZES[size], "p-0", className)}
      disabled={disabled === true || pending}
      aria-busy={pending || undefined}
      data-pending={pending ? "" : undefined}
      {...props}
    >
      {pending ? (
        <Spinner size={size === "lg" ? "md" : "sm"} />
      ) : (
        <Icon icon={icon} size={size === "lg" ? "md" : size === "md" ? "nav" : "sm"} />
      )}
    </button>
  );
});

/* ----------------------------------------------------------------------------
 * ButtonGroup
 * ------------------------------------------------------------------------- */

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the group for assistive tech (e.g. "Text alignment"). */
  "aria-label"?: string;
  /** Stretch the buttons to fill the width equally. */
  fullWidth?: boolean;
}

/**
 * Attached buttons that share borders, for related actions (e.g. "Copy" +
 * "Share", or Day / Week / Month). Use secondary buttons inside; for a single
 * choice between options prefer SegmentedControl.
 */
export function ButtonGroup({ className, fullWidth = false, ...props }: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(
        "isolate inline-flex rounded-control shadow-xs [--icon-button-hit-x:0] pointer-coarse:*:min-w-11",
        "*:rounded-none *:shadow-none *:first:rounded-l-control *:last:rounded-r-control",
        "*:not-first:-ml-px *:hover:z-10 *:focus-visible:z-20",
        fullWidth && "flex w-full *:flex-1",
        className,
      )}
      {...props}
    />
  );
}
