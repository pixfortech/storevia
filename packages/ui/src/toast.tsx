"use client";

// Toasts (docs/design/design-plan.md §5, §7): ToastProvider, useToast and
// Toaster on Radix Toast, which supplies announcements, swipe and focus
// management. Kept apart from feedback.tsx so tooltips and popovers don't
// ship toast code.
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

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
