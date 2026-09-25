"use client";
// Feedback controls: Progress and Tooltip (Spinner lives in spinner.tsx,
// toasts in toast.tsx, Popover in popover.tsx)
// (docs/design/design-plan.md §5, §7). Radix supplies focus management,
// dismissal and announcements; this file supplies the Storevia look.
//
// Motion notes. theme.css forces every CSS animation to 1 ms under
// prefers-reduced-motion (an !important rule in the base layer, which no
// utility can override). Loading indicators must not look frozen, so they
// animate outside CSS: the spinner with SVG SMIL, indeterminate progress
// with the Web Animations API. Under reduced motion neither turns nor
// travels; each shows a slow opacity pulse instead, which reads as "working"
// without movement.
// Overlays exit with fade-in played in reverse: Radix Presence waits for an
// exit animation only when its name differs from the entrance's, so entrances
// use scale-in or rise-in.
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { POP_ENTER, POP_EXIT } from "./overlays-shared";

/* ----------------------------------------------------------------------------
 * Shared motion classes
 * ------------------------------------------------------------------------- */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function noop(): void {
  // Nothing to unsubscribe from without matchMedia.
}

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return noop;
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/* ----------------------------------------------------------------------------
 * Progress
 * ------------------------------------------------------------------------- */

export type ProgressSize = "sm" | "md" | "lg";

const PROGRESS_HEIGHT: Record<ProgressSize, string> = { sm: "h-1", md: "h-1.5", lg: "h-2" };

export interface ProgressProps {
  /** 0…max. Omit (or null) for an indeterminate bar. */
  value?: number | null;
  max?: number;
  /** Track height: sm 4, md 6 (default), lg 8 px. */
  size?: ProgressSize;
  /** Visible label; also names the progressbar. */
  label?: ReactNode;
  /** Shows the percentage beside the label (determinate only). */
  showValue?: boolean;
  /** Accessible name when there is no visible label. */
  "aria-label"?: string;
  /** Spoken value instead of the percentage, e.g. "3 of 5 files". */
  valueText?: string;
  className?: string;
}

/** Linear progress: brand on a neutral track, determinate or indeterminate. */
export function Progress({
  value,
  max = 100,
  size = "md",
  label,
  showValue = false,
  valueText,
  className,
  "aria-label": ariaLabel,
}: ProgressProps) {
  const labelId = useId();
  const indeterminate = value === undefined || value === null || !Number.isFinite(value);
  const safeMax = max > 0 ? max : 100;
  const percent = indeterminate
    ? 0
    : Math.round((Math.min(Math.max(value, 0), safeMax) / safeMax) * 100);
  const barRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionPreference();

  // WAAPI rather than CSS so the bar keeps moving (slowly, without travel)
  // under reduced motion; see the note at the top of this file.
  useEffect(() => {
    const bar = barRef.current;
    if (!indeterminate || !bar || typeof bar.animate !== "function") return;
    const animation = reduce
      ? bar.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], {
          duration: 2400,
          iterations: Infinity,
          easing: "ease-in-out",
        })
      : bar.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(250%)" }], {
          duration: 1500,
          iterations: Infinity,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        });
    return () => {
      animation.cancel();
    };
  }, [indeterminate, reduce]);

  return (
    <div className={cn("w-full", className)}>
      {label || (showValue && !indeterminate) ? (
        <div className="mb-2 flex items-baseline justify-between gap-3 text-label">
          {label ? (
            <span id={labelId} className="min-w-0 truncate text-ink">
              {label}
            </span>
          ) : (
            <span />
          )}
          {showValue && !indeterminate ? (
            <span className="font-normal tabular-nums text-ink-muted">{`${String(percent)}%`}</span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-valuemin={0}
        aria-valuemax={indeterminate ? undefined : safeMax}
        aria-valuenow={indeterminate ? undefined : Math.min(Math.max(value, 0), safeMax)}
        aria-valuetext={indeterminate ? undefined : (valueText ?? `${String(percent)}%`)}
        aria-busy={indeterminate || undefined}
        className={cn(
          "relative w-full overflow-hidden rounded-pill bg-neutral-150",
          // Forced colours drop both fills: outline the track, paint the bar in Highlight.
          "forced-colors:outline-1 forced-colors:outline-offset-1",
          PROGRESS_HEIGHT[size],
        )}
      >
        {indeterminate ? (
          <div
            ref={barRef}
            className="absolute inset-y-0 left-0 w-2/5 rounded-pill bg-brand-600 forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none"
            // Starts centred so the bar reads as "working" before hydration.
            // An inline transform (not a translate utility) so the animation
            // replaces it rather than adding to it.
            style={{ transform: "translateX(75%)" }}
          />
        ) : (
          <div
            className="h-full rounded-pill bg-brand-600 transition-[width] duration-(--duration-slow) ease-(--ease-standard) forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none"
            style={{ width: `${String(percent)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Tooltip
 * ------------------------------------------------------------------------- */

// Lets a Tooltip know it sits inside a shared TooltipProvider; standalone
// tooltips bring their own so they work anywhere.
const TooltipScope = createContext(false);

export interface TooltipProviderProps {
  children: ReactNode;
  /** Hover delay before a tooltip opens. Default 300 ms. */
  delayDuration?: number;
  /** Moving between triggers within this window skips the delay. */
  skipDelayDuration?: number;
}

/** Shares one open delay across many tooltips (e.g. a toolbar or an app shell). */
export function TooltipProvider({
  children,
  delayDuration = 300,
  skipDelayDuration = 200,
}: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      <TooltipScope.Provider value={true}>{children}</TooltipScope.Provider>
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  /** The tooltip text. Keep it short; it is supplementary, never essential. */
  content: ReactNode;
  /** The trigger: one focusable element (a Button, IconButton or link). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Overrides the provider's 300 ms delay for this tooltip. */
  delayDuration?: number;
  className?: string;
}

/** A small navy label for an icon or truncated control, after a 300 ms hover or on focus. */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 6,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration,
  className,
}: TooltipProps) {
  const scoped = useContext(TooltipScope);
  const root = (
    <TooltipPrimitive.Root
      {...(open !== undefined ? { open } : {})}
      {...(defaultOpen !== undefined ? { defaultOpen } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      {...(delayDuration !== undefined ? { delayDuration } : {})}
    >
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cn(
            "z-(--z-popover) max-w-64 select-none rounded-sm bg-navy-900 px-2 py-1 text-caption font-medium text-white forced-colors:border",
            "shadow-[0_6px_16px_-6px_rgb(11_21_48/0.35)] origin-(--radix-tooltip-content-transform-origin)",
            POP_ENTER,
            POP_EXIT,
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow width={10} height={5} className="fill-navy-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  if (scoped) return root;
  return <TooltipPrimitive.Provider delayDuration={300}>{root}</TooltipPrimitive.Provider>;
}
