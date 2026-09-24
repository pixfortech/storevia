"use client";
// Feedback controls: Progress, Tooltip, Popover and toasts (Spinner lives in spinner.tsx)
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
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as ToastPrimitive from "@radix-ui/react-toast";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Icon } from "./icons";
import { registerControlledLayer } from "./overlays-focus";

/* ----------------------------------------------------------------------------
 * Shared motion classes
 * ------------------------------------------------------------------------- */

const POP_ENTER =
  "data-[state=open]:animate-[scale-in_var(--duration-base)_var(--ease-emphasised)] " +
  "data-[state=delayed-open]:animate-[scale-in_var(--duration-fast)_var(--ease-emphasised)] " +
  "data-[state=instant-open]:animate-[scale-in_var(--duration-fast)_var(--ease-emphasised)]";
const POP_EXIT =
  "data-[state=closed]:animate-[fade-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]";

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

/* ----------------------------------------------------------------------------
 * Toasts
 * ------------------------------------------------------------------------- */

export type ToastTone = "neutral" | "success" | "warning" | "danger";

const TOAST_ICON: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  neutral: { icon: Info, className: "text-ink-faint" },
  success: { icon: CircleCheck, className: "text-success-600" },
  warning: { icon: TriangleAlert, className: "text-warning-600" },
  danger: { icon: CircleAlert, className: "text-danger-600" },
};

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** How to do the same thing without the toast (read by screen readers). Defaults to the label. */
  altText?: string;
}

export interface ToastProps extends Omit<
  ComponentPropsWithRef<typeof ToastPrimitive.Root>,
  "title" | "children"
> {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: ToastAction | undefined;
}

/** One toast. Usually created through useToast(); usable directly with open/onOpenChange. */
export function Toast({
  title,
  description,
  tone = "neutral",
  action,
  className,
  type,
  ...props
}: ToastProps) {
  const { icon, className: iconClass } = TOAST_ICON[tone];
  return (
    <ToastPrimitive.Root
      // Errors interrupt (assertive); everything else waits its turn.
      type={type ?? (tone === "danger" ? "foreground" : "background")}
      className={cn(
        "pointer-events-auto relative flex w-full items-start gap-3 rounded-card border border-line bg-surface py-3.5 pr-11 pl-4 shadow-popover",
        "data-[state=open]:animate-rise-in",
        "data-[state=closed]:animate-[fade-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]",
        "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)",
        "data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[translate] data-[swipe=cancel]:duration-(--duration-base)",
        "data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x)",
        className,
      )}
      {...props}
    >
      <Icon icon={icon} size="md" className={cn("mt-px", iconClass)} />
      <div className="min-w-0 flex-1">
        <ToastPrimitive.Title className="text-body-sm font-medium text-ink">
          {title}
        </ToastPrimitive.Title>
        {description ? (
          <ToastPrimitive.Description className="mt-0.5 text-body-sm text-ink-muted">
            {description}
          </ToastPrimitive.Description>
        ) : null}
        {action ? (
          <ToastPrimitive.Action
            altText={action.altText ?? action.label}
            onClick={action.onClick}
            className={cn(
              "mt-3 inline-flex h-8 items-center rounded-control border border-line-strong bg-surface px-3 text-body-sm font-medium text-ink shadow-xs",
              "transition-colors duration-(--duration-fast) hover:bg-subtle",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            )}
          >
            {action.label}
          </ToastPrimitive.Action>
        ) : null}
      </div>
      <ToastPrimitive.Close
        aria-label="Dismiss notification"
        className={cn(
          "absolute top-2.5 right-2.5 inline-flex size-7 items-center justify-center rounded-sm text-ink-faint",
          "transition-colors duration-(--duration-fast) hover:bg-muted hover:text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <Icon icon={X} size="sm" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: ToastAction;
  /** Milliseconds before it closes itself. Hover and focus pause the timer. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  readonly id: string;
  open: boolean;
}

interface ToastContextValue {
  toasts: readonly ToastRecord[];
  toast: (options: ToastOptions) => string;
  dismiss: (id?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Enough to show a burst without burying the page; older toasts drop off.
const MAX_TOASTS = 3;
// Longer than the exit animation, so a closed toast finishes fading first.
const REMOVE_DELAY = 400;

export interface ToastProviderProps {
  children: ReactNode;
  /** Default time on screen. 5 s. */
  duration?: number;
  /** Names the notifications region for screen readers. */
  label?: string;
}

/** Holds the toast queue. Render <Toaster /> once inside it; call useToast() anywhere below. */
export function ToastProvider({
  children,
  duration = 5000,
  label = "Notifications",
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    counter.current += 1;
    const id = `toast-${String(counter.current)}`;
    setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { ...options, id, open: true }]);
    return id;
  }, []);

  const dismiss = useCallback((id?: string) => {
    setToasts((current) =>
      current.map((item) => (id === undefined || item.id === id ? { ...item, open: false } : item)),
    );
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((current) => current.filter((item) => item.open));
    }, REMOVE_DELAY);
    timers.current.add(timer);
  }, []);

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider duration={duration} swipeDirection="right" label={label}>
        {children}
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function useToastContext(caller: string): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error(`${caller} must be used inside <ToastProvider>.`);
  return context;
}

/** Shows a toast: `const { toast } = useToast(); toast({ tone: "success", title: "Saved" })`. */
export function useToast(): Pick<ToastContextValue, "toast" | "dismiss"> {
  const { toast, dismiss } = useToastContext("useToast");
  return useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
}

/**
 * Renders the queued toasts and their viewport: bottom-right on desktop,
 * bottom-centre above the safe area on phones.
 */
export function Toaster({ className }: { className?: string }) {
  const { toasts, dismiss } = useToastContext("Toaster");
  return (
    <>
      {toasts.map(({ id, open, duration, ...options }) => (
        <Toast
          key={id}
          open={open}
          {...(duration !== undefined ? { duration } : {})}
          onOpenChange={(next) => {
            if (!next) dismiss(id);
          }}
          {...options}
        />
      ))}
      <ToastPrimitive.Viewport
        className={cn(
          "fixed inset-x-0 bottom-0 z-(--z-toast) m-0 flex list-none flex-col items-stretch gap-2 outline-none",
          "mx-auto w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
          "sm:right-0 sm:left-auto sm:mx-0 sm:w-[26rem] sm:max-w-none sm:p-6",
          className,
        )}
      />
    </>
  );
}
